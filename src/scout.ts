/**
 * free-llm-scout — Orchestrator
 * Coordinates discovery → validation → emission
 */

import { ModelInfo, ValidationResult, ValidationCheck, ScoutConfig, DiscoverySource, Validator, Emitter, EmitOptions } from './types.js';
import { loadEnv, computeScore, writeJson, getProjectRoot } from './utils.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenRouterDiscovery } from './discover/openrouter.js';
import { SiliconFlowDiscovery } from './discover/siliconflow.js';
import { ModelScopeDiscovery } from './discover/modelscope.js';
import { BailianDiscovery } from './discover/bailian.js';
import { ZhipuDiscovery } from './discover/zhipu.js';
import { MoonshotDiscovery } from './discover/moonshot.js';
import { HuggingFaceDiscovery } from './discover/huggingface.js';
import { CustomSeedsDiscovery } from './discover/custom-seeds.js';
import { CompatValidator } from './validate/compat.js';
import { ToolCallingValidator } from './validate/tool-calling.js';
import { StructuredOutputValidator } from './validate/structured-output.js';
import { ContextWindowValidator } from './validate/context-window.js';
import { RateLimitValidator } from './validate/rate-limit.js';
import { DshFleetEmitter } from './emitters/dsh-fleet.js';
import { RegistryJsonEmitter } from './emitters/registry-json.js';
import { LeaderboardEmitter } from './emitters/leaderboard.js';
import pLimit from 'p-limit';
import ora from 'ora';

const SOURCE_REGISTRY: Record<string, () => DiscoverySource> = {
  openrouter: () => new OpenRouterDiscovery(),
  siliconflow: () => new SiliconFlowDiscovery(),
  modelscope: () => new ModelScopeDiscovery(),
  bailian: () => new BailianDiscovery(),
  zhipu: () => new ZhipuDiscovery(),
  moonshot: () => new MoonshotDiscovery(),
  huggingface: () => new HuggingFaceDiscovery(),
  'custom-seeds': () => new CustomSeedsDiscovery(),
};

const VALIDATOR_REGISTRY: Record<string, () => Validator> = {
  'openai-compat': () => new CompatValidator(),
  'tool-calling': () => new ToolCallingValidator(),
  'structured-output': () => new StructuredOutputValidator(),
  'context-window': () => new ContextWindowValidator(),
  'rate-limit': () => new RateLimitValidator(),
};

const EMITTER_REGISTRY: Record<string, () => Emitter> = {
  'dsh-fleet': () => new DshFleetEmitter(),
  'registry-json': () => new RegistryJsonEmitter(),
  'leaderboard': () => new LeaderboardEmitter(),
};

const DEFAULT_CONFIG: ScoutConfig = {
  sources: ['openrouter', 'custom-seeds'],
  // Budget: OpenRouter free tier allows ~50 requests/day (account-wide).
  // Default trio costs ~4 requests per model; --max-models caps the total.
  // `context-window` and `rate-limit` are opt-in — they burn 5-15 requests
  // per model and will exhaust a free key's daily budget in one run.
  validators: ['openai-compat', 'tool-calling', 'structured-output'],
  emitters: ['dsh-fleet', 'registry-json', 'leaderboard'],
  concurrency: 3,
  timeoutMs: 60000,
  minScore: 60,
  maxFleetSize: 15,
  maxModels: 12,
  providerPriority: ['openrouter', 'siliconflow', 'modelscope', 'bailian', 'zhipu', 'deepseek-account'],
  outputDir: './data',
};

export class Scout {
  private config: ScoutConfig;
  private sources: DiscoverySource[];
  private validators: Validator[];
  private emitters: Emitter[];
  /** Composite ids (`provider/modelId`) confirmed dead in past runs. */
  private deadModels = new Set<string>();

  /** Failure signatures that mean "this model is gone, don't spend requests on it again". */
  private static readonly DEAD_PATTERNS = [
    'No endpoints found',
    'unavailable for free',
    'only available on agentic harnesses',
    'not available in your region',
  ];

  private static isDeadDetail(details?: string): boolean {
    return typeof details === 'string' && Scout.DEAD_PATTERNS.some(p => details.includes(p));
  }

  private get deadFile(): string {
    // Lives in the repo (not dist/) so the cache survives CI runs and is
    // committed by the daily auto-PR — each day starts with yesterday's knowledge.
    return resolve(getProjectRoot(), 'data/dead-models.json');
  }

  private loadDeadModels(): void {
    try {
      if (existsSync(this.deadFile)) {
        const parsed = JSON.parse(readFileSync(this.deadFile, 'utf8')) as { dead?: string[] };
        for (const id of parsed.dead ?? []) this.deadModels.add(id);
      }
    } catch {
      /* a corrupt cache costs a few extra probes, nothing more */
    }
  }

  private detectNewDead(results: ValidationResult[]): void {
    for (const r of results) {
      if (r.passed) continue;
      const compat = r.checks.find(c => c.name === 'openai-compat');
      if (compat && !compat.passed && Scout.isDeadDetail(compat.details)) {
        this.deadModels.add(`${r.provider}/${r.modelId}`);
      }
    }
  }

  private saveDeadModels(): void {
    if (this.deadModels.size === 0) return;
    writeJson(this.deadFile, {
      updatedAt: new Date().toISOString(),
      note: 'Models confirmed delisted/blocked. Delete a line to re-probe it on the next run.',
      dead: [...this.deadModels].sort(),
    });
  }

  constructor(config: Partial<ScoutConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    loadEnv();

    this.sources = this.config.sources.map(name => {
      const factory = SOURCE_REGISTRY[name];
      if (!factory) throw new Error(`Unknown source: ${name}`);
      return factory();
    });

    this.validators = this.config.validators.map(name => {
      const factory = VALIDATOR_REGISTRY[name];
      if (!factory) throw new Error(`Unknown validator: ${name}`);
      return factory();
    });

    this.emitters = this.config.emitters.map(name => {
      const factory = EMITTER_REGISTRY[name];
      if (!factory) throw new Error(`Unknown emitter: ${name}`);
      return factory();
    });
  }

  async run(): Promise<void> {
    const spinner = ora('🚀 free-llm-scout starting...').start();

    try {
      // 0. Load the dead-model cache: models confirmed delisted/region-blocked
      // in a previous run. Re-probing them burns scarce free-tier requests.
      this.loadDeadModels();

      // 1. Discover models from all sources
      spinner.text = '🔍 Discovering models from sources...';
      const discovered = await this.discoverAll();
      const alive = discovered.filter(m => !this.deadModels.has(m.id));
      const deadSkipped = discovered.length - alive.length;
      const allModels = this.capModels(alive);
      if (deadSkipped > 0) {
        spinner.succeed(`Discovered ${discovered.length} models — skipping ${deadSkipped} known-dead`);
      } else if (allModels.length < discovered.length) {
        spinner.succeed(`Discovered ${discovered.length} models — validating top ${allModels.length} (quota budget)`);
      } else {
        spinner.succeed(`Discovered ${allModels.length} models from ${this.sources.length} sources`);
      }

      // 2. Validate models in parallel
      spinner.text = '🧪 Validating models...';
      const results = await this.validateAll(allModels);
      const passed = results.filter(r => r.passed).length;
      spinner.succeed(`Validated ${results.length} models — ${passed} passed (score ≥ ${this.config.minScore})`);

      // 2.5. Persist newly-confirmed dead models so future runs skip them.
      this.detectNewDead(results);
      this.saveDeadModels();

      // 3. Emit outputs
      spinner.text = '📦 Emitting outputs...';
      const emitOptions: EmitOptions = {
        outDir: this.config.outputDir,
        dshFleetPath: this.config.dshFleetPath,
        minScore: this.config.minScore,
        maxFleetSize: this.config.maxFleetSize,
        providerPriority: this.config.providerPriority,
      };
      await this.emitAll(results, allModels, emitOptions);
      spinner.succeed('Outputs emitted');

      // Summary
      console.log('\n📊 Summary:');
      console.log(`  Total discovered: ${allModels.length}`);
      console.log(`  Validated: ${results.length}`);
      console.log(`  Passed (score ≥ ${this.config.minScore}): ${passed}`);
      console.log(`  Output dir: ${this.config.outputDir}`);

      // Save raw results for debugging
      writeJson(`${this.config.outputDir}/raw-results.json`, {
        timestamp: new Date().toISOString(),
        config: this.config,
        models: allModels,
        results,
      });

    } catch (error) {
      spinner.fail('Scout failed');
      throw error;
    }
  }

  private async discoverAll(): Promise<ModelInfo[]> {
    const allModels: ModelInfo[] = [];
    const seen = new Set<string>();

    for (const source of this.sources) {
      const sourceSpinner = ora(`  📡 ${source.name}...`).start();
      try {
        const models = await source.fetchModels();
        let added = 0;
        for (const m of models) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            allModels.push(m);
            added++;
          }
        }
        sourceSpinner.succeed(`  📡 ${source.name}: ${added} new models (${models.length} total)`);
      } catch (error) {
        sourceSpinner.fail(`  📡 ${source.name} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return allModels;
  }

  /**
   * Cap the validation scope to the daily request budget. Free tiers allow
   * ~50 requests/day (OpenRouter, account-wide, shared with daily agent use),
   * and each validated model costs ~4 requests — so an uncapped run burns a
   * whole day's quota on discovery noise. Ranked: likely tool-callers first,
   * then by claimed context window.
   */
  private capModels(models: ModelInfo[]): ModelInfo[] {
    const max = this.config.maxModels ?? 0;
    if (max <= 0 || models.length <= max) return models;
    return [...models]
      .sort((a, b) => {
        const ta = a.supportsToolCalling ? 1 : 0;
        const tb = b.supportsToolCalling ? 1 : 0;
        if (ta !== tb) return tb - ta;
        return b.contextWindow - a.contextWindow;
      })
      .slice(0, max);
  }

  private async validateAll(models: ModelInfo[]): Promise<ValidationResult[]> {
    const limit = pLimit(this.config.concurrency);
    const results: ValidationResult[] = [];

    // Group models by provider to reuse API keys / base URLs
    const byProvider = new Map<string, ModelInfo[]>();
    for (const m of models) {
      if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
      byProvider.get(m.provider)!.push(m);
    }

    for (const [provider, providerModels] of byProvider) {
      const apiKey = this.getApiKey(provider);
      const baseURL = this.getBaseURL(provider);

      if (!apiKey) {
        console.warn(`  ⚠️  No API key for ${provider}, skipping validation`);
        continue;
      }

      // Validate each model with all validators
      const validationPromises = providerModels.map(model =>
        limit(async () => {
          const checks: ValidationCheck[] = [];
          for (const validator of this.validators) {
            try {
              const check = await validator.validate(model, apiKey, baseURL);
              checks.push(check);
            } catch (error) {
              checks.push({
                name: validator.name,
                passed: false,
                score: 0,
                details: `Validator threw: ${error instanceof Error ? error.message : String(error)}`,
              });
            }
          }
          const score = computeScore(checks);
          // Critical checks gate the pass; the rest only move the score.
          // A model that aces tool-calling but hiccups on one probe should
          // still be fleet-eligible — the free tier is noisy by nature.
          const CRITICAL_CHECKS = new Set(['openai-compat', 'tool-calling']);
          const criticalFailed = checks.some(c => CRITICAL_CHECKS.has(c.name) && !c.passed);
          const passed = !criticalFailed && score >= this.config.minScore;
          return {
            modelId: model.modelId,
            provider: model.provider,
            passed,
            score,
            checks,
            validatedAt: new Date().toISOString(),
          } as ValidationResult;
        })
      );

      const providerResults = await Promise.all(validationPromises);
      results.push(...providerResults);
    }

    return results;
  }

  private async emitAll(results: ValidationResult[], models: ModelInfo[], options: EmitOptions): Promise<void> {
    for (const emitter of this.emitters) {
      try {
        const msg = await emitter.emit(results, models, options);
        console.log(`  ✅ ${emitter.name}: ${msg}`);
      } catch (error) {
        console.error(`  ❌ ${emitter.name} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private getApiKey(provider: string): string {
    const envMap: Record<string, string> = {
      openrouter: 'OPENROUTER_API_KEY',
      siliconflow: 'SILICONFLOW_API_KEY',
      modelscope: 'MODELSCOPE_API_KEY',
      bailian: 'BAILIAN_API_KEY',
      zhipu: 'ZHIPU_API_KEY',
      moonshot: 'MOONSHOT_API_KEY',
      huggingface: 'HF_API_KEY',
      'deepseek-account': 'DEEPSEEK_API_KEY',
    };
    return process.env[envMap[provider]] || '';
  }

  private getBaseURL(provider: string): string {
    const urlMap: Record<string, string> = {
      openrouter: 'https://openrouter.ai/api/v1',
      siliconflow: 'https://api.siliconflow.cn/v1',
      modelscope: 'https://api-inference.modelscope.cn/v1',
      bailian: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      moonshot: 'https://api.moonshot.cn/v1',
      huggingface: 'https://api-inference.huggingface.co',
      'deepseek-account': 'https://api.deepseek.com/v1',
    };
    return urlMap[provider] || '';
  }
}
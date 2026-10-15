/**
 * free-llm-scout — CLI Entry Point
 */

import { Command } from 'commander';
import { Scout } from './scout.js';
import { loadEnv } from './utils.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('scout')
  .description('free-llm-scout: Automated free LLM discovery, validation, and fleet config generator')
  .version(getVersion())
  .option('-s, --sources <names>', 'Comma-separated discovery sources (openrouter,github-models,siliconflow,modelscope,bailian,zhipu,moonshot,huggingface,custom-seeds)', 'openrouter,github-models,custom-seeds')
  .option('-v, --validators <names>', 'Comma-separated validators (openai-compat,tool-calling,structured-output | opt-in: context-window,rate-limit)', 'openai-compat,tool-calling,structured-output')
  .option('-e, --emitters <names>', 'Comma-separated emitters (dsh-fleet,registry-json,leaderboard)', 'dsh-fleet,registry-json,leaderboard')
  .option('-c, --concurrency <n>', 'Max concurrent validations', '3')
  .option('-t, --timeout <ms>', 'Request timeout in ms', '60000')
  .option('--min-score <n>', 'Minimum score to pass (0-100)', '60')
  .option('--max-fleet <n>', 'Maximum fleet size', '15')
  .option('--max-models <n>', 'Cap models validated per run (0 = unlimited). Free tiers allow ~50 req/day; each model costs ~4', '12')
  .option('-o, --output <dir>', 'Output directory (tracked in git so the daily PR can commit it)', './data')
  .option('--dsh-fleet-path <path>', 'Path to DSH cordis.patch.yml for auto-patching')
  .option('--provider-priority <list>', 'Comma-separated provider priority for fleet ordering', 'openrouter,siliconflow,modelscope,bailian,zhipu,deepseek-account')
  .action(async (options) => {
    loadEnv();

    const config = {
      sources: options.sources.split(',').map((s: string) => s.trim()),
      validators: options.validators.split(',').map((s: string) => s.trim()),
      emitters: options.emitters.split(',').map((s: string) => s.trim()),
      concurrency: parseInt(options.concurrency, 10),
      timeoutMs: parseInt(options.timeout, 10),
      minScore: parseInt(options.minScore, 10),
      maxFleetSize: parseInt(options.maxFleet, 10),
      maxModels: parseInt(options.maxModels, 10),
      outputDir: options.output,
      dshFleetPath: options.dshFleetPath,
      providerPriority: options.providerPriority.split(',').map((s: string) => s.trim()),
    };

    const scout = new Scout(config);
    await scout.run();
  });

program
  .command('list-sources')
  .description('List available discovery sources')
  .action(() => {
    console.log('Available discovery sources:');
    console.log('  openrouter      - OpenRouter free models (requires OPENROUTER_API_KEY)');
    console.log('  siliconflow     - SiliconFlow (requires SILICONFLOW_API_KEY)');
    console.log('  modelscope      - ModelScope (requires MODELSCOPE_API_KEY)');
    console.log('  bailian         - Alibaba Bailian (requires BAILIAN_API_KEY)');
    console.log('  zhipu           - Zhipu AI (requires ZHIPU_API_KEY)');
    console.log('  moonshot        - Moonshot AI (requires MOONSHOT_API_KEY)');
    console.log('  huggingface     - HuggingFace Inference API (requires HF_API_KEY)');
    console.log('  custom-seeds    - Built-in curated seed models (no key needed)');
  });

program
  .command('list-validators')
  .description('List available validators')
  .action(() => {
    console.log('Available validators:');
    console.log('  openai-compat     - OpenAI API compatibility check');
    console.log('  tool-calling      - Function/tool calling reliability (CRITICAL for DSH)');
    console.log('  structured-output - JSON mode / response_format support');
    console.log('  context-window    - Actual vs claimed context window');
    console.log('  rate-limit        - RPM/TPM limits and latency profile');
  });

program
  .command('list-emitters')
  .description('List available emitters')
  .action(() => {
    console.log('Available emitters:');
    console.log('  dsh-fleet       - DSH model-fleet chain YAML (primary)');
    console.log('  registry-json   - Full machine-readable registry');
    console.log('  leaderboard     - Markdown leaderboard for README');
  });

program.parse();
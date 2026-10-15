/**
 * free-llm-scout — GitHub Models Discovery Adapter
 *
 * GitHub gives every account free access to its Models catalog (GPT-4.1,
 * Llama-4, Mistral, DeepSeek-R1, ...) through an OpenAI-compatible endpoint,
 * authenticated with a plain GitHub Personal Access Token carrying the
 * `models:read` scope:
 *   create at https://github.com/settings/tokens
 *   base URL  https://models.github.ai/inference
 *
 * IMPORTANT: never name the env var `GITHUB_TOKEN` — GitHub Actions reserves
 * that name and would overwrite the user's PAT inside CI.
 *
 * There is no public catalog JSON endpoint (the /catalog paths answer a bare
 * health-check "OK"), so discovery ships a curated static list. Slugs drift
 * occasionally — that is fine: validation proves what actually works, and
 * stale slugs land in the dead-model cache instead of burning daily requests.
 *
 * Free-tier rate limits are LOW (~15 req/min), which suits the scout's small
 * per-model budget, and it is a fully independent line from OpenRouter —
 * exactly the diversification a model-fleet wants.
 */

import { ModelInfo, DiscoverySource } from '../types.js';

/** OpenAI-compatible base; validators append `/chat/completions`. */
export const GITHUB_MODELS_BASE_URL = 'https://models.github.ai/inference';

interface CatalogEntry {
  modelId: string;
  contextWindow: number;
}

/** Curated chat models from https://github.com/marketplace/models (2026-10). */
const CATALOG: CatalogEntry[] = [
  { modelId: 'openai/gpt-4.1-mini', contextWindow: 1_000_000 },
  { modelId: 'openai/gpt-4.1-nano', contextWindow: 1_000_000 },
  { modelId: 'openai/gpt-4.1', contextWindow: 1_000_000 },
  { modelId: 'openai/gpt-4o-mini', contextWindow: 128_000 },
  { modelId: 'openai/gpt-4o', contextWindow: 128_000 },
  { modelId: 'openai/o4-mini', contextWindow: 200_000 },
  { modelId: 'meta/Llama-4-Scout-17B-16E-Instruct', contextWindow: 512_000 },
  { modelId: 'meta/Llama-4-Maverick-17B-128E-Instruct-FP8', contextWindow: 512_000 },
  { modelId: 'meta/Llama-3.3-70B-Instruct', contextWindow: 128_000 },
  { modelId: 'mistral-ai/Mistral-Small-24B-Instruct-2501', contextWindow: 128_000 },
  { modelId: 'mistral-ai/Mistral-Nemo', contextWindow: 128_000 },
  { modelId: 'mistral-ai/Codestral-2501', contextWindow: 256_000 },
  { modelId: 'cohere/cohere-command-r-plus-08-2024', contextWindow: 128_000 },
  { modelId: 'cohere/cohere-command-r08-2024', contextWindow: 128_000 },
  { modelId: 'xai/grok-3-mini', contextWindow: 131_072 },
  { modelId: 'deepseek/DeepSeek-V3-0324', contextWindow: 128_000 },
  { modelId: 'deepseek/DeepSeek-R1', contextWindow: 128_000 },
  { modelId: 'microsoft/MAI-DS-R1', contextWindow: 128_000 },
  { modelId: 'microsoft/Phi-4', contextWindow: 16_384 },
  { modelId: 'microsoft/Phi-4-mini-instruct', contextWindow: 128_000 },
];

const TOOL_CALLING_NO = ['deepseek-r1', 'mai-ds-r1', 'o1', 'o3', 'o4-mini', 'phi-3', 'phi-4', 'embed'];

function inferToolCalling(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (TOOL_CALLING_NO.some(k => id.includes(k))) return false;
  // GPT-4.x, Llama-4, Mistral, Command-R, Grok all handle OpenAI-style tools.
  return true;
}

export class GitHubModelsDiscovery implements DiscoverySource {
  name = 'github-models';

  async validateKey(): Promise<boolean> {
    // Discovery is static; key validity is proven by the validators later.
    return true;
  }

  async fetchModels(): Promise<ModelInfo[]> {
    const now = new Date().toISOString();
    return CATALOG.map(({ modelId, contextWindow }) => ({
      id: `github-models/${modelId}`,
      provider: 'github-models',
      modelId,
      name: `GitHub Models: ${modelId.split('/').pop() ?? modelId}`,
      contextWindow,
      maxTokens: Math.min(65536, Math.floor(contextWindow * 0.5)),
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0,
      priceOutput: 0,
      supportsToolCalling: inferToolCalling(modelId),
      supportsStructuredOutput: inferToolCalling(modelId),
      discoveredAt: now,
      raw: { source: 'curated-catalog', note: 'GitHub Models free tier — rate limits ~15 req/min' },
    }));
  }
}
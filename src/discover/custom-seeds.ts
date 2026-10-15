/**
 * free-llm-scout — Custom Seeds Discovery Adapter
 * Static list of known good free models as fallback/seeds
 */

import { ModelInfo, DiscoverySource } from '../types.js';

const SEED_MODELS: Omit<ModelInfo, 'discoveredAt'>[] = [
  // OpenRouter free (verified tool calling)
  // NOTE: qwen3.8-27b:free (now paid), apodex-1.1-mini:free (404 no endpoints),
  // ling-3.0-flash-sante:free (404), stealth/space-bunny-alpha (404) were
  // confirmed dead 2026-10-14 and removed — do not re-add without re-probing.
  { id: 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', provider: 'openrouter', modelId: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra (free)', contextWindow: 1_000_000, maxTokens: 65536, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/nvidia/nemotron-3.5-lightning:free', provider: 'openrouter', modelId: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (free)', contextWindow: 1_000_000, maxTokens: 65536, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free', provider: 'openrouter', modelId: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super (free)', contextWindow: 262_144, maxTokens: 65536, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/cohere/north-mini-code:free', provider: 'openrouter', modelId: 'cohere/north-mini-code:free', name: 'North Mini Code (free)', contextWindow: 256_000, maxTokens: 64000, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/poolside/laguna-s-2.1:free', provider: 'openrouter', modelId: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1 (free)', contextWindow: 262_144, maxTokens: 32768, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/dots-studio/dots-3-note-preview:free', provider: 'openrouter', modelId: 'dots-studio/dots-3-note-preview:free', name: 'Dots 3 Note Preview (free)', contextWindow: 512_000, maxTokens: 65536, inputModalities: ['text', 'image'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', provider: 'openrouter', modelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron 3 Nano Omni (free)', contextWindow: 256_000, maxTokens: 65536, inputModalities: ['text', 'image'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/inclusionai/ling-3.1-flash', provider: 'openrouter', modelId: 'inclusionai/ling-3.1-flash', name: 'Ling 3.1 Flash (free)', contextWindow: 262_144, maxTokens: 32768, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
  { id: 'openrouter/openrouter/free', provider: 'openrouter', modelId: 'openrouter/free', name: 'OpenRouter Free Router', contextWindow: 200_000, maxTokens: 32768, inputModalities: ['text'], outputModalities: ['text'], priceInput: 0, priceOutput: 0, supportsToolCalling: true, supportsStructuredOutput: true },
];

export class CustomSeedsDiscovery implements DiscoverySource {
  name = 'custom-seeds';

  async validateKey(): Promise<boolean> {
    return true; // No key needed
  }

  async fetchModels(): Promise<ModelInfo[]> {
    const now = new Date().toISOString();
    return SEED_MODELS.map(m => ({ ...m, discoveredAt: now }));
  }
}
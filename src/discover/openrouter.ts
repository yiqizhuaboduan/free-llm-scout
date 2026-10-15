/**
 * free-llm-scout — OpenRouter Discovery Adapter
 * Fetches all models from OpenRouter API, filters free ones, normalizes to ModelInfo.
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export class OpenRouterDiscovery implements DiscoverySource {
  name = 'openrouter';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
  }

  async validateKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const resp = await withTimeout(
        fetch(OPENROUTER_MODELS_URL, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        }),
        10000
      );
      return resp.ok;
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY not set');
    }

    const resp = await withTimeout(
      fetch(OPENROUTER_MODELS_URL, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
      }),
      15000
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenRouter API error: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { data: OpenRouterModel[] };
    const now = new Date().toISOString();

    return data.data
      .filter(m => this.isFreeModel(m))
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeModel(model: OpenRouterModel): boolean {
    // Free models have pricing = 0 or "free" in id
    const pricing = model.pricing;
    const isFreePricing = pricing &&
      (parseFloat(pricing.prompt) === 0 || pricing.prompt === '0') &&
      (parseFloat(pricing.completion) === 0 || pricing.completion === '0');
    const isFreeId = model.id.includes(':free') || model.id.endsWith('-free');
    return isFreePricing || isFreeId;
  }

  private normalizeModel(model: OpenRouterModel, discoveredAt: string): ModelInfo {
    const pricing = model.pricing || { prompt: '0', completion: '0' };
    const contextWindow = model.context_length || 4096;
    const maxTokens = Math.min(65536, Math.floor(contextWindow * 0.5)); // conservative

    return {
      id: `openrouter/${model.id}`,
      provider: 'openrouter',
      modelId: model.id,
      name: model.name || model.id,
      contextWindow,
      maxTokens,
      inputModalities: model.architecture?.input_modalities || ['text'],
      outputModalities: model.architecture?.output_modalities || ['text'],
      priceInput: parseFloat(pricing.prompt) * 1_000_000,
      priceOutput: parseFloat(pricing.completion) * 1_000_000,
      supportsToolCalling: this.inferToolCalling(model),
      supportsStructuredOutput: this.inferStructuredOutput(model),
      discoveredAt,
      raw: {
        description: model.description,
        topology: model.topology,
        architecture: model.architecture,
        perRequestLimits: model.per_request_limits,
      },
    };
  }

  private inferToolCalling(model: OpenRouterModel): boolean {
    // Heuristics: models known to support tool calling
    const toolCallingModels = [
      'nemotron', 'qwen', 'glm', 'deepseek', 'mistral', 'mixtral',
      'llama-3.1', 'llama-3.2', 'command-r', 'cohere', 'north',
      'laguna', 'dots', 'apodex', 'ling', 'space-bunny',
    ];
    const idLower = model.id.toLowerCase();
    return toolCallingModels.some(kw => idLower.includes(kw));
  }

  private inferStructuredOutput(model: OpenRouterModel): boolean {
    // Most tool-calling models also support structured output
    return this.inferToolCalling(model);
  }
}

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
    instruct_type?: string;
  };
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
  };
  topology?: {
    modality?: string;
  };
  per_request_limits?: Record<string, number>;
}
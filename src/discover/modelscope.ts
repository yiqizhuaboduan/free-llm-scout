/**
 * free-llm-scout — ModelScope Discovery Adapter
 * ModelScope (魔搭社区) - Alibaba's model hub with free inference
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const MODELSCOPE_MODELS_URL = 'https://api-inference.modelscope.cn/v1/models';

export class ModelScopeDiscovery implements DiscoverySource {
  name = 'modelscope';
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string, baseURL = 'https://api-inference.modelscope.cn/v1') {
    this.apiKey = apiKey || process.env.MODELSCOPE_API_KEY || '';
    this.baseURL = baseURL;
  }

  async validateKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const resp = await withTimeout(
        fetch(`${this.baseURL}/models`, {
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
      throw new Error('MODELSCOPE_API_KEY not set');
    }

    const resp = await withTimeout(
      fetch(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
      }),
      15000
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`ModelScope API error: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { data: ModelScopeModel[] };
    const now = new Date().toISOString();

    return data.data
      .filter(m => this.isFreeModel(m))
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeModel(model: ModelScopeModel): boolean {
    // ModelScope free models typically have no pricing or price = 0
    return !model.price || (model.price.input === 0 && model.price.output === 0);
  }

  private normalizeModel(model: ModelScopeModel, discoveredAt: string): ModelInfo {
    const contextWindow = model.context_length || 4096;
    return {
      id: `modelscope/${model.id}`,
      provider: 'modelscope',
      modelId: model.id,
      name: model.name || model.id,
      contextWindow,
      maxTokens: Math.min(65536, Math.floor(contextWindow * 0.5)),
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0,
      priceOutput: 0,
      supportsToolCalling: this.inferToolCalling(model),
      supportsStructuredOutput: this.inferToolCalling(model),
      discoveredAt,
      raw: model,
    };
  }

  private inferToolCalling(model: ModelScopeModel): boolean {
    const toolCallingModels = [
      'qwen', 'glm', 'deepseek', 'llama-3.1', 'llama-3.2',
      'yi', 'chatglm', 'internlm', 'baichuan', 'zhipu',
    ];
    const idLower = model.id.toLowerCase();
    return toolCallingModels.some(kw => idLower.includes(kw));
  }
}

interface ModelScopeModel {
  id: string;
  name?: string;
  object: 'model';
  owned_by: string;
  context_length?: number;
  price?: {
    input: number;
    output: number;
  };
  capabilities?: {
    function_calling?: boolean;
    json_mode?: boolean;
  };
  [key: string]: unknown;
}
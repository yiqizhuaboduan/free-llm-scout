/**
 * free-llm-scout — SiliconFlow Discovery Adapter
 * SiliconFlow (硅基流动) - Chinese free tier provider
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const SILICONFLOW_MODELS_URL = 'https://api.siliconflow.cn/v1/models';

export class SiliconFlowDiscovery implements DiscoverySource {
  name = 'siliconflow';
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string, baseURL = 'https://api.siliconflow.cn/v1') {
    this.apiKey = apiKey || process.env.SILICONFLOW_API_KEY || '';
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
      throw new Error('SILICONFLOW_API_KEY not set');
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
      throw new Error(`SiliconFlow API error: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { data: SiliconFlowModel[] };
    const now = new Date().toISOString();

    return data.data
      .filter(m => this.isFreeModel(m))
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeModel(model: SiliconFlowModel): boolean {
    // SiliconFlow marks free models with price = 0 or specific tags
    return (model.price?.input === 0 || model.price?.input === '0') &&
           (model.price?.output === 0 || model.price?.output === '0');
  }

  private normalizeModel(model: SiliconFlowModel, discoveredAt: string): ModelInfo {
    const contextWindow = model.context_length || 4096;
    return {
      id: `siliconflow/${model.id}`,
      provider: 'siliconflow',
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

  private inferToolCalling(model: SiliconFlowModel): boolean {
    const toolCallingModels = [
      'qwen', 'glm', 'deepseek', 'llama-3.1', 'llama-3.2',
      'yi', 'chatglm', 'internlm', 'baichuan',
    ];
    const idLower = model.id.toLowerCase();
    return toolCallingModels.some(kw => idLower.includes(kw));
  }
}

interface SiliconFlowModel {
  id: string;
  name?: string;
  object: 'model';
  owned_by: string;
  context_length?: number;
  price?: {
    input: number | string;
    output: number | string;
  };
  capabilities?: {
    function_calling?: boolean;
    json_mode?: boolean;
  };
  [key: string]: unknown;
}
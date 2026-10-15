/**
 * free-llm-scout — Bailian (百炼) Discovery Adapter
 * Alibaba Cloud Bailian - Qwen models with free tier
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const BAILIAN_MODELS_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';

export class BailianDiscovery implements DiscoverySource {
  name = 'bailian';
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string, baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1') {
    this.apiKey = apiKey || process.env.BAILIAN_API_KEY || '';
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
      throw new Error('BAILIAN_API_KEY not set');
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
      throw new Error(`Bailian API error: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { data: BailianModel[] };
    const now = new Date().toISOString();

    // Bailian free models: qwen-turbo, qwen-plus (with free quota)
    return data.data
      .filter(m => this.isFreeModel(m))
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeModel(model: BailianModel): boolean {
    // Free tier models on Bailian
    const freeModels = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'];
    return freeModels.some(fm => model.id.includes(fm));
  }

  private normalizeModel(model: BailianModel, discoveredAt: string): ModelInfo {
    const contextWindow = this.getContextWindow(model.id);
    return {
      id: `bailian/${model.id}`,
      provider: 'bailian',
      modelId: model.id,
      name: model.id,
      contextWindow,
      maxTokens: Math.min(65536, Math.floor(contextWindow * 0.5)),
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0, // free tier
      priceOutput: 0,
      supportsToolCalling: this.inferToolCalling(model.id),
      supportsStructuredOutput: true, // Qwen supports JSON mode
      discoveredAt,
      raw: model,
    };
  }

  private getContextWindow(modelId: string): number {
    const windows: Record<string, number> = {
      'qwen-turbo': 1_000_000,
      'qwen-plus': 131_072,
      'qwen-max': 32_768,
      'qwen-long': 10_000_000,
    };
    for (const [key, val] of Object.entries(windows)) {
      if (modelId.includes(key)) return val;
    }
    return 32_768;
  }

  private inferToolCalling(modelId: string): boolean {
    return ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'].some(k => modelId.includes(k));
  }
}

interface BailianModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  [key: string]: unknown;
}
/**
 * free-llm-scout — Zhipu (智谱) Discovery Adapter
 * Zhipu AI - GLM models with free tier
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const ZHIPU_MODELS_URL = 'https://open.bigmodel.cn/api/paas/v4/models';

export class ZhipuDiscovery implements DiscoverySource {
  name = 'zhipu';
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string, baseURL = 'https://open.bigmodel.cn/api/paas/v4') {
    this.apiKey = apiKey || process.env.ZHIPU_API_KEY || '';
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
      throw new Error('ZHIPU_API_KEY not set');
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
      throw new Error(`Zhipu API error: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { data: ZhipuModel[] };
    const now = new Date().toISOString();

    // Zhipu's free tier is the Flash line (2026-10 catalog: glm-5.3-flash /
    // glm-5.3-flashx — the glm-4-flash era is over). Air/turbo are low-price,
    // NOT free, so they stay out of a no-bill fleet.
    return data.data
      .filter(m => this.isFreeModel(m))
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeModel(model: ZhipuModel): boolean {
    return model.id.toLowerCase().includes('flash');
  }

  private normalizeModel(model: ZhipuModel, discoveredAt: string): ModelInfo {
    const contextWindow = this.getContextWindow(model.id);
    return {
      id: `zhipu/${model.id}`,
      provider: 'zhipu',
      modelId: model.id,
      name: model.id,
      contextWindow,
      maxTokens: Math.min(65536, Math.floor(contextWindow * 0.5)),
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0,
      priceOutput: 0,
      supportsToolCalling: this.inferToolCalling(model.id),
      supportsStructuredOutput: true,
      discoveredAt,
      raw: model,
    };
  }

  private getContextWindow(modelId: string): number {
    if (modelId.includes('flash')) return 131072;
    if (modelId.includes('air')) return 131072;
    return 128000;
  }

  private inferToolCalling(modelId: string): boolean {
    return modelId.toLowerCase().includes('flash');
  }
}

interface ZhipuModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  [key: string]: unknown;
}
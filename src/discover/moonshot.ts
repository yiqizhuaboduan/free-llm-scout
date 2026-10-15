/**
 * free-llm-scout — Moonshot (月之暗面) Discovery Adapter
 * Moonshot AI - Kimi models
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const MOONSHOT_MODELS_URL = 'https://api.moonshot.cn/v1/models';

export class MoonshotDiscovery implements DiscoverySource {
  name = 'moonshot';
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string, baseURL = 'https://api.moonshot.cn/v1') {
    this.apiKey = apiKey || process.env.MOONSHOT_API_KEY || '';
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
      throw new Error('MOONSHOT_API_KEY not set');
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
      throw new Error(`Moonshot API error: ${resp.status} ${text}`);
    }

    const data = await resp.json() as { data: MoonshotModel[] };
    const now = new Date().toISOString();

    // Moonshot free tier models
    return data.data
      .filter(m => this.isFreeModel(m))
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeModel(model: MoonshotModel): boolean {
    // Moonshot doesn't have permanent free tier, but has trial credits
    // Include all for now, validation will filter
    return true;
  }

  private normalizeModel(model: MoonshotModel, discoveredAt: string): ModelInfo {
    return {
      id: `moonshot/${model.id}`,
      provider: 'moonshot',
      modelId: model.id,
      name: model.id,
      contextWindow: 128000,
      maxTokens: 65536,
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0, // trial credits
      priceOutput: 0,
      supportsToolCalling: false, // Kimi doesn't support tool calling yet
      supportsStructuredOutput: false,
      discoveredAt,
      raw: model,
    };
  }
}

interface MoonshotModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  [key: string]: unknown;
}
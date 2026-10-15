/**
 * free-llm-scout — HuggingFace Inference API Discovery Adapter
 * HF Inference API - free tier for many open models
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

const HF_MODELS_URL = 'https://huggingface.co/api/models';

export class HuggingFaceDiscovery implements DiscoverySource {
  name = 'huggingface';
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string, baseURL = 'https://api-inference.huggingface.co') {
    this.apiKey = apiKey || process.env.HF_API_KEY || '';
    this.baseURL = baseURL;
  }

  async validateKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const resp = await withTimeout(
        fetch('https://huggingface.co/api/whoami-v2', {
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
      throw new Error('HF_API_KEY not set');
    }

    // Search for models with inference API support and free tier
    const searchParams = new URLSearchParams({
      filter: 'text-generation',
      sort: 'downloads',
      direction: '-1',
      limit: '100',
      config: 'true',
    });

    const resp = await withTimeout(
      fetch(`${HF_MODELS_URL}?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
      }),
      20000
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HuggingFace API error: ${resp.status} ${text}`);
    }

    const models = await resp.json() as HuggingFaceModel[];
    const now = new Date().toISOString();

    // Filter for models likely to have free inference API
    return models
      .filter(m => this.isFreeInferenceModel(m))
      .slice(0, 50) // limit
      .map(m => this.normalizeModel(m, now));
  }

  private isFreeInferenceModel(model: HuggingFaceModel): boolean {
    // Must have inference API enabled
    if (!model.inference || model.inference === 'warm') return false;
    // Prefer smaller models (7B and under) for free tier
    const tags = model.tags || [];
    const isSmall = tags.some(t => ['7b', '8b', '3b', '1b', '2b', '0.5b', '1.5b'].includes(t.toLowerCase()));
    // Known good free models
    const knownFree = ['zephyr', 'mistral', 'zephyr', 'openchat', 'neural-chat', 'starling', 'qwen', 'llama-3'];
    const isKnown = knownFree.some(k => model.id.toLowerCase().includes(k));
    return isSmall || isKnown;
  }

  private normalizeModel(model: HuggingFaceModel, discoveredAt: string): ModelInfo {
    const modelId = model.id.split('/').pop() || model.id;
    return {
      id: `huggingface/${model.id}`,
      provider: 'huggingface',
      modelId: model.id,
      name: modelId,
      contextWindow: 4096, // HF Inference API default
      maxTokens: 2048,
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0,
      priceOutput: 0,
      supportsToolCalling: false, // Most HF models don't support tool calling natively
      supportsStructuredOutput: false,
      discoveredAt,
      raw: { tags: model.tags, downloads: model.downloads, likes: model.likes },
    };
  }
}

interface HuggingFaceModel {
  id: string;
  modelId: string;
  author: string;
  tags: string[];
  downloads: number;
  likes: number;
  inference?: string;
  pipeline_tag?: string;
}
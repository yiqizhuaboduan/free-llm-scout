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
      .filter(m => this.isFreeTier(m))
      .map(m => this.normalizeModel(m, now));
  }

  /**
   * SiliconFlow's /models carries NO pricing, so free-tier membership is
   * inferred by naming conventions (2026-10 catalog):
   *   - `Pro/`  prefix = paid accelerated deployments -> exclude
   *   - `LoRA/` prefix = paid fine-tune endpoints    -> exclude
   *   - flash variants (GLM-5.3-Flash, DeepSeek-V4-Flash, Ling-flash, ...) = free tier
   *   - small chat models (4B/7B/8B/9B/mini) = historically free
   *   - embeddings/rerankers/ASR/TTS/image/video/OCR are not chat -> exclude
   * Validation then proves each candidate really answers.
   */
  private isFreeTier(model: SiliconFlowModel): boolean {
    const id = model.id;
    if (id.startsWith('Pro/') || id.startsWith('LoRA/')) return false;
    const idLower = id.toLowerCase();
    const nonChat = ['embed', 'rerank', 'asr', 'tts', 'voice', 'image', 'video', 'ocr', 'captioner', 'kolors', 'wan2', 'diffusion', 'vl-', '-vl', 'omni'];
    if (nonChat.some(k => idLower.includes(k))) return false;
    if (idLower.includes('flash') || idLower.includes('mini')) return true;
    return /-(4b|7b|8b|9b)(-|\.|$)/i.test(id);
  }

  private normalizeModel(model: SiliconFlowModel, discoveredAt: string): ModelInfo {
    // The catalog does not expose context_length; use a conservative claim
    // (the opt-in context-window validator measures the real one).
    const contextWindow = model.context_length || 131072;
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
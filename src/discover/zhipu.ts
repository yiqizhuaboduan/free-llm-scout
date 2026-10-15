/**
 * free-llm-scout — Zhipu (智谱) Discovery Adapter
 * Zhipu AI — free tier: glm-4-flash / glm-4.5-flash (curated, see fetchModels)
 */

import { ModelInfo, DiscoverySource } from '../types.js';
import { withTimeout } from '../utils.js';

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
    // 2026-10-15 empirically verified (real calls, not the catalog):
    //   glm-4-flash  -> HTTP 200 free      glm-4.5-flash -> HTTP 200 free
    //   glm-5.3-flash / flashx / air / turbo -> error 1113 余额不足 (paid)
    // The /models catalog LISTS only the paid glm-4.5..5.3 line and OMITS the
    // two free flash models entirely, so catalog-based filtering here always
    // yielded zero. The free tier is served from a curated supplement instead;
    // re-verify by hand if Zhipu revises its pricing again.
    const now = new Date().toISOString();
    const FREE_MODELS = [
      { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', contextWindow: 131072 },
      { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash (免费)', contextWindow: 131072 },
    ];
    return FREE_MODELS.map(m => ({
      id: `zhipu/${m.id}`,
      provider: 'zhipu',
      modelId: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      maxTokens: Math.min(65536, Math.floor(m.contextWindow * 0.5)),
      inputModalities: ['text'],
      outputModalities: ['text'],
      priceInput: 0,
      priceOutput: 0,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      discoveredAt: now,
      raw: { source: 'curated-free-tier', note: 'Catalog omits free flash models; verified by live calls 2026-10-15' },
    }));
  }
}
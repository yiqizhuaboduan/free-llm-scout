/**
 * free-llm-scout — Rate Limit / Latency Profiler
 * Measures RPM/TPM limits and latency distribution
 */

import { Validator, ValidationCheck, ModelInfo } from '../types.js';
import { withTimeout } from '../utils.js';

export class RateLimitValidator implements Validator {
  name = 'rate-limit';

  async validate(model: ModelInfo, apiKey: string, baseURL: string): Promise<ValidationCheck> {
    const start = Date.now();
    const url = `${baseURL.replace(/\/$/, '')}/chat/completions`;
    const burstCount = 10; // Number of concurrent requests
    const windowMs = 60_000; // 1 minute window

    const results: { success: boolean; latency: number; status?: number }[] = [];
    let rateLimited = 0;

    // Fire burst requests
    const promises = Array.from({ length: burstCount }, async (_, i) => {
      const reqStart = Date.now();
      try {
        const resp = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model.modelId,
              messages: [{ role: 'user', content: `Test ${i}` }],
              max_tokens: 10,
              temperature: 0,
            }),
          }),
          15000
        );

        const latency = Date.now() - reqStart;
        if (resp.status === 429) {
          rateLimited++;
          results.push({ success: false, latency, status: 429 });
        } else if (resp.ok) {
          results.push({ success: true, latency, status: 200 });
        } else {
          results.push({ success: false, latency, status: resp.status });
        }
      } catch (error) {
        results.push({ success: false, latency: Date.now() - reqStart, status: 0 });
      }
    });

    await Promise.all(promises);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const latencies = successful.map(r => r.latency).sort((a, b) => a - b);

    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    const rpm = Math.round((successful.length / (Date.now() - start)) * 60_000);
    const rateLimitHit = rateLimited > 0;

    // Score: higher for more successful requests, lower latency, no rate limits
    let score = 100;
    if (successful.length < burstCount * 0.8) score -= 30; // < 80% success
    if (rateLimitHit) score -= 20;
    if (p95 > 10000) score -= 20; // High latency
    score = Math.max(0, score);

    const passed = successful.length >= burstCount * 0.5 && !rateLimitHit;

    return {
      name: this.name,
      passed,
      score,
      details: `${successful.length}/${burstCount} OK, ${rateLimited} rate-limited, P50=${p50}ms P95=${p95}ms, est RPM≈${rpm}`,
      latencyMs: avgLatency,
    };
  }
}
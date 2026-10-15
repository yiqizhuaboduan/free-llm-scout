/**
 * free-llm-scout — Context Window Validator
 * Binary-searches the actual usable context window vs claimed.
 */

import { Validator, ValidationCheck, ModelInfo } from '../types.js';
import { withTimeout } from '../utils.js';

export class ContextWindowValidator implements Validator {
  name = 'context-window';

  async validate(model: ModelInfo, apiKey: string, baseURL: string): Promise<ValidationCheck> {
    const start = Date.now();
    const claimedWindow = model.contextWindow;
    const url = `${baseURL.replace(/\/$/, '')}/chat/completions`;

    // Test points: 50%, 75%, 90%, 95% of claimed window
    const testRatios = [0.5, 0.75, 0.9, 0.95];
    let maxWorkingRatio = 0;
    let lastError = '';
    let lastLatency = 0;

    for (const ratio of testRatios) {
      const targetTokens = Math.floor(claimedWindow * ratio);
      // Reserve tokens for prompt + response
      const promptTokens = targetTokens - 1000;
      if (promptTokens < 100) continue;

      const prompt = 'x'.repeat(promptTokens / 4); // ~4 chars per token

      try {
        const trialStart = Date.now();
        const resp = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model.modelId,
              messages: [
                { role: 'system', content: 'Echo the input.' },
                { role: 'user', content: prompt },
              ],
              max_tokens: 50,
              temperature: 0,
            }),
          }),
          30000
        );

        lastLatency = Date.now() - trialStart;

        if (resp.ok) {
          maxWorkingRatio = ratio;
        } else {
          const text = await resp.text();
          lastError = `Ratio ${ratio}: HTTP ${resp.status} ${text.slice(0, 100)}`;
          break; // Stop at first failure
        }
      } catch (error) {
        lastError = `Ratio ${ratio}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }

      // Small delay
      await new Promise(r => setTimeout(r, 300));
    }

    const actualWindow = Math.floor(claimedWindow * maxWorkingRatio);
    const fidelity = maxWorkingRatio; // 0-1
    const passed = fidelity >= 0.8; // At least 80% of claimed
    const score = Math.round(fidelity * 100);

    return {
      name: this.name,
      passed,
      score,
      details: `Claimed: ${claimedWindow.toLocaleString()}, Working: ${actualWindow.toLocaleString()} (${Math.round(fidelity * 100)}%)${lastError ? ` — ${lastError}` : ''}`,
      latencyMs: lastLatency,
    };
  }
}
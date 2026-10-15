/**
 * free-llm-scout — OpenAI Compatibility Validator
 * Checks if the model endpoint speaks standard OpenAI Chat Completions API.
 */

import { Validator, ValidationCheck, ModelInfo } from '../types.js';
import { withTimeout } from '../utils.js';

export class CompatValidator implements Validator {
  name = 'openai-compat';

  async validate(model: ModelInfo, apiKey: string, baseURL: string): Promise<ValidationCheck> {
    const start = Date.now();
    const url = `${baseURL.replace(/\/$/, '')}/chat/completions`;

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
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 5,
            temperature: 0,
          }),
        }),
        15000
      );

      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const text = await resp.text();
        return {
          name: this.name,
          passed: false,
          score: 0,
          details: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
          latencyMs,
        };
      }

      const data = await resp.json() as Record<string, unknown>;

      // Check standard OpenAI response shape
      const choices = data.choices;
      const hasChoices = Array.isArray(choices) && choices.length > 0;
      const hasMessage = hasChoices &&
        choices[0] !== null &&
        typeof choices[0] === 'object' &&
        'message' in (choices[0] as Record<string, unknown>);
      const hasUsage = 'usage' in data && typeof data.usage === 'object' && data.usage !== null;

      const passed = hasChoices && hasMessage && hasUsage;
      const score = passed ? 100 : (hasChoices ? 50 : 0);

      return {
        name: this.name,
        passed,
        score,
        details: passed
          ? 'OpenAI-compatible response structure'
          : `Missing fields: choices=${hasChoices}, message=${hasMessage}, usage=${hasUsage}`,
        latencyMs,
        rawResponse: data,
      };
    } catch (error) {
      return {
        name: this.name,
        passed: false,
        score: 0,
        details: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        latencyMs: Date.now() - start,
      };
    }
  }
}
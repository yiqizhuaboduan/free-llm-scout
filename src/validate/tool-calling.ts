/**
 * free-llm-scout — Tool Calling Validator
 * The MOST CRITICAL validator for DSH coding agents.
 * Tests if model reliably returns valid `tool_calls` with correct JSON structure.
 */

import { Validator, ValidationCheck, ModelInfo } from '../types.js';
import { withTimeout } from '../utils.js';

const TEST_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit' },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calculate',
      description: 'Perform a calculation',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression to evaluate' },
        },
        required: ['expression'],
      },
    },
  },
];

const TEST_MESSAGES = [
  { role: 'system' as const, content: 'You are a helpful assistant. Use tools when needed.' },
  { role: 'user' as const, content: 'What is the weather in Beijing? Use the get_weather tool.' },
];

export class ToolCallingValidator implements Validator {
  name = 'tool-calling';
  // 2 trials, both must pass (rate >= 0.66 with 2 trials => 2/2).
  // Saves one request per model vs 3 trials — free-tier daily budgets are tiny.
  private trials = 2;

  async validate(model: ModelInfo, apiKey: string, baseURL: string): Promise<ValidationCheck> {
    const start = Date.now();
    const url = `${baseURL.replace(/\/$/, '')}/chat/completions`;

    let successCount = 0;
    let totalLatency = 0;
    let lastError = '';
    let lastRawResponse: unknown;

    for (let i = 0; i < this.trials; i++) {
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
              messages: TEST_MESSAGES,
              tools: TEST_TOOLS,
              tool_choice: 'auto',
              max_tokens: 1024,
              temperature: 0,
            }),
          }),
          30000
        );

        const latency = Date.now() - trialStart;
        totalLatency += latency;

        if (!resp.ok) {
          const text = await resp.text();
          lastError = `HTTP ${resp.status}: ${text.slice(0, 200)}`;
          continue;
        }

        const data = await resp.json() as Record<string, unknown>;
        lastRawResponse = data;

        if (this.validateToolCalls(data)) {
          successCount++;
        } else {
          lastError = 'Response missing valid tool_calls';
        }
      } catch (error) {
        lastError = `Request failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      // Small delay between trials to avoid rate limiting
      if (i < this.trials - 1) await new Promise(r => setTimeout(r, 500));
    }

    const avgLatency = this.trials > 0 ? Math.round(totalLatency / this.trials) : 0;
    const successRate = successCount / this.trials;
    const passed = successRate >= 0.66; // At least 2/3 trials must succeed
    const score = Math.round(successRate * 100);

    return {
      name: this.name,
      passed,
      score,
      details: `${successCount}/${this.trials} trials returned valid tool_calls${lastError ? ` — last error: ${lastError}` : ''}`,
      latencyMs: avgLatency,
      rawResponse: lastRawResponse,
    };
  }

  private validateToolCalls(data: Record<string, unknown>): boolean {
    // Check standard OpenAI tool_calls structure
    if (!Array.isArray(data.choices) || data.choices.length === 0) return false;
    const choice = data.choices[0];
    if (!choice || typeof choice !== 'object') return false;
    const message = choice.message;
    if (!message || typeof message !== 'object') return false;
    const toolCalls = message.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false;

    // Each tool_call must have valid structure
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== 'object') return false;
      if (tc.type !== 'function') return false;
      const fn = tc.function;
      if (!fn || typeof fn !== 'object') return false;
      if (typeof fn.name !== 'string' || fn.name.trim() === '') return false;
      if (typeof fn.arguments !== 'string') return false;
      // Arguments must be valid JSON
      try {
        JSON.parse(fn.arguments);
      } catch {
        return false;
      }
    }
    return true;
  }
}
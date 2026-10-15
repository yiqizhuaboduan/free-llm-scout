/**
 * free-llm-scout — Structured Output Validator
 * Tests JSON mode / response_format support
 */

import { Validator, ValidationCheck, ModelInfo } from '../types.js';
import { withTimeout } from '../utils.js';

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    skills: { type: 'array', items: { type: 'string' } },
    active: { type: 'boolean' },
  },
  required: ['name', 'age', 'skills', 'active'],
  additionalProperties: false,
};

export class StructuredOutputValidator implements Validator {
  name = 'structured-output';

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
            messages: [
              { role: 'system', content: 'Output valid JSON only.' },
              { role: 'user', content: 'Generate a JSON object for a person named Alice, age 30, skills ["TypeScript", "Python"], active true.' },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 512,
            temperature: 0,
          }),
        }),
        20000
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

      // Extract content
      if (!Array.isArray(data.choices) || data.choices.length === 0) {
        return { name: this.name, passed: false, score: 0, details: 'No choices', latencyMs };
      }
      const content = data.choices[0]?.message?.content;
      if (typeof content !== 'string') {
        return { name: this.name, passed: false, score: 0, details: 'No content string', latencyMs };
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { name: this.name, passed: false, score: 0, details: 'Content not valid JSON', latencyMs, rawResponse: data };
      }

      // Validate against schema (basic)
      const valid = this.validateSchema(parsed, TEST_SCHEMA);
      const score = valid ? 100 : 50; // Partial credit for valid JSON but wrong schema

      return {
        name: this.name,
        passed: valid,
        score,
        details: valid ? 'Valid JSON matching schema' : 'JSON valid but schema mismatch',
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

  private validateSchema(obj: unknown, schema: Record<string, unknown>): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    const required = schema.required as string[];

    for (const req of required) {
      if (!(req in o)) return false;
    }

    for (const [key, expectedType] of Object.entries(props)) {
      if (!(key in o)) continue;
      const val = o[key];
      const typeDef = expectedType as Record<string, unknown>;
      const expected = typeDef.type as string;

      if (expected === 'string' && typeof val !== 'string') return false;
      if (expected === 'integer' && (!Number.isInteger(val) || typeof val !== 'number')) return false;
      if (expected === 'boolean' && typeof val !== 'boolean') return false;
      if (expected === 'array' && !Array.isArray(val)) return false;
      if (expected === 'object' && (val === null || typeof val !== 'object' || Array.isArray(val))) return false;
    }

    return true;
  }
}
/**
 * free-llm-scout — Shared Utilities
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { ValidationResult, ModelInfo, ValidationCheck } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

export function loadEnv(): void {
  try {
    const envPath = resolve(PROJECT_ROOT, '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch {
    // .env optional
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function writeJson(file: string, data: unknown): void {
  ensureDir(dirname(file));
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeYaml(file: string, data: unknown): void {
  ensureDir(dirname(file));
  // Simple YAML serialization for our use cases
  const yaml = stringifyYaml(data);
  writeFileSync(file, yaml, 'utf8');
}

/** Write pre-formatted text (Markdown/YAML/JSON strings) verbatim — no re-serialization. */
export function writeText(file: string, content: string): void {
  ensureDir(dirname(file));
  writeFileSync(file, content, 'utf8');
}

function stringifyYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (Array.isArray(obj)) {
    return obj.map(item => `${spaces}- ${stringifyYaml(item, 0).trimStart()}`).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const valStr = stringifyYaml(value, indent + 1);
      if (valStr.includes('\n')) {
        return `${spaces}${key}:\n${valStr}`;
      }
      return `${spaces}${key}: ${valStr}`;
    }).join('\n');
  }
  if (typeof obj === 'string') {
    // Quote strings with special chars
    if (/[:#\[\]{}&*!|>'"%@`]/.test(obj) || obj.includes('\n')) {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }
  return String(obj);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg = 'Operation timed out'): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export function computeScore(checks: ValidationCheck[]): number {
  if (checks.length === 0) return 0;
  const weights: Record<string, number> = {
    'openai-compat': 20,
    'tool-calling': 35,
    'structured-output': 15,
    'context-window': 15,
    'rate-limit': 10,
    'latency': 5,
  };
  let total = 0;
  let weightSum = 0;
  for (const check of checks) {
    const weight = weights[check.name] ?? 10;
    total += check.score * weight;
    weightSum += weight;
  }
  return Math.round(total / weightSum);
}

export function selectFleetModels(
  results: ValidationResult[],
  models: ModelInfo[],
  options: {
    minScore: number;
    maxFleetSize: number;
    providerPriority: string[];
  }
): ModelInfo[] {
  // Results carry the bare modelId; models are keyed by the prefixed id
  // (`provider/modelId`). Look up through the same composite key everywhere.
  const modelMap = new Map(models.map(m => [m.id, m]));
  const eligible = results
    .filter(r => r.passed && r.score >= options.minScore)
    .sort((a, b) => {
      // Primary: score desc
      if (b.score !== a.score) return b.score - a.score;
      // Secondary: provider priority
      const pa = options.providerPriority.indexOf(a.provider);
      const pb = options.providerPriority.indexOf(b.provider);
      if (pa !== pb) return pa - pb;
      // Tertiary: context window desc
      const ma = modelMap.get(`${a.provider}/${a.modelId}`);
      const mb = modelMap.get(`${b.provider}/${b.modelId}`);
      return (mb?.contextWindow ?? 0) - (ma?.contextWindow ?? 0);
    })
    .slice(0, options.maxFleetSize)
    .map(r => modelMap.get(`${r.provider}/${r.modelId}`))
    .filter((m): m is ModelInfo => m !== undefined);
  return eligible;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
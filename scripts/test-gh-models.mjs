/**
 * Local check: is GH_MODELS_API_KEY set and does it actually reach
 * GitHub Models? Prints pass/fail only — never prints the key.
 */
import { loadEnv } from '../dist/utils.js';

loadEnv();
const key = process.env.GH_MODELS_API_KEY;
console.log('GH_MODELS_API_KEY present:', key ? `yes (len=${key.length}, prefix=${key.slice(0, 4)}...)` : 'NO — not found in .env');
if (!key) process.exit(1);

const { CompatValidator } = await import('../dist/validate/compat.js');
const { ToolCallingValidator } = await import('../dist/validate/tool-calling.js');
const { GitHubModelsDiscovery, GITHUB_MODELS_BASE_URL } = await import('../dist/discover/github-models.js');

const TARGETS = [
  'openai/gpt-4.1-mini',
  'openai/gpt-4o-mini',
  'meta/Llama-4-Scout-17B-16E-Instruct',
  'mistral-ai/Mistral-Small-24B-Instruct-2501',
];

const disc = new GitHubModelsDiscovery();
const models = (await disc.fetchModels()).filter(m => TARGETS.includes(m.modelId));

const compat = new CompatValidator();
const tools = new ToolCallingValidator();

for (const m of models) {
  const c = await compat.validate(m, key, GITHUB_MODELS_BASE_URL);
  let line = `${m.modelId}: compat=${c.passed ? '✅' : `❌ ${(c.details ?? '').slice(0, 90)}`}`;
  if (c.passed) {
    const t = await tools.validate(m, key, GITHUB_MODELS_BASE_URL);
    line += ` | tool-calling=${t.score}/100 (${(t.details ?? '').slice(0, 60)})`;
  }
  console.log(line);
}

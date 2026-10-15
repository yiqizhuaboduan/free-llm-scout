/**
 * reemit — regenerate output artifacts from the last run's raw-results.json
 * without spending a single API request. Useful after emitter changes.
 *
 * usage: node scripts/reemit.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DshFleetEmitter } from '../dist/emitters/dsh-fleet.js';
import { RegistryJsonEmitter } from '../dist/emitters/registry-json.js';
import { LeaderboardEmitter } from '../dist/emitters/leaderboard.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(resolve(here, '../data/raw-results.json'), 'utf8'));

const results = raw.results ?? [];
const models = raw.models ?? [];
const config = raw.config ?? {};

const options = {
  outDir: config.outputDir ?? './data',
  minScore: config.minScore ?? 60,
  maxFleetSize: config.maxFleetSize ?? 15,
  providerPriority: config.providerPriority ?? ['openrouter', 'siliconflow', 'modelscope', 'bailian', 'zhipu', 'deepseek-account'],
};

for (const emitter of [new DshFleetEmitter(), new RegistryJsonEmitter(), new LeaderboardEmitter()]) {
  const msg = await emitter.emit(results, models, options);
  console.log(`✅ ${emitter.name}: ${msg}`);
}

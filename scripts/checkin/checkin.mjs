/**
 * quota-keeper — daily check-in keeper for free-tier platforms
 * ------------------------------------------------------------
 * Some platforms grant daily credits ONLY when you log in that day
 * (e.g. ModelScope grants 200 魔点 per daily login). This script keeps
 * those streaks alive from GitHub Actions or a local cron.
 *
 * DESIGN PRINCIPLES (read before adding a platform):
 *   1. Session-based, never passwords. You export the session cookie once
 *      from your browser, store it as a GitHub Secret / .env value, and the
 *      keeper replays it. When the cookie expires the run FAILS LOUDLY so
 *      you know to re-export — it never silently stops.
 *   2. One file per platform in the ADAPTERS map below. A platform adapter
 *      returns { ok, message } and must never throw.
 *   3. Honest about automation risk: some platforms' ToS frown on automated
 *      access. Use a dedicated account if you are not willing to risk the
 *      main one. This tool ships without any captcha bypassing — if a
 *      platform challenges you, it fails and tells you.
 *
 * usage:
 *   node scripts/checkin/checkin.mjs                # run every adapter
 *   node scripts/checkin/checkin.mjs modelscope     # run one
 *
 * secrets (repo Settings > Secrets, or local .env):
 *   MODELSCOPE_COOKIE    the Cookie header copied from a logged-in browser
 *   MODELSCOPE_CHECKIN_URL   (optional) the exact check-in endpoint captured
 *                        from DevTools; when absent only the session is kept
 *                        alive, which is often enough for login-granted credit
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- tiny .env loader (same rules as src/utils.ts loadEnv) -----------------
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && !process.env[t.slice(0, eq).trim()]) {
      process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** GET with cookie; returns { status, body } and never throws. */
async function get(url, cookie) {
  try {
    const r = await fetch(url, {
      headers: { 'Cookie': cookie, 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' },
      redirect: 'follow',
    });
    const body = await r.text();
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: String(e?.message ?? e) };
  }
}

/** POST with cookie + JSON body; returns { status, body } and never throws. */
async function post(url, cookie, payload) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Cookie': cookie, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: 'follow',
    });
    const body = await r.text();
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: String(e?.message ?? e) };
  }
}

// ---- platform adapters ------------------------------------------------------
// Each adapter: { name, cookieEnv, run(cookie) -> { ok, message } }

const ADAPTERS = {
  modelscope: {
    cookieEnv: 'MODELSCOPE_COOKIE',
    async run(cookie) {
      const checkinUrl = process.env.MODELSCOPE_CHECKIN_URL;
      // 1. Session liveness: an authenticated probe of the user endpoint.
      //    (ModelScope's bonus is granted on daily login, so an authenticated
      //    visit through the web session typically claims it.)
      const probe = await get('https://www.modelscope.cn/api/v1/session', cookie);
      if (probe.status === 401 || probe.status === 403) {
        return { ok: false, message: `cookie 已失效 (HTTP ${probe.status}) — 重新导出 Cookie` };
      }
      if (probe.status === 0) {
        return { ok: false, message: `网络错误: ${probe.body.slice(0, 120)}` };
      }
      // 2. Optional explicit check-in endpoint captured from DevTools.
      if (checkinUrl) {
        const ci = await post(checkinUrl, cookie);
        return { ok: ci.status >= 200 && ci.status < 300, message: `check-in HTTP ${ci.status}: ${ci.body.slice(0, 160)}` };
      }
      return { ok: true, message: `session 有效 (HTTP ${probe.status}) — 登录态已保持；如需明确领取魔点，请设置 MODELSCOPE_CHECKIN_URL` };
    },
  },

  // Template for the next platform — copy, adjust endpoints, add a secret.
  // zhipu: {
  //   cookieEnv: 'ZHIPU_COOKIE',
  //   async run(cookie) { ... }
  // },
};

// ---- runner -----------------------------------------------------------------
const only = process.argv[2];
const names = only ? [only] : Object.keys(ADAPTERS);
let failures = 0;

for (const name of names) {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    console.error(`❌ unknown platform: ${name} (available: ${Object.keys(ADAPTERS).join(', ')})`);
    failures++;
    continue;
  }
  const cookie = process.env[adapter.cookieEnv];
  if (!cookie) {
    console.error(`❌ ${name}: ${adapter.cookieEnv} 未设置 — 跳过（Actions 里配 Secret，本地配 .env）`);
    failures++;
    continue;
  }
  const result = await adapter.run(cookie);
  console.log(`${result.ok ? '✅' : '❌'} ${name}: ${result.message}`);
  if (!result.ok) failures++;
}

process.exit(failures > 0 ? 1 : 0);

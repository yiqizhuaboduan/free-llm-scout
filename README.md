# free-llm-scout 🔭

> **Automated free LLM discovery, validation, and fleet config generator for DSH (DeepSeek Harness) and beyond.**

English | [简体中文](README.zh-CN.md)

[![License](https://img.shields.io/badge/License-Non--Commercial%20Free-blue.svg)](LICENSE.md)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![CI](https://github.com/yiqizhuaboduan/free-llm-scout/actions/workflows/scout.yml/badge.svg)](https://github.com/yiqizhuaboduan/free-llm-scout/actions/workflows/scout.yml)

---

## 🎯 What It Does

**free-llm-scout** automatically:

1. **🔍 Discovers** free models from multiple providers (OpenRouter, SiliconFlow, ModelScope, Bailian, Zhipu, Moonshot, HuggingFace, and curated seeds)
2. **🧪 Validates** each model against **critical criteria for coding agents**:
   - ✅ OpenAI API compatibility
   - ✅ **Tool Calling / Function Calling reliability** (the #1 requirement for DSH)
   - ✅ Structured Output (JSON mode) support
   - ✅ Actual vs claimed context window
   - ✅ Rate limits & latency profiling
3. **📊 Scores & Ranks** models (0-100) with weighted criteria
4. **📦 Emits** ready-to-use configurations:
   - **DSH `model-fleet` chain** — drop into `cordis.patch.yml`
   - **Full JSON registry** — machine-readable, versioned
   - **Markdown leaderboard** — for README/dashboard
5. **🤖 Runs Daily** via GitHub Actions → auto-PRs when fleet changes

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm (or npm/yarn)
- **At least one API key** (see below)

### Install & Run

```bash
# Clone
git clone https://github.com/fanrujin2023/free-llm-scout.git
cd free-llm-scout

# Install
pnpm install

# Configure API keys (copy .env.example → .env and fill in)
cp .env.example .env
# Edit .env with your keys

# Run once (MVP: OpenRouter + seeds)
pnpm scout

# Or with all sources (requires all keys)
pnpm scout --sources openrouter,siliconflow,modelscope,bailian,zhipu,moonshot,huggingface,custom-seeds
```

### Output

```
dist/
├── fleet.chain.yaml          # ← Drop into DSH cordis.patch.yml
├── fleet.patch.snippet.yaml  # ← Ready-to-paste patch snippet
├── registry.json             # Full machine-readable registry
├── LEADERBOARD.md            # Markdown ranking table
└── raw-results.json          # Debug: full validation data
```

---

## 🔑 Required API Keys

| Provider | Env Var | Free Tier? | Get Key |
|----------|---------|------------|---------|
| **OpenRouter** | `OPENROUTER_API_KEY` | ✅ Generous | [openrouter.ai/keys](https://openrouter.ai/keys) |
| SiliconFlow | `SILICONFLOW_API_KEY` | ✅ | [siliconflow.cn](https://siliconflow.cn) |
| ModelScope | `MODELSCOPE_API_KEY` | ✅ | [modelscope.cn](https://modelscope.cn) |
| 百炼 | `BAILIAN_API_KEY` | ✅ Trial | [bailian.aliyun.com](https://bailian.aliyun.com) |
| 智谱 | `ZHIPU_API_KEY` | ✅ | [bigmodel.cn](https://bigmodel.cn) |
| 月之暗面 | `MOONSHOT_API_KEY` | ✅ Trial | [moonshot.cn](https://moonshot.cn) |
| HuggingFace | `HF_API_KEY` | ✅ | [hf.co/settings/tokens](https://huggingface.co/settings/tokens) |
| DeepSeek (paid fallback) | `DEEPSEEK_API_KEY` | ❌ Paid | [platform.deepseek.com](https://platform.deepseek.com) |

> **MVP only needs `OPENROUTER_API_KEY`** — the `custom-seeds` source works without any key.

---

## 🛠 DSH Integration (Your Use Case)

### 1. Run scout to generate fleet chain
```bash
pnpm scout
```

### 2. Copy the generated chain into your `cordis.patch.yml`

**Option A: Replace the entire `chain:` section**
```yaml
# In cordis.patch.yml, under model-fleet config:
config:
  chain:
    # Paste contents of dist/fleet.chain.yaml here (without the "chain:" prefix)
```

**Option B: Use the patch snippet directly**
```yaml
# The file dist/fleet.patch.snippet.yaml is a ready-to-paste YAML snippet
# Just replace the existing chain: block in your model-fleet config
```

### 3. Restart DSH
The fleet plugin reloads on config change (or restart DSH to be safe).

### 4. Verify
Check `model-fleet.diagnostics.json` — it should show your new chain with validated models.

---

## ⚙️ Configuration

### CLI Options
```bash
pnpm scout \
  --sources openrouter,custom-seeds \
  --validators openai-compat,tool-calling,structured-output,context-window,rate-limit \
  --emitters dsh-fleet,registry-json,leaderboard \
  --concurrency 3 \
  --min-score 60 \
  --max-fleet 15 \
  --output ./dist \
  --provider-priority openrouter,siliconflow,modelscope,bailian,zhipu,deepseek-account
```

### Weighted Scoring (in `src/utils.ts`)
| Check | Weight | Why |
|-------|--------|-----|
| Tool Calling | 35% | **Essential for DSH agents** |
| OpenAI Compat | 20% | Baseline requirement |
| Context Window | 15% | Long-context matters |
| Structured Output | 15% | JSON mode reliability |
| Rate Limit | 10% | Usability |
| Latency | 5% | UX |

---

## 🤖 GitHub Actions Automation

The repo includes `.github/workflows/scout.yml` that:
- Runs **daily at 06:00 UTC**
- Uses secrets from repository settings
- **Auto-creates PR** when fleet changes
- Uploads artifacts for 7 days

### Setup
1. Fork this repo (or push to your own)
2. Go to **Settings → Secrets and variables → Actions**
3. Add the API keys as **Repository secrets** (same names as `.env`)
4. Enable workflow — it'll run daily and PR updates

---

## 📁 Project Structure

```
free-llm-scout/
├── .github/workflows/scout.yml   # Daily automation
├── src/
│   ├── cli.ts                    # CLI entry
│   ├── scout.ts                  # Orchestrator
│   ├── types.ts                  # Core types
│   ├── utils.ts                  # Shared utilities
│   ├── discover/                 # Discovery adapters (pluggable)
│   │   ├── openrouter.ts
│   │   ├── siliconflow.ts
│   │   ├── modelscope.ts
│   │   ├── bailian.ts
│   │   ├── zhipu.ts
│   │   ├── moonshot.ts
│   │   ├── huggingface.ts
│   │   └── custom-seeds.ts       # Fallback curated list
│   ├── validate/                 # Validators (pluggable)
│   │   ├── compat.ts
│   │   ├── tool-calling.ts       # ← Most important for DSH
│   │   ├── structured-output.ts
│   │   ├── context-window.ts
│   │   └── rate-limit.ts
│   └── emitters/                 # Output formats (pluggable)
│       ├── dsh-fleet.ts          # ← Primary for you
│       ├── registry-json.ts
│       └── leaderboard.ts
├── dist/                         # Generated output (gitignored)
├── seeds/                        # Manual seed overrides
├── LICENSE.md                    # Non-commercial free license
├── package.json
└── tsconfig.json
```

---

## 🧩 Extending

### Add a New Discovery Source
1. Create `src/discover/myprovider.ts` implementing `DiscoverySource`
2. Register in `src/scout.ts` → `SOURCE_REGISTRY`
3. Add API key env var to `.env.example` and GitHub Actions

### Add a New Validator
1. Create `src/validate/mycheck.ts` implementing `Validator`
2. Register in `src/scout.ts` → `VALIDATOR_REGISTRY`

### Add a New Emitter
1. Create `src/emitters/myoutput.ts` implementing `Emitter`
2. Register in `src/scout.ts` → `EMITTER_REGISTRY`

---

## 📜 License

**Non-Commercial Free, Commercial Requires Authorization**

- ✅ Free for personal, academic, open-source, non-profit use
- ✅ Source code visible, modifiable, distributable
- ❌ Commercial use requires written authorization from **fanrujin2023@outlook.com**

See [LICENSE.md](LICENSE.md) for full terms.

---

## 🤝 Contributing

Issues and PRs welcome! Please:
1. Open an issue for bugs/features
2. Follow the existing code style (TypeScript, ESLint, Prettier)
3. Add tests for new validators/emitters
4. Update README for new sources

---

## 🙏 Acknowledgments

- **DeepSeek Harness (DSH)** — The harness this was built for
- **OpenRouter** — Excellent free model aggregation
- **All free tier providers** — SiliconFlow, ModelScope, Bailian, Zhipu, Moonshot, HF
- **The open-source LLM community** — Making this possible

---

**Made with ❤️ for the DSH community. Happy scouting!** 🔭
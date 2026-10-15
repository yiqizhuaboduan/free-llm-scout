# free-llm-scout 🔭（简体中文）

> **自动发现、实测验证免费大模型，一键生成 DSH（DeepSeek Harness）车队配置。**

[English](README.md) | 简体中文

[![License](https://img.shields.io/badge/License-非商业免费-blue.svg)](LICENSE.md)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![CI](https://github.com/yiqizhuaboduan/free-llm-scout/actions/workflows/scout.yml/badge.svg)](https://github.com/yiqizhuaboduan/free-llm-scout/actions/workflows/scout.yml)

---

## 🎯 它做什么

**free-llm-scout** 每天自动：

1. **🔍 发现** —— 从多个平台拉取免费模型清单（OpenRouter、SiliconFlow、ModelScope、百炼、智谱、月之暗面、HuggingFace、内置种子）
2. **🧪 实测验证** —— 不是看宣传页，是发真实请求：
   - ✅ OpenAI 接口兼容性
   - ✅ **工具调用（Tool Calling）可靠性**（DSH 编码 Agent 的命脉）
   - ✅ 结构化输出（JSON mode）
   - ✅ 真实上下文窗口 vs 宣称值（可选）
   - ✅ 限流 / 延迟画像（可选）
3. **📊 评分排名** —— 加权评分 0-100（工具调用权重 35%）
4. **📦 产出即用配置**：
   - **DSH `model-fleet` 车队链** —— 直接粘进 `cordis.patch.yml`
   - **完整 JSON 注册表** —— 机器可读、版本化
   - **Markdown 排行榜**
5. **🤖 全自动** —— GitHub Actions 每天定时跑，结果**直接提交到 main**（无需手动合并 PR）
6. **🪦 死模型缓存** —— 404/地区限制/白名单拒绝的模型只探测一次，之后永久跳过，不浪费每日免费配额

---

## 🚀 快速开始

### 前置条件
- Node.js 20+、pnpm
- 至少一个 API Key（见下表）

### 安装运行

```bash
git clone https://github.com/yiqizhuaboduan/free-llm-scout.git
cd free-llm-scout
pnpm install

# 配置 Key（复制模板后填入你的 Key）
cp .env.example .env

# 跑一次（默认：OpenRouter + 内置种子）
pnpm scout
```

### 产出文件（`data/` 目录，已纳入 git 跟踪）

| 文件 | 用途 |
|------|------|
| `data/fleet.chain.yaml` | **直接粘贴进 DSH `cordis.patch.yml` 的 `model-fleet.config.chain`** |
| `data/fleet.patch.snippet.yaml` | 带注释的 patch 片段（备用） |
| `data/registry.json` | 全量注册表（含每项验证明细） |
| `data/LEADERBOARD.md` | 排行榜 |
| `data/raw-results.json` | 原始验证数据（调试用） |
| `data/dead-models.json` | 死模型缓存（自动维护） |

> 💡 改了验证/产出逻辑后不想烧配额？`node scripts/reemit.mjs` 从上次原始数据直接重新生成产出物。

---

## 🔑 API Key 一览

| 平台 | 环境变量 | 免费档 | 获取地址 |
|------|----------|--------|----------|
| **OpenRouter** | `OPENROUTER_API_KEY` | ✅ 50 请求/天（充 $10 → 1000/天） | [openrouter.ai/keys](https://openrouter.ai/keys) |
| SiliconFlow | `SILICONFLOW_API_KEY` | ✅ | [siliconflow.cn](https://siliconflow.cn) |
| ModelScope | `MODELSCOPE_API_KEY` | ✅ | [modelscope.cn](https://modelscope.cn) |
| 百炼 | `BAILIAN_API_KEY` | ✅ 试用额度 | [bailian.aliyun.com](https://bailian.aliyun.com) |
| 智谱 | `ZHIPU_API_KEY` | ✅ glm-4-flash 免费 | [bigmodel.cn](https://bigmodel.cn) |
| 月之暗面 | `MOONSHOT_API_KEY` | ✅ 试用额度 | [moonshot.cn](https://moonshot.cn) |
| HuggingFace | `HF_API_KEY` | ✅ | [hf.co/settings/tokens](https://huggingface.co/settings/tokens) |

> **MVP 只需 `OPENROUTER_API_KEY`**。国产平台国内直连，无需代理。

---

## 🛠 接入 DSH 车队

1. 跑一次 `pnpm scout`（或直接用仓库里 `data/fleet.chain.yaml` 的最新版）
2. 打开你的 `cordis.patch.yml`，找到 `model-fleet` 的 `config.chain`
3. 把 `data/fleet.chain.yaml` 里 `chain:` 下面的条目合并进去（建议保留你自己的付费兜底项在最后）
4. 重启 DSH → `model-fleet.diagnostics.json` 里确认新链生效

---

## ⚙️ 配置项

```bash
pnpm scout \
  --sources openrouter,custom-seeds \
  --validators openai-compat,tool-calling,structured-output \
  --max-models 12 \
  --concurrency 3 \
  --min-score 60 \
  --max-fleet 15 \
  --output ./data
```

| 参数 | 默认 | 说明 |
|------|------|------|
| `--sources` | `openrouter,custom-seeds` | 发现源（逗号分隔） |
| `--validators` | `openai-compat,tool-calling,structured-output` | 验证器；`context-window`、`rate-limit` 是可选的高消耗项 |
| `--max-models` | `12` | 每次最多验证多少个模型（**免费档 50 请求/天，每模型约 4 请求**） |
| `--min-score` | `60` | 进车队的最低分 |
| `--max-fleet` | `15` | 车队最大长度 |
| `--output` | `./data` | 输出目录（纳入 git，机器人自动提交） |

### 评分权重

| 检查项 | 权重 | 理由 |
|--------|------|------|
| 工具调用 | 35% | **DSH Agent 的刚需** |
| OpenAI 兼容 | 20% | 基本盘 |
| 上下文窗口 | 15% | 长上下文很重要 |
| 结构化输出 | 15% | JSON 模式可靠性 |
| 限流画像 | 10% | 可用性 |
| 延迟 | 5% | 体验 |

> 判定规则：**关键项（兼容性 + 工具调用）必须全过**，其余项失败只扣分不一票否决 —— 免费档天生抖动，别因为一次超时埋没好模型。

---

## 🤖 GitHub Actions 自动化

`.github/workflows/scout.yml` 流程：

```
每天 06:00 UTC（北京时间 14:00）自动触发
  → 安装 pnpm + 构建
  → 跑 scout（发现 → 验证 → 产出）
  → 有变化则由机器人直接 commit 到 main（[skip ci]，不触发循环）
  → 上传产物工件（保留 7 天）
```

### 配置 Secrets
仓库 **Settings → Secrets and variables → Actions**，按上表名字添加（至少 `OPENROUTER_API_KEY`）。

> 无需配置「允许 Actions 创建 PR」—— 本项目直接提交 main，不依赖该权限。

---

## 📁 项目结构

```
free-llm-scout/
├── .github/workflows/scout.yml   # 每日自动化
├── src/
│   ├── cli.ts                    # 命令行入口
│   ├── scout.ts                  # 编排器（含死模型缓存、配额预算）
│   ├── types.ts / utils.ts
│   ├── discover/                 # 发现源（插拔式，一平台一文件）
│   │   ├── openrouter.ts
│   │   ├── siliconflow.ts / modelscope.ts / bailian.ts
│   │   ├── zhipu.ts / moonshot.ts / huggingface.ts
│   │   └── custom-seeds.ts       # 人工精选种子（兜底）
│   ├── validate/                 # 验证器（插拔式）
│   │   ├── compat.ts / tool-calling.ts / structured-output.ts
│   │   └── context-window.ts / rate-limit.ts
│   └── emitters/                 # 产出器（插拔式）
│       ├── dsh-fleet.ts          # DSH 车队链 YAML
│       ├── registry-json.ts / leaderboard.ts
├── data/                         # 生成物（git 跟踪，机器人每日提交）
├── scripts/reemit.mjs            # 零配额重新生成产出物
├── LICENSE.md                    # 非商业免费许可
└── README.md / README.zh-CN.md
```

---

## 🧩 扩展

- **加发现源**：新建 `src/discover/xxx.ts` 实现 `DiscoverySource`，注册进 `scout.ts` 的 `SOURCE_REGISTRY`
- **加验证器**：新建 `src/validate/xxx.ts` 实现 `Validator`，注册进 `VALIDATOR_REGISTRY`
- **加产出器**：新建 `src/emitters/xxx.ts` 实现 `Emitter`，注册进 `EMITTER_REGISTRY`

---

## 📜 许可证

**非商业免费，商业需授权**

- ✅ 个人学习、学术研究、开源贡献、非盈利用途免费使用、修改、分发
- ❌ 任何商业用途需事先获得书面授权

联系：**fanrujin2023@outlook.com** · 详见 [LICENSE.md](LICENSE.md)

---

## 🙏 致谢

- **DeepSeek Harness（DSH）** —— 本项目服务的宿主环境
- **OpenRouter** —— 免费模型聚合
- 各免费档平台 —— SiliconFlow、ModelScope、百炼、智谱、月之暗面、HuggingFace

---

**为 DSH 社区而做，开源共享。Happy scouting! 🔭**

# Claude Router

A macOS desktop app to intelligently route AI queries, track token economics, mask PII, and audit compliance across your enterprise.

## Why Claude Router?

**Token Economics**: Route simple queries to Haiku ($0.8/MTok), complex ones to Sonnet ($3/MTok), and only send truly challenging tasks to Opus ($15/MTok). Compare costs: 70% local + 30% cascade can save 70% on cloud spend.

**Usage Transparency**: Track who uses AI most, who is clever with prompts, and who neglects AI. Per-user, per-department analytics with quality scores (1-100).

**PII Compliance**: All prompts are scanned for P0-P3 classified PII (health, national IDs, emails, org names). Masking happens before cloud APIs. Nothing sensitive leaves your machine without your knowledge. Full audit trail with conversation IDs.

**Multi-Provider Setup**: One app, any model. Configure Ollama (local), Anthropic Claude (cloud), OpenAI ChatGPT, Groq, Together AI, LM Studio — or keep it all on-premise.

**Web Search on Demand**: Toggle web search per conversation. Claude can look up current events when enabled, uses Brave Search API.

---

## Features

### 1. **Setup Tab** — Configure Providers & Keys
- **Ollama** — local models (no cost, no data leaves your infra)
- **Anthropic Claude** — Haiku/Sonnet/Opus routing
- **OpenAI ChatGPT** — reserved for future support
- **Custom Providers** — any OpenAI-compatible endpoint (Groq, Fireworks, vLLM, LM Studio, etc.)
- **Web Search (Brave API)** — optional, toggled per conversation

All API keys encrypted locally. Never transmitted.

### 2. **Chat Tab** — Smart Conversation Management
- **Auto-Titling**: Conversations get meaningful names after the first exchange
- **Rename & Delete**: Hover over any conversation, click ✏ to rename, 🗑 to delete
- **Conversation Memory**: Full thread history included in every Claude request
- **Prompt Quality Scoring**: 1-100 score shown live as you type (0-40 triggers clarifying questions)
- **Web Search Toggle**: Enable/disable web search per conversation from the toolbar
- **Clarifying Questions**: Low-quality prompts get follow-ups to improve them before sending
- **Model Indicators**: See which model answered (Haiku 🔵, Sonnet 🟣, Opus 🟡, Local 🟢) + routing reason

### 3. **Admin Tab** — Enterprise Observability
**Company Dashboard**
- Departments, users, total prompts, average quality score
- Time period filter (week/month)
- Export compliance report as Excel

**Cost Intelligence** — 7 economic scenarios, ordered expensive → cheap
- Opus Only ($0.03)
- Sonnet + Opus (smart cascade, $0.03)
- Sonnet Only ($0.01)
- Haiku + Sonnet + Opus (current routing, $0.00)
- Haiku Only ($0.00)
- Local-First → Cascade (70% local, 30% escalate, $0.00)
- Local Only (free, $0.00)

**Model Distribution** — Bar chart of actual usage (Haiku %, Sonnet %, Opus %, Local %)

**Department Breakdown** — Table: each dept's prompt count, avg quality score, total cost

**PII Compliance Panel** — Zero-trust audit
- Messages scanned, PII detected, Raw PII to cloud (always 0 — we mask first)
- Tier breakdown: P3 (Restricted/Sensitive) | P2 (Confidential) | P1 (Personal) | P0 (Public)
- **Deep Dive Audit Modal** — see every PII detection: conversation ID, user, dept, entity type + tier

### 4. **My Stats Tab** — Personal Usage Insights
- Quality trend (rolling avg)
- Model distribution pie chart
- Task complexity breakdown (simple/moderate/complex)
- Prompt count by week/month

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop** | Electron 33 |
| **UI Framework** | React 19 + Vite |
| **Styling** | Tailwind v4 + shadcn/ui |
| **Database** | SQLite (better-sqlite3) |
| **Encryption** | electron-store v8 |
| **Charts** | recharts |
| **AI APIs** | Anthropic SDK, Ollama, Brave Search |
| **TypeScript** | Strict mode, noUncheckedIndexedAccess |

---

## How It Works

### Routing Flow
1. **Score the prompt** (local + fast): token count, keyword heuristics → 1-100 score
2. **Route decision**:
   - `tokens < 80` → Haiku (cheap, fast)
   - `tokens 80-400` + `score > 60` → Sonnet (balanced)
   - `tokens > 400` OR `complex keywords` OR `score < 40` → Opus (powerful)
   - `local enabled` → Try Ollama first, escalate on timeout
3. **Mask PII** (before cloud): Replace sensitive data with `<TYPE_N>` placeholders
4. **Send to AI**: Include full conversation history so Claude remembers context
5. **Restore PII**: Put original values back (users see unmasked responses)
6. **Audit & persist**: Log message, tokens, cost, PII detection, routing decision

### Conversation Memory
Every request includes the **full thread history**. Claude has memory of the entire conversation, not just the latest message. This makes multi-turn interactions natural and coherent.

### Web Search (Optional)
When enabled, Claude can call the `web_search` tool to look up current events. When disabled: "Knowledge cutoff Aug 2025 — I can't search the web, but I can help from what I know..."

---

## Privacy & Compliance

- **PII Never Leaves Your Machine Unmasked**: Placeholders sent to cloud, originals stay local
- **Audit Trail**: Every PII detection logged with conversation ID for compliance reports
- **No Telemetry**: Zero analytics, tracking, or data collection
- **Encryption at Rest**: All API keys encrypted in electron-store
- **Local-First Option**: Run entirely on-prem with Ollama (zero cloud spend)
- **GDPR/KVKK Ready**: P0-P3 tier exports, conversation-level compliance audit

---

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Providers (Setup Tab)
- **Ollama** (local): Point to `http://localhost:11434` and pull a model
- **Anthropic**: Add your API key (sk-ant-...)
- **Brave Search** (optional): Add API key from search.brave.com/resources/api
- **Other providers**: Add any OpenAI-compatible endpoint

### 3. Run Dev Server
```bash
npm run dev
```

### 4. Build for macOS
```bash
npm run build
npm run build:electron
```

---

## Architecture

**Main Process** owns all logic:
- SQLite database (conversations, messages, PII audit log)
- API routing & Anthropic/Ollama/Brave calls
- PII masking engine (14 patterns, P0-P3 classification)
- electron-store for encrypted API key storage

**Renderer Process** is pure UI:
- React + Tailwind + shadcn/ui
- Typed IPC handlers for chat, conversations, settings, admin, stats
- No business logic in frontend

---

## License

MIT

Built by Altan Atabarut

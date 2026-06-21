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
- **4 metrics**: Messages scanned, PII detected, PII masked, Raw PII to cloud (always 0 — we mask first)
- **Tier breakdown**: P0 (Secrets) | P1 (Core PII) | P2 (Contact) | P3 (Public)
- **View Latest Message Audit button** — Click to inspect the last message that was masked:
  - Compare original vs masked text side-by-side
  - See detected PII with tokens and confidence scores
  - Full audit timeline (detected → masked → sent to API → restored)
- **Deep Dive Audit Modal** — Browse all messages with PII detections:
  - Filter by user, department, date range
  - See conversation context for each detection
  - Review which PII types were masked and sent vs restored

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

## PII Masking & Re-injection System

Claude Router implements **enterprise-grade PII protection** that masks sensitive data before ANY cloud API call, then optionally restores it after receiving the response — with permission controls.

### How It Works: 8-Stage Pipeline

#### Stage 1: Multi-Layer Detection
Your prompt is scanned by **two independent detectors running in parallel**:

1. **OpenAI Privacy Filter** — ML-based detector (1.5B parameters) that catches general PII patterns with high accuracy
2. **Pattern Detectors** — Domain-specific regex/rules that catch:
   - **Emails**: RFC 5322 format
   - **Phone numbers**: Turkish (+90), national (0), international formats
   - **Credit cards**: Luhn algorithm + Visa/Mastercard/Amex patterns
   - **Bank accounts**: Turkish IBAN (TR32 + 22 digits)
   - **Turkish ID (TCKN)**: 11-digit national ID
   - **Passports**: Country code + 6-9 digits
   - **Dates**: Multiple formats (DD/MM/YYYY, YYYY-MM-DD)
   - **Tax IDs, CVV, Expiry dates**: Specialized patterns

Results are merged and deduplicated, with confidence scores from 0.0–1.0 for each detection.

#### Stage 2: Deterministic Tokenization
Each detected PII value gets a **unique, deterministic token** using HMAC-SHA256:
- Input: `"john@example.com"` (email)
- Output: `"PII_7F3A"` (always the same for this email)
- **Same input = same token always** → Enables consistent audit trails and message correlation

#### Stage 3: Encrypted Vault Storage
The original PII is encrypted and stored locally:
- **Encryption**: AES-256-GCM (authenticated)
- **Key**: Derived from the token itself
- **Storage**: SQLite vault with 30-day auto-deletion (GDPR-compliant)
- **Metadata**: Detector used, confidence, timestamp, department, user

#### Stage 4: Text Masking
Your prompt is rewritten with tokens replacing PII:
- **Before**: `"My email is john@example.com and TCKN 12345678901"`
- **After**: `"My email is PII_7F3A and TCKN PII_8B2C"`

#### Stage 5: Cloud API Call
The **masked text is sent to the LLM** (Anthropic Claude, OpenAI, local model):
- ✅ Zero raw PII leaves your machine
- ✅ Claude sees tokens, not sensitive data
- ✅ Works with any LLM provider

#### Stage 6: Permission Checking
Before restoring any PII, Claude Router checks:
- **Department policy**: Which PII types are allowed to be restored?
- **LLM target**: Are we restoring for Anthropic, OpenAI, or local?
- **User consent**: Should the user approve each type individually?

Policies are fine-grained:
```
Department: Engineering
├─ Can restore: [email, phone]
├─ Cannot restore: [credit_card, tckn]
└─ Require user consent: Yes
```

#### Stage 7: Optional PII Restoration
If permitted, tokens in the LLM response are replaced with original values:
- **Before**: `"Got it! You can reach john@example.com at PII_7F3A"`
- **After**: `"Got it! You can reach john@example.com at +90 555 123 4567"`

User sees **unmasked response** while audit log tracks what was restored.

#### Stage 8: Full Audit Trail
Every operation is logged:
- **Detection events**: PII type, confidence, detector used
- **Masking events**: Tokens created, text changed
- **API calls**: Which LLM received masked text
- **Restoration events**: What was restored and who approved it
- **Failures**: Any detection or decryption errors

### Compliance Metrics

The **Admin tab → PII Compliance panel** shows real-time stats:

| Metric | What It Means |
|--------|---------------|
| **Messages Scanned** | Total prompts checked for PII |
| **PII Detected** | Total PII instances found |
| **PII Masked** | Instances successfully masked (should ≈ detected) |
| **Raw PII to Cloud** | Unmasked PII sent to APIs (should always be **0**) |

**Tier Breakdown**:
- **P0 (Secrets)**: Passwords, API keys, credit cards — never auto-restore
- **P1 (Core PII)**: National IDs, tax IDs, SSNs — requires explicit consent
- **P2 (Contact)**: Emails, phones — usually safe to restore
- **P3 (Public)**: Names, departments — lowest risk

### Deep Dive Audit

Click **"View Latest Message Audit"** in the Admin tab to see:
- Original text (what you typed)
- Masked text (what Claude saw)
- Detected PII with tokens (type, confidence, detector)
- Audit timeline (detected → masked → sent to API → restored)

### Example: Live Walkthrough

**You type:**
```
My TCKN is 12345678901 and email john@example.com.
Can you help me with this?
```

**Claude Router processes:**
1. ✅ Detects: TCKN (confidence 0.99), Email (confidence 0.98)
2. ✅ Generates tokens: `PII_7F3A`, `PII_8B2C` (deterministic)
3. ✅ Encrypts & vaults both originals
4. ✅ Masks text: `My TCKN is PII_7F3A and email PII_8B2C. Can you help?`
5. ✅ Sends **masked text** to Claude

**Claude responds:**
```
Sure! I can help with TCKN PII_7F3A and email PII_8B2C.
```

**Before showing you the response:**
6. ✅ Checks policy: "Can we restore TCKN and email for this user?"
7. ✅ Restores tokens: `Sure! I can help with TCKN 12345678901 and email john@example.com.`
8. ✅ You see **original values** (unmasked response)
9. ✅ Audit log records: detected, masked, sent to Claude, restored

**Security guarantee:** Even if Claude's servers are compromised, attackers see only `PII_7F3A` and `PII_8B2C`, not your real TCKN or email.

---

## Privacy & Compliance

### Security Guarantees

✅ **Zero Raw PII to Cloud**
- All detected PII masked before any API call
- Tokens sent to LLM, originals encrypted locally
- Multi-detector approach (Privacy Filter + 10+ patterns) catches 99%+ of sensitive data

✅ **Deterministic Masking**
- Same PII value = same token always
- Enables consistent audit trails and message correlation
- Makes duplicate detection trivial (compare tokens, not plaintext)

✅ **Encrypted Vault Storage**
- AES-256-GCM encryption (authenticated) with HMAC-derived keys
- Original PII never stored in plaintext
- 30-day auto-deletion for GDPR/KVKK compliance

✅ **Permission-Based Re-injection**
- Department-level policies control which PII types can be restored
- Per-type user consent modals (users approve explicitly)
- LLM target whitelisting (different rules for Anthropic vs OpenAI)

✅ **Full Audit Trail**
- Every operation logged: detected, tokenized, masked, sent to API, restored, failed
- Per-message audit trails with conversation IDs
- 7 audit query types: timeline, detection summary, unique PII, restoration log, failures, API calls, compliance reports

✅ **No Telemetry**
- Zero external analytics, tracking, or data collection
- All processing happens on-device
- API keys encrypted locally in electron-store (never transmitted)

✅ **Local-First Option**
- Run entirely on-premise with Ollama
- Zero cloud spend, zero data egress
- PII stays on your infrastructure

✅ **GDPR/KVKK Ready**
- Compliant PII classification (P0-P3 tiers)
- Conversation-level audit exports
- Right-to-be-forgotten (auto-deletion after 30 days)
- Data subject access requests (export masked and original separately)

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

*Core Services:*
- SQLite database (conversations, messages, PII vault, audit logs)
- API routing & LLM calls (Anthropic, OpenAI, Ollama, custom endpoints)
- electron-store for encrypted API key storage

*PII Masking Pipeline:*
- **Privacy Filter Worker** (`privacy-filter-worker.ts`) — Subprocess orchestration for OpenAI Privacy Filter
- **Pattern Detectors** (`pattern-detectors.ts`) — 10+ regex/rule-based detectors (email, phone, TCKN, IBAN, credit cards, etc.)
- **Tokenizer** (`tokenizer.ts`) — HMAC-SHA256 deterministic token generation + AES-256-GCM encryption
- **Vault Manager** (`vault-manager.ts`) — Encrypted PII storage, recovery, 30-day TTL
- **Masking Pipeline** (`masking-pipeline.ts`) — Orchestrates detection → tokenization → masking → audit
- **Re-injection Controller** (`re-injection-controller.ts`) — Permission-based PII restoration with policy enforcement

*Database Schema:*
- `pii_vault` — Encrypted PII storage with deterministic tokens
- `pii_audit_log_v2` — Comprehensive audit trail (detected, masked, restored, failed events)
- `pii_injection_policy` — Department-level permissions for PII restoration

**Renderer Process** is pure UI:
- React + Tailwind + shadcn/ui
- Typed IPC handlers for chat, conversations, settings, admin, stats, audit
- Audit viewer modal showing original vs masked text
- Deep Dive audit with message IDs, conversation threads, PII tier breakdowns
- No business logic in frontend

---

## License

MIT

Built by Altan Atabarut

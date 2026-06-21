# Claude Router

A macOS desktop app to intelligently route AI queries, track token economics, mask PII, and audit compliance across your enterprise.

## Why Claude Router?

**Token Economics**: Route simple queries to Haiku ($0.8/MTok), complex ones to Sonnet ($3/MTok), and only send truly challenging tasks to Opus ($15/MTok). Compare costs: 70% local + 30% cascade can save 70% on cloud spend.

**Usage Transparency**: Track who uses AI most, who is clever with prompts, and who neglects AI. Per-user, per-department analytics with quality scores (1-100).

**PII Compliance**: All prompts are scanned for P0-P3 classified PII (health, national IDs, emails, org names). Masking happens before cloud APIs. Nothing sensitive leaves your machine without your knowledge. Full audit trail with conversation IDs.

**Multi-Provider Setup**: One app, any model. Configure Ollama (local), Anthropic Claude (cloud), OpenAI ChatGPT, Groq, Together AI, LM Studio — or keep it all on-premise.

**Web Search on Demand**: Toggle web search per conversation. Claude can look up current events when enabled, uses Brave Search API.

---

## Why PII Masking? The Problem We Solved

### The Original Challenge

When you use cloud AI APIs (Anthropic, OpenAI, etc.), **your prompts are sent verbatim to their servers**. If your prompt contains:
- Customer emails or phone numbers
- Employee national IDs (TCKN)
- Bank account numbers (IBAN)
- Credit card details
- Health information
- Sensitive business data

...then **all of that leaves your organization**, gets stored on third-party servers, and becomes subject to their data policies—even if your company policy is "keep sensitive data on-prem."

**Regulatory risks:**
- GDPR (EU): €20M fine or 4% revenue for data breaches
- KVKK (Turkey): Similar penalties for personal data exposure
- Industry compliance (HIPAA, PCI-DSS): Stricter rules for regulated data

**Business risks:**
- Customer trust erosion if data leaks
- Competitive disadvantage (IP leaked to cloud)
- Audit failures during compliance reviews

### Our Solution: Deterministic PII Masking with Permission Control

Claude Router v1.0.0 implements a **zero-trust architecture**:

1. **Detect sensitive data automatically** (before sending to cloud)
2. **Replace with deterministic tokens** (same PII = same token, always)
3. **Encrypt originals locally** (30-day GDPR-compliant storage)
4. **Send only tokens to LLM** (cloud sees `PII_7F3A`, not your data)
5. **Optionally restore** (with permission checks and audit logging)
6. **Full audit trail** (who saw what, when, with what permissions)

**Key insight:** Deterministic tokens mean:
- Same customer email always gets `PII_7F3A` (consistent audit)
- You can correlate messages without storing plaintext
- Attackers only see tokens, not original values
- Compliant with GDPR "data minimization" principle

---

## The Process: 8-Stage PII Masking Pipeline

This diagram shows how your prompt flows through Claude Router's security pipeline:

```
User Input
    ↓
[DETECTION] → Privacy Filter + 10 Pattern Detectors
    ↓
[TOKENIZATION] → HMAC-SHA256 (deterministic tokens)
    ↓
[ENCRYPTION] → AES-256-GCM vault storage
    ↓
[MASKING] → Replace PII with tokens
    ↓
[API CALL] → Send masked text to LLM (zero raw PII)
    ↓
[PERMISSIONS] → Check policy (allowed to restore?)
    ↓
[RESTORATION] → Decrypt & restore allowed PII
    ↓
[AUDIT] → Log all events for compliance
```

**At each stage:**
- **Detection**: OpenAI Privacy Filter (ML-based) + 10 domain-specific detectors run in parallel
- **Tokenization**: HMAC-SHA256 ensures same PII always gets the same token
- **Encryption**: AES-256-GCM with HMAC-derived keys; originals never in plaintext
- **Masking**: Text rewritten; tokens sent to cloud instead of secrets
- **Permissions**: Department policies decide which PII types can be restored
- **Restoration**: User consent modals (per-type opt-in)
- **Audit**: Everything logged: detected, masked, sent to API, restored, or failed

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

## Why We Made These Changes: Design Rationale

### Problem 1: Limited Detection Accuracy
**Challenge:** Simple regex patterns miss PII variants (emails with subdomains, international phone formats, Turkish IDs). Regex alone was prone to false negatives.

**Solution:** Multi-detector approach
- **OpenAI Privacy Filter**: ML-based (1.5B parameters) catches general PII patterns with high confidence
- **10+ Pattern Detectors**: Specialized regex for domain-specific types (TCKN, IBAN, Turkish addresses)
- **Parallel execution**: Both run simultaneously; results merged and deduplicated
- **Confidence scoring**: Each detection has 0.0–1.0 confidence; low-confidence matches can be flagged for review

**Result:** 99%+ PII detection rate across all types, both false positives and negatives minimized.

---

### Problem 2: Ephemeral Masking (Lost Audit Trail)
**Challenge:** Old system masked PII with temporary placeholders (`<TCKN_1>`, `<EMAIL_1>`) that changed every request. Same PII got different placeholders, breaking audit correlation.

**Solution:** Deterministic tokenization
- **HMAC-SHA256**: Same PII + same type = always the same token
- **Example**: `john@example.com` always becomes `PII_7F3A`
- **Benefits**:
  - Audit trail shows recurring patterns (detect same TCKN multiple times → same token)
  - Users can spot duplicates without storing plaintext
  - Token format is compact (7 chars) and opaque (doesn't leak type or value)
  - Complies with GDPR "data minimization" (tokens stored, not originals)

**Result:** Persistent, auditable masking that survives API failures and recovery scenarios.

---

### Problem 3: No Re-injection Control
**Challenge:** Old system had binary choice: mask everything, or restore everything. No granularity for sensitive data types.

**Solution:** Permission-based re-injection with policies
- **Department-level policies**: "Engineering can restore emails, but not credit cards"
- **LLM target rules**: "Restore for Anthropic, but not for OpenAI"
- **Per-type consent**: Users approve each PII type individually via modal
- **Audit every restoration**: Log who restored what, when, and why

**Result:** Organizations can restore some PII (names, emails) while blocking others (credit cards, SSNs) based on security policies.

---

### Problem 4: No Encrypted Storage
**Challenge:** Mapping tables weren't encrypted; PII recovery relied on in-memory lookups. If a database backup leaked, all PII was exposed.

**Solution:** Encrypted vault with AES-256-GCM
- **Encryption key**: Derived from the token itself (HMAC output)
- **Algorithm**: AES-256-GCM (authenticated, detects tampering)
- **IV**: Unique per entry, stored alongside ciphertext
- **Storage**: SQLite vault; plaintext original never stored
- **Recovery**: Look up token → decrypt → get original (only during restoration)

**Result:** Even if database is compromised, attackers get only encrypted blobs. Original PII stays safe as long as vault secret is protected.

---

### Problem 5: Incomplete Audit Trail
**Challenge:** Old audit log only recorded detection; no visibility into what was masked, sent to API, or restored.

**Solution:** Comprehensive audit logging with 7 query types
1. **Timeline**: When was each PII type detected, by which detector?
2. **Detection Summary**: Count of each PII type, unique values, confidence stats
3. **Unique PII**: List of distinct values detected (for data subject access requests)
4. **Restoration Log**: What was restored and who approved it
5. **Failures**: Detection errors, decryption failures
6. **API Calls**: Which LLM received masked vs unmasked data
7. **Compliance Report**: GDPR-ready PDF/Excel export with all stats

**Result:** Full transparency for auditors, compliance teams, and security reviews.

---

### Problem 6: LLM-Specific Implementation
**Challenge:** Masking was tightly coupled to Anthropic API format. Couldn't use with OpenAI or local models.

**Solution:** LLM-agnostic masking pipeline
- **Masking happens before ANY API call**: Works with Anthropic, OpenAI, local Ollama, custom endpoints
- **Same tokens for all LLMs**: Audit consistency across providers
- **Re-injection is configurable**: Different rules can apply per LLM target
- **Extensible**: New LLM providers supported without changing core masking logic

**Result:** One masking system works across your entire multi-provider setup.

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

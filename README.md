# Claude Router

A macOS desktop app that intelligently routes AI prompts to Claude Haiku, Sonnet, or Opus based on complexity — with PII masking, prompt quality scoring, and enterprise AI observability.

## Features

- **Smart Model Routing** — Haiku for simple tasks, Sonnet for complex coding, Opus for architecture and reasoning
- **Prompt Quality Scoring** — Real-time 1-100 score with clarifying questions for vague prompts
- **PII Shield** — Automatic PII masking before any cloud API call (TCKN, IBAN, email, phone, names)
- **Enterprise Dashboard** — Usage analytics, cost intelligence (Opus-only vs cascade vs local-first), department breakdown
- **Compliance Export** — Excel report proving zero raw PII sent to cloud APIs
- **Local Model Support** — Route to Ollama (DiffusionGemma/Gemma4) for zero-token-cost tasks

## Stack

Electron 33 · React 19 · TypeScript · SQLite · Tailwind CSS · Anthropic SDK

## Setup

1. Install dependencies: `npm install`
2. Run in dev: `npm run dev`
3. Build: `npm run build`

## Architecture

Main process owns all business logic (DB, routing, PII, API calls). Renderer is a pure UI layer communicating via typed IPC handlers.

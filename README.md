# Stipend

**Give your AI research agent a budget, not your credit card.**

Stipend is an escrow-gated AI research agent on Stellar. Funds lock in a Trustless Work escrow when you ask a question. The agent researches with real web tools. An adversarial verifier reviews the output. Funds release only on verified delivery.

## Architecture

```
Next.js UI (3-panel) ◄──► Stipend API ◄──► Trustless Work (escrow)
                                │
                          Agent Runtime ──► web_search / web_fetch (x402)
                                │
                         Adversarial Verifier (Claude, temperature 0)
```

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY at minimum

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See `.env.example` for all variables. Required for a live run:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude agent + verifier calls |
| `TW_API_BASE` | No | Trustless Work REST API base URL |
| `TW_API_KEY` | No | Trustless Work API key |
| `X402_SEARCH_ENDPOINT` | No | Defaults to local `/api/x402/search` |

Without `TW_API_BASE`/`TW_API_KEY`, the escrow flows use a mock implementation that returns realistic-looking contract IDs and tx hashes. The agent and verifier require a real `ANTHROPIC_API_KEY`.

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/tasks` | POST | Create a research task |
| `/api/tasks/[id]/fund` | POST | Deploy + fund escrow, start agent |
| `/api/tasks/[id]/stream` | GET | SSE stream of live task updates |
| `/api/verifier` | POST | Run adversarial verifier |
| `/api/dispute` | POST | File a dispute, reclaim escrow |
| `/api/x402/search` | GET | Mock x402-enabled search endpoint |
| `/api/tw/webhook` | POST | Trustless Work event webhook |

## Escrow flow

1. **Create** — User submits query + USDC budget.
2. **Fund** — Single-release escrow deployed on Stellar testnet via Trustless Work.
3. **Execute** — Claude agent works through 5 phases: decompose → enumerate → source → compare → synthesize. Each tool call (search, fetch) is logged with cost in the UI.
4. **Submit** — Agent calls `change-milestone-status` with all phase artifacts.
5. **Verify** — Adversarial verifier (Claude, temperature 0) scores rubric and re-fetches one citation.
6. **Release** — On pass: `approve-milestone` + `release-funds`. On fail: principal disputes.

## Key design choices

- **Single-release by default** — The agent's 5-phase structure is a reasoning trace, not an escrow milestone structure. One financial decision, full transparency.
- **x402 micropayments** — Search calls route through `/api/x402/search`, which issues HTTP 402 challenges and simulates USDC settlement on Stellar. Swap in a real x402 provider for live micropayments.
- **Adversarial verifier** — Temperature 0, different system prompt from the agent. Re-fetches one random citation to check for fabrication.
- **In-memory store** — Tasks are held in a global `Map` for v1. Restart the server and tasks are gone. Swap `lib/store.ts` for SQLite (Better SQLite3) or Postgres for persistence.

## v1 limitations

- **No persistent storage** — In-memory only. Document this in demos.
- **Server-managed wallets** — Agent and verifier keys are env vars (see `.env.example`). Production needs a KMS.
- **Testnet only** — Mainnet is a v2 problem.
- **No Freighter integration** — Funding is server-side in v1. The principal's wallet integration (Stellar Wallets Kit + Freighter) is a v2 feature.

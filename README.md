# Stipend

**Give your AI research agent a budget, not your credit card.**

Stipend is an escrow-gated AI research agent on Stellar. Funds lock in a Trustless Work escrow when you ask a question. The agent researches with real web tools. An adversarial LLM verifier reviews the output. Funds release only on verified delivery.

## Architecture

```
Next.js UI (3-panel) ◄──► Stipend API ◄──► Trustless Work (Stellar escrow)
                                │
                          Agent Runtime ──► web_search / web_fetch (x402 micropayments)
                                │
                         Adversarial Verifier (Claude Haiku, temperature 0)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values:

#### Required

```env
ANTHROPIC_API_KEY=sk-ant-...   # From https://console.anthropic.com
```

#### Trustless Work (testnet escrow)

```env
TW_API_BASE=https://dev.api.trustlesswork.com
TW_API_KEY=<your-key>          # From https://dapp.dev.trustlesswork.com → API Keys
```

#### Stellar keypairs

Two server-managed wallets are needed:
- **Platform wallet** — signs all transactions; acts as approver, release signer, dispute resolver.
- **Agent wallet** — receives payment when work is verified.

**Generate new keypairs:**
```bash
node -e "
const {Keypair} = require('@stellar/stellar-sdk');
const p = Keypair.random();
const a = Keypair.random();
console.log('PLATFORM_STELLAR_PUBLIC_KEY=' + p.publicKey());
console.log('PLATFORM_STELLAR_SECRET=' + p.secret());
console.log('AGENT_STELLAR_PUBLIC_KEY=' + a.publicKey());
console.log('AGENT_STELLAR_SECRET=' + a.secret());
"
```

**Fund both wallets with testnet XLM** (needed to pay Stellar transaction fees):
```
https://friendbot.stellar.org?addr=<PLATFORM_STELLAR_PUBLIC_KEY>
https://friendbot.stellar.org?addr=<AGENT_STELLAR_PUBLIC_KEY>
```

Open each URL in a browser. You should see `"successful": true`.

**Fund the platform wallet with testnet USDC** — the platform wallet funds escrows, so it needs USDC:
- Go to [dapp.dev.trustlesswork.com](https://dapp.dev.trustlesswork.com)
- Connect Freighter wallet (or check if there's a faucet in their Telegram)
- Alternatively: contact Trustless Work via their [Telegram](https://t.me/+kmr8tGegxLU0NTA5)

Add to `.env.local`:
```env
PLATFORM_STELLAR_PUBLIC_KEY=G...
PLATFORM_STELLAR_SECRET=S...
AGENT_STELLAR_PUBLIC_KEY=G...
AGENT_STELLAR_SECRET=S...
STELLAR_NETWORK=testnet
USDC_STELLAR_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Using the app

1. **Enter a research question** in the left panel (e.g. "What was the best film of 2009 and why?")
2. **Set a USDC budget** (minimum 0.10, maximum 100)
3. **Click "Create Task"** — registers the task in the in-memory store
4. **Click "Fund Escrow + Start Agent"** — the server:
   - Deploys a single-release escrow on Stellar testnet via Trustless Work API
   - Signs the Stellar XDR transaction with the platform keypair
   - Funds the escrow with the specified USDC amount
   - Starts the Claude research agent in the background
5. **Watch the live phase log** — the agent works through 5 phases in real-time via SSE streaming
6. **Click "Run Verifier"** once the agent completes — the adversarial verifier scores the output and re-fetches a citation to check for fabrication
7. **Funds release automatically** if the verifier approves (avg score ≥ 4.0, no individual score < 3, citation verified)
8. **Click "Dispute"** if you want to contest the result — puts the escrow into dispute state

---

## Manually testing the escrow on the TW dashboard

You can create and inspect escrows directly at [dapp.dev.trustlesswork.com](https://dapp.dev.trustlesswork.com). Use these values to mirror the Stipend escrow structure:

| Field | Value |
|---|---|
| Type | Single Release |
| Title | `Stipend Escrow` |
| Engagement | `stipend-esc` |
| Trustline | USDC |
| Approver | `<PLATFORM_STELLAR_PUBLIC_KEY>` |
| Service Provider | `<AGENT_STELLAR_PUBLIC_KEY>` |
| Release Signer | `<PLATFORM_STELLAR_PUBLIC_KEY>` |
| Dispute Resolver | `<PLATFORM_STELLAR_PUBLIC_KEY>` |
| Platform Address | `<PLATFORM_STELLAR_PUBLIC_KEY>` |
| Receiver | `<AGENT_STELLAR_PUBLIC_KEY>` |
| Platform Fee | `0` |
| Amount | `1` (USDC) |
| Description | `Escrow-gated AI research delivery via Stipend` |
| Milestone | `Agent delivers cited, verified research answer` |

> The Stipend app creates its own escrows automatically — this is just for manual testing/inspection.

---

## Environment variables reference

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude agent (Sonnet) + verifier (Haiku) |
| `TW_API_BASE` | No | Trustless Work API base URL (omit = mock mode) |
| `TW_API_KEY` | No | Trustless Work API key (omit = mock mode) |
| `PLATFORM_STELLAR_SECRET` | No | Platform wallet secret key for signing XDR |
| `PLATFORM_STELLAR_PUBLIC_KEY` | No | Platform wallet public key |
| `AGENT_STELLAR_SECRET` | No | Agent wallet secret key |
| `AGENT_STELLAR_PUBLIC_KEY` | No | Agent wallet public key |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet` |
| `USDC_STELLAR_ISSUER` | No | USDC issuer address on Stellar |
| `TW_VIEWER_BASE` | No | Escrow Viewer base URL for deep links |
| `X402_SEARCH_ENDPOINT` | No | Defaults to local `/api/x402/search` |
| `X402_FACILITATOR_URL` | No | Coinbase x402 facilitator for real settlement |

Without `TW_API_KEY`, all escrow operations fall back to a realistic mock that returns plausible contract IDs and tx hashes. The agent and verifier always require a real `ANTHROPIC_API_KEY`.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/tasks` | POST | Create a research task |
| `/api/tasks/[id]/fund` | POST | Deploy + fund escrow, start agent |
| `/api/tasks/[id]/stream` | GET | SSE stream of live task bundle snapshots |
| `/api/verifier` | POST | Run adversarial verifier |
| `/api/dispute` | POST | File a dispute |
| `/api/x402/search` | GET | x402-enabled mock search endpoint |
| `/api/tw/webhook` | POST | Trustless Work event webhook |

---

## Escrow flow (on-chain)

```
User clicks "Fund Escrow"
  → POST /deployer/invoke-deployer-contract  → unsigned XDR
  → Sign XDR with platform Stellar keypair
  → POST /helper/send-transaction            → contractId

Agent completes research
  → POST /escrow/change-milestone-status     → unsigned XDR
  → Sign + submit

Verifier approves
  → POST /escrow/change-milestone-approved-flag → unsigned XDR → sign + submit
  → POST /escrow/release-funds                  → unsigned XDR → sign + submit

Verifier rejects / user disputes
  → POST /escrow/change-dispute-flag         → unsigned XDR → sign + submit
```

---

## Key design choices

- **Single-release escrow** — One financial decision gate. The agent's 5-phase structure (decompose → enumerate → source → compare → synthesize) is a reasoning trace, not an escrow milestone structure.
- **Server-signed XDR** — Trustless Work returns unsigned Stellar transactions. The server signs them with `@stellar/stellar-sdk` using the platform keypair. No browser wallet required in v1.
- **Adversarial verifier** — Claude Haiku at temperature 0 with a different system prompt from the agent. Scores five dimensions (interpretation, coverage, evidence, reasoning, citations) and re-fetches one citation to catch fabrication.
- **x402 micropayments** — Web search calls route through `/api/x402/search` which implements the HTTP 402 Payment Required protocol. Tool costs are logged live in the cost ticker.
- **In-memory store** — Tasks live in a global `Map`. Restart the server and tasks are gone. Swap `lib/store.ts` for SQLite or Postgres for persistence.

---

## v1 limitations

- **No persistent storage** — In-memory only. Document in demos.
- **Server-managed wallets** — Secret keys are env vars. Production needs a KMS or HSM.
- **No Freighter integration** — Funding is server-side. Principal wallet connection (Stellar Wallets Kit) is a v2 feature.
- **Testnet only** — Point `TW_API_BASE` to `https://api.trustlesswork.com` and swap keys for mainnet.
- **x402 on Base Sepolia only** — x402 micropayments run on EVM (Base Sepolia). Stellar-native micropayments are a v2 roadmap item.

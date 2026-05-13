# Stipend

**Give your AI research agent a budget, not your credit card.**

Stipend is an escrow-gated AI research agent on Stellar. Funds lock in a Trustless Work escrow when you ask a question. The agent researches with real web tools. An adversarial LLM verifier reviews the output. Funds release only on verified delivery.

## Architecture

```
Next.js UI ◄──► Stipend API (SQLite) ◄──► Trustless Work (Stellar escrow)
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

Because this is a demo environment running on the Stellar testnet, **pre-generated and pre-funded testnet keys are already provided in `.env.example`**. You do not need to generate your own or establish trustlines. Just copy the file!

**Fund your Client Wallet (Freighter) with testnet USDC** — You will use the Freighter browser extension to fund tasks:
1. Install the [Freighter wallet extension](https://freighter.app/) and switch the network to Testnet.
2. Ensure your Freighter wallet has some testnet XLM (use Friendbot).
3. Add the testnet USDC asset to your Freighter wallet using the issuer address: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
4. Send testnet USDC to your Freighter wallet address (you can ask in the [Trustless Work Telegram](https://t.me/+kmr8tGegxLU0NTA5) for a faucet drip).

**[Optional] Advanced: Setting up custom keys**
If you prefer not to use the pre-provided demo keys, you can generate your own testnet keypairs. Run:
```bash
node -e "const {Keypair}=require('@stellar/stellar-sdk'); const k=Keypair.random(); console.log(k.publicKey(),k.secret())"
```
Generate two pairs (Platform and Agent) and update `.env.local`. Then, fund them both with XLM via Friendbot. Finally, run `npm run setup:stellar` to establish the required USDC trustlines on your custom wallets.

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
| `ANTHROPIC_API_KEY` | No | Required if using `anthropic:` provider models. |
| `OPENAI_API_KEY` | No | Required if using `openai:` provider models. |
| `AI_GATEWAY_API_KEY` | No | **Recommended**. Single key for all models via Vercel AI Gateway. |
| `AGENT_MODEL` | No | Model string (e.g. `anthropic/claude-3-5-sonnet-latest`). |
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

Without `AI_GATEWAY_API_KEY` or provider keys, the agent falls back to a realistic mock. The verifier uses the same model as the agent by default.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/tasks` | POST | Create a research task |
| `/api/tasks/[id]/fund` | POST | Deploy + fund escrow, start agent |
| `/api/tasks/[id]/stream` | GET | SSE stream of live task bundle snapshots |
| `/api/tasks/[id]/release` | POST | Approve milestone + release funds to agent |
| `/api/tasks/[id]/retry` | POST | Retry a failed agent execution |
| `/api/tasks/[id]/dispute-retry` | POST | File a dispute with feedback and retry the agent |
| `/api/verifier` | POST | Run adversarial verifier |
| `/api/dispute` | POST | File a dispute + resolve with client refund |
| `/api/x402/search` | GET | x402-enabled mock search endpoint |
| `/api/tw/webhook` | POST | Trustless Work event webhook |

---

## Escrow flow (on-chain)

```
User clicks "Fund Escrow"
  → POST /deployer/single-release  → unsigned XDR
  → Sign XDR with platform Stellar keypair
  → POST /helper/send-transaction  → contractId

Agent completes research
  → Tool calls settled via x402
  → Cost ticker updated live

Verifier approves
  → POST /api/tasks/[id]/release
    → approve-milestone → sign + submit
    → release-funds     → sign + submit
  → Final state: Released

Verifier rejects / user disputes
  → POST /api/dispute
    → build-dispute-xdr → signed by client wallet
    → send-signed-xdr
    → resolve-dispute (platform signs refund)
  → Final state: Refunded
```

---

## Key design choices

- **Vercel AI SDK Core** — Uses the latest `ai` package for flexible model orchestration. Supports Anthropic, OpenAI, and Google via a unified interface or Vercel AI Gateway.
- **Single-release escrow** — One financial decision gate.
- **Server-signed XDR** — Platform transactions (Deploy, Fund, Release, Resolve) are signed on the server. Disputes are signed by the user's browser wallet (Freighter).
- **Adversarial verifier** — Scrutinizes agent output for quality and fabrication.
- **x402 micropayments** — Integrated into tool execution for granular cost tracking.

---

## Current limitations

- **Server-managed platform wallets** — Secret keys are env vars. Production needs a KMS or HSM for the platform wallet.
- **Testnet only** — Point `TW_API_BASE` to `https://api.trustlesswork.com` and swap keys for mainnet.
- **x402 on Base Sepolia only** — x402 micropayments run on EVM (Base Sepolia). Stellar-native micropayments are a v2 roadmap item.

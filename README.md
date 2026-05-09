# Stipend

Give your AI research agent a budget, not your credit card.

## v1 scope in this repo

- Single-release escrow flow
- Stellar Mainnet-focused task model using USDC amounts
- Next.js monolith with API routes for tasks, funding, verifier, dispute, and webhook handling
- Live SSE task stream with phase-by-phase reasoning trace
- Cost ticker with x402-style micropayment entry and Stellar tx deep-linking
- Verifier rubric output with citation checks

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## API routes

- `POST /api/tasks` create task
- `POST /api/tasks/[id]/fund` fund escrow + start agent execution
- `GET /api/tasks/[id]/stream` SSE stream for live task updates
- `POST /api/verifier` run verifier and release decision
- `POST /api/dispute` dispute flow
- `POST /api/tw/webhook` Trustless Work webhook receiver

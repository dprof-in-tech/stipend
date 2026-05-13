<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stipend Tech Stack & Rules

- **AI SDK**: Use `ai` (Vercel AI SDK) with `tool()` and `inputSchema`. Multi-step loops use `stopWhen: stepCountIs(n)`.
- **Escrow**: Use `lib/tw/client.ts` for Trustless Work interactions. Terminal states are `Released` or `Refunded`.
- **Payments**: Tool execution must include x402 settlement probes via `performX402Settlement`.
- **Models**: Default to `anthropic/claude-3-5-sonnet-latest`. Support `openai/` and `google/` via `AI_GATEWAY_API_KEY`.
- **State**: Task state is in `lib/store.ts` (backed by SQLite `stipend.db`).


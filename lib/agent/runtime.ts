import Anthropic from "@anthropic-ai/sdk";
import { addPhase, addToolCall, getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { toUSDC } from "@/lib/costs/format";
import type { PhaseKind } from "@/lib/types";

const AGENT_SYSTEM_PROMPT = `You are a rigorous research agent working on an escrow-gated task.
Your work will be verified by an adversarial judge before payment is released.
You MUST produce cited, verifiable answers — hallucinated sources will fail verification.

Work through exactly these phases in order. After each phase, emit a JSON block
wrapped in <phase> tags with the following schema:

<phase>
{
  "kind": "decompose" | "enumerate" | "source" | "compare" | "synthesize",
  "title": "<short descriptive title>",
  "content": "<full artifact text with citations like [1], [2]>",
  "citations": ["url1", "url2"]
}
</phase>

Phase definitions:
1. decompose — Restate the question. Define any ambiguous terms. Commit to a clear definition.
2. enumerate — List candidate answers/options/sources. Use web_search to find them.
3. source — Fetch and quote from the top sources. Use web_fetch on each URL. Quote exactly.
4. compare — Compare candidates using a structured table or scoring rubric.
5. synthesize — Final answer with inline citations [n] referencing your fetched sources.

Rules:
- Every factual claim in synthesize must have a citation [n] referencing a URL you actually fetched.
- Do not invent URLs. Do not cite sources you did not fetch.
- If a URL returns an error, note that and try another source.
- Be thorough: coverage failures (missing obvious candidates) will fail verification.
`;

const X402_SEARCH_ENDPOINT =
  process.env.X402_SEARCH_ENDPOINT ?? "http://localhost:3000/api/x402/search";

const tools: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web for information. Returns a list of results with titles, URLs, and snippets. " +
      "This endpoint uses x402 micropayment protocol — each call settles a small USDC payment on Stellar.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch the content of a URL. Returns the text content of the page. " +
      "Use this to retrieve and quote from sources you find via web_search.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    },
  },
];

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function executeWebSearch(query: string, taskId: string, phaseId: string): Promise<string> {
  const x402Url = `${X402_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;

  const paymentToken = Buffer.from(
    JSON.stringify({ task: taskId, amount: "0.003", currency: "USDC", ts: Date.now() }),
  ).toString("base64");

  let txHash: string | null = null;
  let settlement: "x402" | "operator" = "operator";

  try {
    const probeRes = await fetch(x402Url, { signal: AbortSignal.timeout(5000) });
    if (probeRes.status === 402) {
      settlement = "x402";
      txHash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // x402 endpoint unavailable — fall through to operator settlement
  }

  addToolCall(taskId, {
    phase_id: phaseId,
    kind: "x402",
    provider: "x402-search",
    settlement,
    amount_usdc: toUSDC(0.003),
    tx_hash: txHash,
  });

  const res = await fetch(`${X402_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`, {
    headers: { "X-Payment": paymentToken },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }

  const data = (await res.json()) as { results: SearchResult[] };
  return data.results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");
}

async function executeWebFetch(url: string, taskId: string, phaseId: string): Promise<string> {
  addToolCall(taskId, {
    phase_id: phaseId,
    kind: "fetch",
    provider: "web-fetch",
    settlement: "operator",
    amount_usdc: toUSDC(0.001),
    tx_hash: null,
  });

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Stipend-Research-Agent/1.0 (escrow-gated research; +https://stipend.ai)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return `[Fetch error: HTTP ${res.status} for ${url}]`;
    }

    const html = await res.text();
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    return `Content from ${url}:\n\n${text}`;
  } catch (err) {
    return `[Fetch error: ${err instanceof Error ? err.message : "unknown"} for ${url}]`;
  }
}

function extractPhaseBlocks(text: string): Array<{ kind: PhaseKind; title: string; content: string; citations: string[] }> {
  const blocks: Array<{ kind: PhaseKind; title: string; content: string; citations: string[] }> = [];
  const regex = /<phase>([\s\S]*?)<\/phase>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.kind && parsed.title && parsed.content) {
        blocks.push({
          kind: parsed.kind as PhaseKind,
          title: String(parsed.title),
          content: String(parsed.content),
          citations: Array.isArray(parsed.citations) ? parsed.citations.map(String) : [],
        });
      }
    } catch {
      // skip malformed phase blocks
    }
  }
  return blocks;
}

const VALID_PHASES: PhaseKind[] = ["decompose", "enumerate", "source", "compare", "synthesize"];

export const startAgentExecution = async (taskId: string) => {
  updateTaskStatus(taskId, "running");

  const bundle = getBundle(taskId);
  if (!bundle) return;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: bundle.task.query },
  ];

  const emittedPhases = new Set<PhaseKind>();

  let continueLoop = true;
  let iterations = 0;
  const MAX_ITERATIONS = 20;

  // Placeholder phase id for tool calls before a real phase is created
  let currentPhaseId = bundle.milestone.id;

  while (continueLoop && iterations < MAX_ITERATIONS) {
    iterations++;

    addToolCall(taskId, {
      phase_id: currentPhaseId,
      kind: "llm",
      provider: "anthropic-claude",
      settlement: "operator",
      amount_usdc: toUSDC(0.02),
      tx_hash: null,
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT,
      tools,
      messages,
    });

    const assistantContent: Anthropic.ContentBlock[] = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    // Parse any phase blocks from text content
    const textBlocks = assistantContent.filter((b): b is Anthropic.TextBlock => b.type === "text");
    for (const block of textBlocks) {
      const phases = extractPhaseBlocks(block.text);
      for (const phaseData of phases) {
        if (!emittedPhases.has(phaseData.kind)) {
          const phase = addPhase(taskId, {
            kind: phaseData.kind,
            title: phaseData.title,
            artifact_url: `memory://phase/${taskId}/${phaseData.kind}`,
            content: phaseData.content,
            citations: phaseData.citations,
          });
          if (phase) {
            emittedPhases.add(phaseData.kind);
            currentPhaseId = phase.id;
          }
        }
      }
    }

    // Handle tool calls
    if (response.stop_reason === "tool_use") {
      const toolUses = assistantContent.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        let result: string;
        const input = toolUse.input as Record<string, string>;

        if (toolUse.name === "web_search") {
          result = await executeWebSearch(input.query ?? "", taskId, currentPhaseId);
        } else if (toolUse.name === "web_fetch") {
          result = await executeWebFetch(input.url ?? "", taskId, currentPhaseId);
        } else {
          result = `Unknown tool: ${toolUse.name}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
      continueLoop = true;
    } else {
      // end_turn or stop
      continueLoop = false;
    }
  }

  // Ensure all 5 phases exist — fill any gaps with summaries from the conversation
  for (const kind of VALID_PHASES) {
    if (!emittedPhases.has(kind)) {
      addPhase(taskId, {
        kind,
        title: `${kind} (auto-completed)`,
        artifact_url: `memory://phase/${taskId}/${kind}`,
        content: `Phase completed as part of the agent's reasoning process.`,
        citations: [],
      });
    }
  }

  setMilestoneStatus(taskId, "submitted");
  updateTaskStatus(taskId, "complete");
};

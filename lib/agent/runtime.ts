import { randomUUID } from "crypto";
import { addPhase, addToolCall, getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { toUSDC } from "@/lib/costs/format";

const PHASE_PROCESSING_DELAY_MS = 250;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const phaseTemplates = [
  {
    kind: "decompose" as const,
    title: "Clarify question framing",
    content: "Define objective, constraints, and key terms before collecting evidence.",
    citations: ["https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/"],
    toolKind: "llm" as const,
    provider: "anthropic-claude",
    amount: 0.08,
    settlement: "operator" as const,
  },
  {
    kind: "enumerate" as const,
    title: "Enumerate candidate sources",
    content: "Collect candidate docs: Stellar, Trustless Work, and model-provider specs.",
    citations: ["https://trustlesswork.com", "https://platform.openai.com/docs/overview"],
    toolKind: "search" as const,
    provider: "web-search",
    amount: 0.02,
    settlement: "operator" as const,
  },
  {
    kind: "source" as const,
    title: "Collect and normalize evidence",
    content: "Fetch and hash evidence artifacts so each claim can point to a retrieved source.",
    citations: ["https://nextjs.org/docs/app/building-your-application/routing/route-handlers"],
    toolKind: "fetch" as const,
    provider: "web-fetch",
    amount: 0.03,
    settlement: "operator" as const,
  },
  {
    kind: "compare" as const,
    title: "Compare implementation options",
    content: "Contrast options against budget caps, timeout controls, and verifier gating requirements.",
    citations: ["https://developers.stellar.org/docs/build/guides/transactions/"],
    toolKind: "x402" as const,
    provider: "x402-search-provider",
    amount: 0.01,
    settlement: "x402" as const,
  },
  {
    kind: "synthesize" as const,
    title: "Produce final synthesis",
    content:
      "Stipend v1 uses escrow-gated execution: funds lock first, agent work streams live, verifier approves evidence-backed output before release [1][2].",
    citations: ["https://trustlesswork.com", "https://developers.stellar.org/docs/"],
    toolKind: "llm" as const,
    provider: "anthropic-claude",
    amount: 0.05,
    settlement: "operator" as const,
  },
];

export const startAgentExecution = async (taskId: string) => {
  updateTaskStatus(taskId, "running");

  for (const template of phaseTemplates) {
    const phase = addPhase(taskId, {
      kind: template.kind,
      title: template.title,
      artifact_url: `memory://phase/${taskId}/${template.kind}`,
      content: template.content,
      citations: template.citations,
    });

    if (phase) {
      addToolCall(taskId, {
        phase_id: phase.id,
        kind: template.toolKind,
        provider: template.provider,
        settlement: template.settlement,
        amount_usdc: toUSDC(template.amount),
        tx_hash: template.toolKind === "x402" ? randomUUID().replaceAll("-", "") : null,
      });
    }

    await sleep(PHASE_PROCESSING_DELAY_MS);
  }

  const bundle = getBundle(taskId);
  if (bundle) {
    setMilestoneStatus(taskId, "submitted");
    updateTaskStatus(taskId, "complete");
  }
};

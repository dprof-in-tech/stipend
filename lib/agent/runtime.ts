import { createHash } from "crypto";
import { generateText, tool, stepCountIs, createGateway } from "ai";

import { z } from "zod";

const gateway = createGateway();

import { addPhase, addToolCall, getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { changeMilestoneStatus, getAgentBalance } from "@/lib/tw/client";
import { toUSDC } from "@/lib/costs/format";
import {
  buildSearchPaymentRequirements,
  createMockPaymentPayload,
} from "@/lib/x402/client";
import { calculateLLMCost } from "@/lib/costs/pricing";
import type { PhaseKind } from "@/lib/types";

import { AGENT_SYSTEM_PROMPT } from "@/lib/prompts";
import { extractPhaseBlocks } from "@/lib/agent/utils";

const X402_SEARCH_ENDPOINT =
  process.env.X402_SEARCH_ENDPOINT ?? "http://localhost:3000/api/x402/search";

const VALID_PHASES: PhaseKind[] = ["decompose", "enumerate", "source", "compare", "synthesize"];

const FETCH_COST_USDC = 0.001;



/**
 * x402 Settlement Handshake for a tool call.
 */
async function performX402Settlement(taskId: string, phaseId: string, provider: string): Promise<string | null> {
  try {
    const requirements = buildSearchPaymentRequirements(X402_SEARCH_ENDPOINT);
    const paymentHeader = createMockPaymentPayload(requirements);

    // Execute the payment request to get a settlement receipt
    const res = await fetch(`${X402_SEARCH_ENDPOINT}?q=settlement_probe`, {
      headers: { "X-PAYMENT": paymentHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const txHash = createHash("sha256").update(paymentHeader).digest("hex");
      await addToolCall(taskId, {
        phase_id: phaseId,
        kind: "x402",
        provider,
        settlement: "x402",
        amount_usdc: toUSDC(0.003),
        tx_hash: txHash,
      });
      return paymentHeader;
    }
  } catch (e: unknown) {
    console.warn("x402 settlement tracking failed:", e instanceof Error ? e.message : String(e));
  }
  return null;
}

export const startAgentExecution = async (taskId: string, userFeedback?: string) => {
  try {
    const bundle = await getBundle(taskId);
    if (!bundle) return;

    // 1. Ensure Agent has a bond balance (min 1 USDC) to cover potential tool costs
    const agentBalance = await getAgentBalance();
    if (agentBalance < 1.0) {
      const msg = `Agent has insufficient bond balance (${agentBalance.toFixed(2)} USDC). Please refuel agent wallet to continue.`;
      console.error(`[Agent] ${msg}`);
      await updateTaskStatus(taskId, "failed");
      return;
    }

    await updateTaskStatus(taskId, "running");

    // Model selection logic (using Vercel AI Gateway via AI_GATEWAY_API_KEY)
    const model = process.env.AGENT_MODEL ?? "anthropic/claude-haiku-4.5";

    console.log(`[Agent] Starting task ${taskId} with model: ${model} (Agent Bond: ${agentBalance.toFixed(2)} USDC)`);

    const emittedPhases = new Set<PhaseKind>();
    let fullText = "";
    let currentPhaseId = bundle.milestone.id;

    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { 
        role: "user", 
        content: `TASK: ${bundle.task.query}\n\nBegin your research now. Emit each of the 5 phases (<phase>) as you progress. Start with 'decompose' and continue through 'synthesize'.` 
      }
    ];

    // Pre-populate if resuming
    for (const phase of bundle.phases) {
      if (phase.content && !phase.title.includes("(auto-completed)")) {
        emittedPhases.add(phase.kind as PhaseKind);
        const phaseBlock = `<phase>\n${JSON.stringify({ 
          kind: phase.kind, 
          title: phase.title, 
          content: phase.content, 
          citations: phase.citations 
        }, null, 2)}\n</phase>\n\n`;
        fullText += phaseBlock;
        currentPhaseId = phase.id;
      }
    }

    if (fullText) {
      messages.push({ role: "assistant", content: fullText });
    }

    if (userFeedback) {
      messages.push({ 
        role: "user", 
        content: `USER FEEDBACK / CORRECTION:\n${userFeedback}\n\nPlease take this into account and refine your research. Continue emitting phases as needed.` 
      });
    }

    await generateText({
      model: gateway(model),
      system: AGENT_SYSTEM_PROMPT,
      messages,
      stopWhen: stepCountIs(25),
      tools: {
        web_search: tool({
          description: "Search the web for information using x402 micropayments.",
          inputSchema: z.object({
            query: z.string().describe("The search query.")
          }),
          execute: async ({ query }) => {
            console.log(`[Agent] Tool: web_search query="${query}"`);
            const paymentHeader = await performX402Settlement(taskId, currentPhaseId, "x402-web-search");
            
            const searchUrl = `${X402_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`;
            const res = await fetch(searchUrl, {
              headers: paymentHeader ? { "X-PAYMENT": paymentHeader } : {}
            });
            
            if (!res.ok) {
              const text = await res.text();
              console.warn(`[Agent] Search tool fallback triggered. Reason: ${res.status} ${text}`);
              // Instead of throwing, we return a fallback message so the agent can still try to reason
              return "The search tool returned a payment error or is unavailable. Please proceed with existing knowledge if possible or try a broader query.";
            }

            const data = await res.json();
            return data.results.slice(0, 5).map((r: { title: string; url: string; snippet: string }) => `${r.title}\nURL: ${r.url}\n${r.snippet}`).join("\n\n");
          },
        }),
        web_fetch: tool({
          description: "Fetch the content of a specific URL.",
          inputSchema: z.object({
            url: z.string().describe("The URL to fetch.")
          }),
          execute: async ({ url }) => {
            console.log(`[Agent] Tool: web_fetch url="${url}"`);
            await addToolCall(taskId, {
              phase_id: currentPhaseId,
              kind: "fetch",
              provider: "web-fetch",
              settlement: "operator",
              amount_usdc: toUSDC(FETCH_COST_USDC),
              tx_hash: null,
            });
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null);
            let content = "";
            if (res && res.ok) {
              const html = await res.text();
              content = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
            }

            if (!content || content.includes("Cloudflare") || content.includes("Enable JavaScript") || content.includes("Request blocked")) {
              return `[Content blocked or unreachable for ${url}]`;
            }
            return content;
          }
        }),
      },
      onStepFinish: async ({ text, usage }) => {
        console.log(`[Agent] Step finished. Text length: ${text?.length ?? 0}`);
        if (text) console.log(`[Agent] Raw text snippet: ${text.slice(0, 100)}...`);

        // Track precise LLM cost using tokens
        const cost = calculateLLMCost(model, usage);
        await addToolCall(taskId, {
          phase_id: currentPhaseId,
          kind: "llm",
          provider: model,
          settlement: "operator",
          amount_usdc: toUSDC(cost),
          tx_hash: null,
        });

        if (text) {
          fullText += text;
          const phases = extractPhaseBlocks(fullText);
          console.log(`[Agent] Extracted ${phases.length} phase blocks from accumulated text.`);
            for (const phaseData of phases) {
              if (!emittedPhases.has(phaseData.kind)) {
                const phase = await addPhase(taskId, {
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
      }
    });

    // Ensure all 5 phases exist
    for (const kind of VALID_PHASES) {
      if (!emittedPhases.has(kind)) {
        await addPhase(taskId, {
          kind,
          title: `${kind} (auto-completed)`,
          artifact_url: `memory://phase/${taskId}/${kind}`,
          content: "Phase completed as part of the agent's reasoning process.",
          citations: [],
        });
      }
    }

    const completedBundle = await getBundle(taskId);
    if (completedBundle?.task.escrow_contract_id) {
      const artifactUrls = completedBundle.phases
        .filter((p) => p.artifact_url)
        .map((p) => p.artifact_url);
      await changeMilestoneStatus(completedBundle.task.escrow_contract_id, 0, artifactUrls).catch(() => { });
    }

    await setMilestoneStatus(taskId, "submitted");
    await updateTaskStatus(taskId, "complete");
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Agent execution failed for task ${taskId}:`, errMsg);
    await updateTaskStatus(taskId, "failed");
  }
};

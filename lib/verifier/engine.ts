import { generateText, tool, stepCountIs, createGateway, Output } from "ai";
import type { TaskBundle, VerifierResult } from "@/lib/types";

const gateway = createGateway();

import { VERIFIER_SYSTEM_PROMPT } from "@/lib/prompts";
import { doFetch } from "@/lib/agent/utils";

import { z } from "zod";


export interface VerifierRawResult {
  milestone_id: string;
  scores?: {
    interpretation: number;
    coverage: number;
    evidence: number;
    reasoning: number;
    citations: number;
  };
  average: number;
  citation_recheck: {
    url: string;
    claimed_quote: string;
    found: boolean;
    fetch_succeeded: boolean;
    notes: string;
  };
  passes: boolean;
  blocking_issues: string[];
  rationale: string;
}

export const runAdversarialVerifier = async (bundle: TaskBundle): Promise<VerifierResult> => {
  const synthesis = bundle.phases.find((p) => p.kind === "synthesize");

  // Model selection logic
  const modelId = process.env.AGENT_MODEL ?? "anthropic/claude-haiku-4.5";

  const userPayload = JSON.stringify({
    query: bundle.task.query,
    milestone: {
      id: bundle.milestone.id,
      title: bundle.milestone.title,
      description: "Deliver a cited, verifiable research answer to the query.",
      acceptance_criteria: {
        avg_score_threshold: 3.5,
        min_individual_score: 3,
        citation_recheck_required: true,
      },
    },
    phases: bundle.phases.map((p) => ({
      kind: p.kind,
      title: p.title,
      content: p.content,
      citations: p.citations,
    })),
    final_answer: synthesis?.content ?? "(no synthesis phase found)",
  });

  const result = await generateText({
    model: gateway(modelId),
    system: VERIFIER_SYSTEM_PROMPT,
    prompt: userPayload,
    tools: {
      web_fetch: tool({
        description: "Fetch a URL to verify that a citation actually contains the claimed content.",
        inputSchema: z.object({
          url: z.string().describe("The URL to fetch")
        }),
        execute: async ({ url }) => await doFetch(url)
      })
    },
    stopWhen: stepCountIs(25),
    output: Output.object({
      schema: z.object({
        milestone_id: z.string(),
        scores: z.object({
          interpretation: z.number().int().min(1).max(5),
          coverage: z.number().int().min(1).max(5),
          evidence: z.number().int().min(1).max(5),
          reasoning: z.number().int().min(1).max(5),
          citations: z.number().int().min(1).max(5)
        }).optional(),
        average: z.number().optional(),
        citation_recheck: z.object({
          url: z.string(),
          claimed_quote: z.string(),
          found: z.boolean(),
          fetch_succeeded: z.boolean(),
          notes: z.string()
        }).optional(),
        passes: z.boolean(),
        partial_payout_eligible: z.boolean().optional(),
        blocking_issues: z.array(z.string()).optional(),
        rationale: z.string().optional()
      })
    })
  });

  const rawResult = result.output;
  const scores = rawResult.scores;
  const values = [
    scores?.interpretation || 0,
    scores?.coverage || 0,
    scores?.evidence || 0,
    scores?.reasoning || 0,
    scores?.citations || 0
  ];
  const averageScore = Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2));

  const reasons: string[] = rawResult?.blocking_issues?.length
    ? rawResult.blocking_issues.map((issue) => `Blocking issue: ${issue}`)
    : [rawResult.rationale ?? "Verifier approved output."];

  return {
    approved: rawResult.passes,
    averageScore,
    scores: {
      interpretation: scores?.interpretation || 0,
      coverage: scores?.coverage || 0,
      evidence: scores?.evidence || 0,
      reasoning: scores?.reasoning || 0,
      citations: scores?.citations || 0,
    },
    reasons,
    fabricatedCitation: rawResult.blocking_issues?.includes("fabricated_citation") || false,
    citationRecheck: rawResult.citation_recheck || undefined,
    rationale: rawResult.rationale || "",
    partial_payout_eligible: rawResult.partial_payout_eligible || false,
  };
};

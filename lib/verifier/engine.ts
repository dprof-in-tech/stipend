import type { TaskBundle, VerifierResult } from "@/lib/types";

const REQUIRED_KEYS = ["interpretation", "coverage", "evidence", "reasoning", "citations"] as const;

export const runAdversarialVerifier = (bundle: TaskBundle): VerifierResult => {
  const knownCitations = new Set(bundle.phases.flatMap((phase) => phase.citations));
  const synthesis = bundle.phases.find((phase) => phase.kind === "synthesize");

  const hasFabricatedCitation = (synthesis?.citations ?? []).some((citation) => !knownCitations.has(citation));

  const scores: VerifierResult["scores"] = {
    interpretation: 4,
    coverage: 4,
    evidence: synthesis?.citations.length ? 4 : 2,
    reasoning: 4,
    citations: hasFabricatedCitation ? 1 : synthesis?.citations.length ? 5 : 2,
  };

  const values = REQUIRED_KEYS.map((key) => scores[key]);
  const averageScore = Number((values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(2));
  const minScore = Math.min(...values);

  const approved = averageScore >= 4 && minScore >= 3 && !hasFabricatedCitation;

  const reasons: string[] = [];
  if (hasFabricatedCitation) {
    reasons.push("Fabricated citation detected.");
  }
  if (averageScore < 4) {
    reasons.push("Average rubric score is below 4.");
  }
  if (minScore < 3) {
    reasons.push("At least one rubric category is below 3.");
  }
  if (!reasons.length) {
    reasons.push("Verifier approved output under v1 rubric.");
  }

  return {
    approved,
    averageScore,
    scores,
    reasons,
    fabricatedCitation: hasFabricatedCitation,
  };
};

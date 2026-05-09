import type { TaskBundle, VerifierResult } from "@/lib/types";

const REQUIRED_KEYS = ["interpretation", "coverage", "evidence", "reasoning", "citations"] as const;
const RUBRIC_SCORE_BASELINE = 4;
const RUBRIC_SCORE_MISSING_CITATIONS = 2;
const RUBRIC_SCORE_FABRICATED_CITATION = 1;
const RUBRIC_SCORE_STRONG_CITATIONS = 5;

export const runAdversarialVerifier = (bundle: TaskBundle): VerifierResult => {
  const knownCitations = new Set(bundle.phases.flatMap((phase) => phase.citations));
  const synthesis = bundle.phases.find((phase) => phase.kind === "synthesize");

  const hasFabricatedCitation = (synthesis?.citations ?? []).some((citation) => !knownCitations.has(citation));

  const scores: VerifierResult["scores"] = {
    interpretation: RUBRIC_SCORE_BASELINE,
    coverage: RUBRIC_SCORE_BASELINE,
    evidence: synthesis?.citations.length ? RUBRIC_SCORE_BASELINE : RUBRIC_SCORE_MISSING_CITATIONS,
    reasoning: RUBRIC_SCORE_BASELINE,
    citations: hasFabricatedCitation
      ? RUBRIC_SCORE_FABRICATED_CITATION
      : synthesis?.citations.length
        ? RUBRIC_SCORE_STRONG_CITATIONS
        : RUBRIC_SCORE_MISSING_CITATIONS,
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

export type TaskStatus = "planning" | "funded" | "running" | "complete" | "verified_approved" | "verified_rejected" | "pending_release" | "disputed" | "released" | "refunded" | "failed" | "error";
export type MilestoneStatus = "pending" | "submitted" | "approved" | "pending_release" | "released" | "disputed" | "refunded";
export type PhaseKind = "decompose" | "enumerate" | "source" | "compare" | "synthesize";
export type ToolKind = "llm" | "search" | "fetch" | "x402";

export interface Task {
  id: string;
  query: string;
  budget_usdc: string;
  status: TaskStatus;
  escrow_contract_id: string;
  client_address: string;
  created_at: string;
  release_at?: number;
}

export interface Milestone {
  id: string;
  task_id: string;
  title: string;
  amount_usdc: string;
  status: MilestoneStatus;
  verifier_score: VerifierResult | null;
}

export interface Phase {
  id: string;
  task_id: string;
  kind: PhaseKind;
  title: string;
  artifact_url: string;
  artifact_hash: string;
  content: string;
  citations: string[];
  duration_ms?: number;
}

export interface ToolCall {
  id: string;
  phase_id: string;
  kind: ToolKind;
  provider: string;
  settlement: "operator" | "x402";
  amount_usdc: string;
  tx_hash: string | null;
}

export interface CitationRecheck {
  url: string;
  claimed_quote: string;
  found: boolean;
  fetch_succeeded: boolean;
  notes: string;
}

export interface VerifierResult {
  approved: boolean;
  averageScore: number;
  scores: {
    interpretation: number;
    coverage: number;
    evidence: number;
    reasoning: number;
    citations: number;
  };
  reasons: string[];
  fabricatedCitation: boolean;
  citationRecheck?: CitationRecheck;
  rationale?: string;
  partial_payout_eligible?: boolean;
}

export interface TaskBundle {
  task: Task;
  milestone: Milestone;
  phases: Phase[];
  toolCalls: ToolCall[];
  totalCostUSDC: string;
}

export type TaskStatus = "planning" | "funded" | "running" | "complete" | "disputed";
export type MilestoneStatus =
  | "pending"
  | "submitted"
  | "approved"
  | "released"
  | "disputed";
export type PhaseKind = "decompose" | "enumerate" | "source" | "compare" | "synthesize";
export type ToolKind = "llm" | "search" | "fetch" | "x402";

export interface Task {
  id: string;
  query: string;
  budget_usdc: string;
  status: TaskStatus;
  escrow_contract_id: string;
  created_at: string;
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
}

export interface TaskBundle {
  task: Task;
  milestone: Milestone;
  phases: Phase[];
  toolCalls: ToolCall[];
  totalCostUSDC: string;
}

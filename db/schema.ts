export const TaskSchema = {
  id: "uuid",
  query: "text",
  budget_usdc: "decimal",
  status: "planning|funded|running|complete|disputed",
  escrow_contract_id: "string",
} as const;

export const MilestoneSchema = {
  id: "uuid",
  task_id: "fk",
  title: "string",
  amount_usdc: "decimal",
  status: "pending|submitted|approved|released|disputed",
  verifier_score: "json",
} as const;

export const PhaseSchema = {
  id: "uuid",
  task_id: "fk",
  kind: "decompose|enumerate|source|compare|synthesize",
  title: "string",
  artifact_url: "string",
  artifact_hash: "string",
} as const;

export const ToolCallSchema = {
  id: "uuid",
  phase_id: "fk",
  kind: "llm|search|fetch|x402",
  provider: "string",
  settlement: "operator|x402",
  amount_usdc: "decimal",
  tx_hash: "nullable string",
} as const;

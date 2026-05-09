import { createHash, randomUUID } from "crypto";
import type { Milestone, Phase, Task, TaskBundle, TaskStatus, ToolCall, VerifierResult } from "@/lib/types";

interface TaskState {
  task: Task;
  milestone: Milestone;
  phases: Phase[];
  toolCalls: ToolCall[];
  verifierResult: VerifierResult | null;
}

interface Store {
  tasks: Map<string, TaskState>;
}

const globalStore = globalThis as typeof globalThis & { __stipendStore?: Store };

const store: Store = globalStore.__stipendStore ?? { tasks: new Map<string, TaskState>() };
if (!globalStore.__stipendStore) {
  globalStore.__stipendStore = store;
}

const usd = (value: number) => value.toFixed(4);

const totalCostUSDC = (toolCalls: ToolCall[]) =>
  usd(toolCalls.reduce((sum, call) => sum + Number(call.amount_usdc), 0));

export const listBundles = (): TaskBundle[] =>
  Array.from(store.tasks.values()).map((state) => ({
    task: state.task,
    milestone: state.milestone,
    phases: state.phases,
    toolCalls: state.toolCalls,
    totalCostUSDC: totalCostUSDC(state.toolCalls),
  }));

export const getBundle = (id: string): TaskBundle | null => {
  const state = store.tasks.get(id);
  if (!state) {
    return null;
  }

  return {
    task: state.task,
    milestone: state.milestone,
    phases: state.phases,
    toolCalls: state.toolCalls,
    totalCostUSDC: totalCostUSDC(state.toolCalls),
  };
};

export const createTask = (query: string, budgetUSDC: number): TaskBundle => {
  const id = randomUUID();
  const task: Task = {
    id,
    query,
    budget_usdc: usd(budgetUSDC),
    status: "planning",
    escrow_contract_id: "",
    created_at: new Date().toISOString(),
  };

  const milestone: Milestone = {
    id: randomUUID(),
    task_id: id,
    title: "Research delivery",
    amount_usdc: usd(budgetUSDC),
    status: "pending",
    verifier_score: null,
  };

  store.tasks.set(id, {
    task,
    milestone,
    phases: [],
    toolCalls: [],
    verifierResult: null,
  });

  return getBundle(id)!;
};

export const updateTaskStatus = (id: string, status: TaskStatus) => {
  const state = store.tasks.get(id);
  if (!state) {
    return;
  }

  state.task.status = status;
};

export const setEscrowContract = (id: string, contractId: string) => {
  const state = store.tasks.get(id);
  if (!state) {
    return;
  }

  state.task.escrow_contract_id = contractId;
};

export const setMilestoneStatus = (id: string, status: Milestone["status"]) => {
  const state = store.tasks.get(id);
  if (!state) {
    return;
  }

  state.milestone.status = status;
};

export const addPhase = (taskId: string, input: Omit<Phase, "id" | "task_id" | "artifact_hash">) => {
  const state = store.tasks.get(taskId);
  if (!state) {
    return null;
  }

  const artifact_hash = createHash("sha256").update(input.content).digest("hex");
  const phase: Phase = {
    id: randomUUID(),
    task_id: taskId,
    artifact_hash,
    ...input,
  };

  state.phases.push(phase);
  return phase;
};

export const addToolCall = (taskId: string, input: Omit<ToolCall, "id">) => {
  const state = store.tasks.get(taskId);
  if (!state) {
    return null;
  }

  const budget = Number(state.task.budget_usdc);
  const nextTotal =
    state.toolCalls.reduce((sum, call) => sum + Number(call.amount_usdc), 0) + Number(input.amount_usdc);

  if (nextTotal > budget) {
    return null;
  }

  const call: ToolCall = {
    id: randomUUID(),
    ...input,
  };

  state.toolCalls.push(call);
  return call;
};

export const setVerifierResult = (taskId: string, result: VerifierResult) => {
  const state = store.tasks.get(taskId);
  if (!state) {
    return;
  }

  state.verifierResult = result;
  state.milestone.verifier_score = result;
  state.milestone.status = result.approved ? "approved" : "disputed";
  state.task.status = result.approved ? "complete" : "disputed";
};

export const getVerifierResult = (taskId: string) => store.tasks.get(taskId)?.verifierResult ?? null;

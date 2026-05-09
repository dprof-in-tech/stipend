import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
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

interface PersistedStore {
  tasks: TaskState[];
}

const TASK_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  planning: new Set(["funded", "disputed"]),
  funded: new Set(["running", "disputed"]),
  running: new Set(["complete", "disputed"]),
  complete: new Set(["disputed"]),
  disputed: new Set(),
};

const MILESTONE_TRANSITIONS: Record<Milestone["status"], ReadonlySet<Milestone["status"]>> = {
  pending: new Set(["submitted", "disputed"]),
  submitted: new Set(["approved", "disputed"]),
  approved: new Set(["released", "disputed"]),
  released: new Set(),
  disputed: new Set(),
};

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIRECTORY, "tasks-store.json");

const serializeStore = (inputStore: Store): PersistedStore => ({
  tasks: Array.from(inputStore.tasks.values()),
});

const hydrateStore = (payload: PersistedStore): Store => ({
  tasks: new Map(payload.tasks.map((state) => [state.task.id, state])),
});

const loadStore = (): Store => {
  if (!fs.existsSync(STORE_PATH)) {
    return { tasks: new Map<string, TaskState>() };
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    if (!raw.trim()) {
      return { tasks: new Map<string, TaskState>() };
    }
    const parsed = JSON.parse(raw) as PersistedStore;
    if (!Array.isArray(parsed.tasks)) {
      return { tasks: new Map<string, TaskState>() };
    }
    return hydrateStore(parsed);
  } catch {
    return { tasks: new Map<string, TaskState>() };
  }
};

const persistStore = (inputStore: Store) => {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  const tempStorePath = `${STORE_PATH}.tmp`;
  try {
    fs.writeFileSync(tempStorePath, JSON.stringify(serializeStore(inputStore), null, 2), "utf8");
    fs.renameSync(tempStorePath, STORE_PATH);
  } catch (error) {
    console.error(`Failed to persist task store at ${STORE_PATH}. Check file permissions and free disk space.`, error);
    throw error;
  }
};

const canTransition = <T extends string>(current: T, next: T, transitions: Record<T, ReadonlySet<T>>) => {
  if (current === next) {
    return true;
  }

  return transitions[current].has(next);
};

const globalStore = globalThis as typeof globalThis & { stipendStoreGlobal?: Store };

const store: Store = globalStore.stipendStoreGlobal ?? loadStore();
if (!globalStore.stipendStoreGlobal) {
  globalStore.stipendStoreGlobal = store;
}

const formatUSDC = (value: number) => value.toFixed(4);

const totalCostUSDC = (toolCalls: ToolCall[]) =>
  formatUSDC(toolCalls.reduce((sum, call) => sum + Number(call.amount_usdc), 0));

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
    budget_usdc: formatUSDC(budgetUSDC),
    status: "planning",
    escrow_contract_id: "",
    created_at: new Date().toISOString(),
  };

  const milestone: Milestone = {
    id: randomUUID(),
    task_id: id,
    title: "Research delivery",
    amount_usdc: formatUSDC(budgetUSDC),
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
  persistStore(store);

  return getBundle(id)!;
};

export const updateTaskStatus = (id: string, status: TaskStatus) => {
  const state = store.tasks.get(id);
  if (!state) {
    return false;
  }

  if (!canTransition(state.task.status, status, TASK_TRANSITIONS)) {
    return false;
  }

  state.task.status = status;
  persistStore(store);
  return true;
};

export const setEscrowContract = (id: string, contractId: string) => {
  const state = store.tasks.get(id);
  if (!state) {
    return false;
  }

  state.task.escrow_contract_id = contractId;
  persistStore(store);
  return true;
};

export const setMilestoneStatus = (id: string, status: Milestone["status"]) => {
  const state = store.tasks.get(id);
  if (!state) {
    return false;
  }

  if (!canTransition(state.milestone.status, status, MILESTONE_TRANSITIONS)) {
    return false;
  }

  state.milestone.status = status;
  persistStore(store);
  return true;
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
  persistStore(store);
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
  persistStore(store);
  return call;
};

export const markDisputed = (taskId: string) => {
  const state = store.tasks.get(taskId);
  if (!state) {
    return false;
  }

  const canUpdateTask = canTransition(state.task.status, "disputed", TASK_TRANSITIONS);
  const canUpdateMilestone = canTransition(state.milestone.status, "disputed", MILESTONE_TRANSITIONS);
  if (!canUpdateTask || !canUpdateMilestone) {
    return false;
  }

  state.task.status = "disputed";
  state.milestone.status = "disputed";
  persistStore(store);
  return true;
};

export const recordVerifierResult = (taskId: string, result: VerifierResult) => {
  const state = store.tasks.get(taskId);
  if (!state) {
    return;
  }

  state.verifierResult = result;
  state.milestone.verifier_score = result;
  persistStore(store);
};

export const getVerifierResult = (taskId: string) => store.tasks.get(taskId)?.verifierResult ?? null;

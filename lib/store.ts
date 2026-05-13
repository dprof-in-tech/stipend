import Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import path from "path";
import type { Milestone, Phase, Task, TaskBundle, TaskStatus, ToolCall, VerifierResult, MilestoneStatus, PhaseKind } from "@/lib/types";

interface MilestoneRow {
  id: string;
  task_id: string;
  title: string;
  amount_usdc: string;
  status: MilestoneStatus;
  verifier_result: string | null;
}

interface PhaseRow {
  id: string;
  task_id: string;
  kind: PhaseKind;
  title: string;
  artifact_url: string;
  artifact_hash: string;
  content: string;
  citations: string;
}

const DB_PATH = path.join(process.cwd(), "stipend.db");
const db = new Database(DB_PATH);

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    query TEXT,
    budget_usdc TEXT,
    status TEXT,
    escrow_contract_id TEXT,
    client_address TEXT,
    created_at TEXT,
    release_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    title TEXT,
    amount_usdc TEXT,
    status TEXT,
    verifier_result TEXT,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    kind TEXT,
    title TEXT,
    artifact_url TEXT,
    artifact_hash TEXT,
    content TEXT,
    citations TEXT,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    phase_id TEXT,
    kind TEXT,
    provider TEXT,
    settlement TEXT,
    amount_usdc TEXT,
    tx_hash TEXT,
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  );
`);

const formatUSDC = (value: number) => value.toFixed(4);

export const getBundle = (id: string): TaskBundle | null => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
  if (!task) return null;

  const milestone = db.prepare("SELECT * FROM milestones WHERE task_id = ?").get(id) as MilestoneRow;
  const phases = db.prepare("SELECT * FROM phases WHERE task_id = ?").all(id) as PhaseRow[];
  const toolCalls = db.prepare("SELECT * FROM tool_calls WHERE task_id = ?").all(id) as ToolCall[];

  // Calculate total cost
  const totalCost = toolCalls.reduce((sum, call) => sum + Number(call.amount_usdc), 0);

  return {
    task: {
      ...task,
      release_at: task.release_at ? task.release_at : undefined
    },
    milestone: {
      ...milestone,
      verifier_score: milestone.verifier_result ? JSON.parse(milestone.verifier_result) : null,
    },
    phases: phases.map(p => ({
      ...p,
      citations: JSON.parse(p.citations || "[]")
    })),
    toolCalls,
    totalCostUSDC: formatUSDC(totalCost),
  };
};

export const createTask = (query: string, budgetUSDC: number): TaskBundle => {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO tasks (id, query, budget_usdc, status, escrow_contract_id, client_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, query, formatUSDC(budgetUSDC), "planning", "", "", createdAt);

  const milestoneId = randomUUID();
  db.prepare(`
    INSERT INTO milestones (id, task_id, title, amount_usdc, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(milestoneId, id, "Research delivery", formatUSDC(budgetUSDC), "pending");

  return getBundle(id)!;
};

export const updateTaskStatus = (id: string, status: TaskStatus, releaseAt?: number) => {
  if (releaseAt) {
    db.prepare("UPDATE tasks SET status = ?, release_at = ? WHERE id = ?").run(status, releaseAt, id);
  } else {
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id);
  }
};

export const setEscrowContract = (id: string, contractId: string) => {
  db.prepare("UPDATE tasks SET escrow_contract_id = ? WHERE id = ?").run(contractId, id);
};

export const setClientAddress = (id: string, address: string) => {
  db.prepare("UPDATE tasks SET client_address = ? WHERE id = ?").run(address, id);
};

export const setMilestoneStatus = (id: string, status: Milestone["status"]) => {
  db.prepare("UPDATE milestones SET status = ? WHERE task_id = ?").run(status, id);
};

export const addPhase = (taskId: string, input: Omit<Phase, "id" | "task_id" | "artifact_hash">) => {
  const id = randomUUID();
  const artifact_hash = createHash("sha256").update(input.content).digest("hex");
  
  db.prepare(`
    INSERT INTO phases (id, task_id, kind, title, artifact_url, artifact_hash, content, citations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, input.kind, input.title, input.artifact_url, artifact_hash, input.content, JSON.stringify(input.citations));

  return { id, task_id: taskId, artifact_hash, ...input };
};

export const addToolCall = (taskId: string, input: Omit<ToolCall, "id">) => {
  const bundle = getBundle(taskId);
  if (!bundle) return null;

  const budget = Number(bundle.task.budget_usdc);
  const currentTotal = Number(bundle.totalCostUSDC);
  const nextTotal = currentTotal + Number(input.amount_usdc);

  if (nextTotal > budget) {
    return null;
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO tool_calls (id, task_id, phase_id, kind, provider, settlement, amount_usdc, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, input.phase_id, input.kind, input.provider, input.settlement, input.amount_usdc, input.tx_hash);

  return { id, ...input };
};

export const setVerifierResult = (taskId: string, result: VerifierResult) => {
  const status = result.approved ? "complete" : "disputed";
  const mStatus = result.approved ? "approved" : "disputed";

  db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, taskId);
  db.prepare("UPDATE milestones SET status = ?, verifier_result = ? WHERE task_id = ?")
    .run(mStatus, JSON.stringify(result), taskId);
};

export const getVerifierResult = (taskId: string): VerifierResult | null => {
  const m = db.prepare("SELECT verifier_result FROM milestones WHERE task_id = ?").get(taskId) as { verifier_result: string } | undefined;
  return m?.verifier_result ? JSON.parse(m.verifier_result) : null;
};

export const listBundles = (): TaskBundle[] => {
  const ids = db.prepare("SELECT id FROM tasks ORDER BY created_at DESC").all() as { id: string }[];
  return ids.map(row => getBundle(row.id)!).filter(Boolean);
};

export const getExpiredPendingReleases = (): { id: string }[] => {
  const now = Date.now();
  return db.prepare("SELECT id FROM tasks WHERE status = 'pending_release' AND release_at > 0 AND release_at < ?").all(now) as { id: string }[];
};

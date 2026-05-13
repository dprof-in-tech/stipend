import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
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

const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = !!DATABASE_URL;

// Helper to handle SQL parameter differences (? for sqlite, $n for postgres)
function transformQuery(query: string) {
  if (!isPostgres) return query;
  let i = 1;
  return query.replace(/\?/g, () => `$${i++}`);
}

// Database Abstraction
const db = (() => {
  if (isPostgres) {
    const sql = neon(DATABASE_URL!);
    return {
      run: async (query: string, ...params: any[]) => {
        await (sql as any).query(transformQuery(query), params);
      },
      get: async <T>(query: string, ...params: any[]): Promise<T | null> => {
        const rows = await (sql as any).query(transformQuery(query), params);
        return (rows[0] as T) || null;
      },
      all: async <T>(query: string, ...params: any[]): Promise<T[]> => {
        return (await (sql as any).query(transformQuery(query), params)) as T[];
      },
      exec: async (query: string) => {
        await (sql as any).query(query);
      }
    };
  } else {
    const DB_PATH = process.env.STIPEND_DB_PATH || path.join(process.cwd(), "stipend.db");
    const sqlite = new Database(DB_PATH);
    return {
      run: async (query: string, ...params: any[]) => {
        sqlite.prepare(query).run(...params);
      },
      get: async <T>(query: string, ...params: any[]): Promise<T | null> => {
        return (sqlite.prepare(query).get(...params) as T) || null;
      },
      all: async <T>(query: string, ...params: any[]): Promise<T[]> => {
        return sqlite.prepare(query).all(...params) as T[];
      },
      exec: async (query: string) => {
        sqlite.exec(query);
      }
    };
  }
})();

// Initialize Schema
// Note: Postgres schema uses TEXT for everything same as SQLite for simplicity here.
// But we use serial/uuid usually. Here we keep IDs as strings for compat.
const initSchema = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      query TEXT,
      budget_usdc TEXT,
      status TEXT,
      escrow_contract_id TEXT,
      client_address TEXT,
      created_at TEXT,
      release_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      title TEXT,
      amount_usdc TEXT,
      status TEXT,
      verifier_result TEXT
    );

    CREATE TABLE IF NOT EXISTS phases (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      kind TEXT,
      title TEXT,
      artifact_url TEXT,
      artifact_hash TEXT,
      content TEXT,
      citations TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      phase_id TEXT,
      kind TEXT,
      provider TEXT,
      settlement TEXT,
      amount_usdc TEXT,
      tx_hash TEXT
    );
  `);
};

// Top-level initialization
initSchema().catch(console.error);

const formatUSDC = (value: number) => value.toFixed(4);

export const getBundle = async (id: string): Promise<TaskBundle | null> => {
  const task = await db.get<Task>("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) return null;

  const milestone = await db.get<MilestoneRow>("SELECT * FROM milestones WHERE task_id = ?", id);
  const phases = await db.all<PhaseRow>("SELECT * FROM phases WHERE task_id = ?", id);
  const toolCalls = await db.all<ToolCall>("SELECT * FROM tool_calls WHERE task_id = ?", id);

  // Calculate total cost
  const totalCost = toolCalls.reduce((sum, call) => sum + Number(call.amount_usdc), 0);

  return {
    task: {
      ...task,
      release_at: task.release_at ? Number(task.release_at) : undefined
    },
    milestone: milestone ? {
      ...milestone,
      verifier_score: milestone.verifier_result ? JSON.parse(milestone.verifier_result) : null,
    } : null as any,
    phases: phases.map(p => ({
      ...p,
      citations: JSON.parse(p.citations || "[]")
    })),
    toolCalls,
    totalCostUSDC: formatUSDC(totalCost),
  };
};

export const createTask = async (query: string, budgetUSDC: number): Promise<TaskBundle> => {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  
  await db.run(`
    INSERT INTO tasks (id, query, budget_usdc, status, escrow_contract_id, client_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, id, query, formatUSDC(budgetUSDC), "planning", "", "", createdAt);

  const milestoneId = randomUUID();
  await db.run(`
    INSERT INTO milestones (id, task_id, title, amount_usdc, status)
    VALUES (?, ?, ?, ?, ?)
  `, milestoneId, id, "Research delivery", formatUSDC(budgetUSDC), "pending");

  return (await getBundle(id))!;
};

export const updateTaskStatus = async (id: string, status: TaskStatus, releaseAt?: number) => {
  if (releaseAt) {
    await db.run("UPDATE tasks SET status = ?, release_at = ? WHERE id = ?", status, releaseAt, id);
  } else {
    await db.run("UPDATE tasks SET status = ? WHERE id = ?", status, id);
  }
};

export const setEscrowContract = async (id: string, contractId: string) => {
  await db.run("UPDATE tasks SET escrow_contract_id = ? WHERE id = ?", contractId, id);
};

export const setClientAddress = async (id: string, address: string) => {
  await db.run("UPDATE tasks SET client_address = ? WHERE id = ?", address, id);
};

export const setMilestoneStatus = async (id: string, status: Milestone["status"]) => {
  await db.run("UPDATE milestones SET status = ? WHERE task_id = ?", status, id);
};

export const addPhase = async (taskId: string, input: Omit<Phase, "id" | "task_id" | "artifact_hash">) => {
  const id = randomUUID();
  const artifact_hash = createHash("sha256").update(input.content).digest("hex");
  
  await db.run(`
    INSERT INTO phases (id, task_id, kind, title, artifact_url, artifact_hash, content, citations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, id, taskId, input.kind, input.title, input.artifact_url, artifact_hash, input.content, JSON.stringify(input.citations));

  return { id, task_id: taskId, artifact_hash, ...input };
};

export const addToolCall = async (taskId: string, input: Omit<ToolCall, "id">) => {
  const bundle = await getBundle(taskId);
  if (!bundle) return null;

  const budget = Number(bundle.task.budget_usdc);
  const currentTotal = Number(bundle.totalCostUSDC);
  const nextTotal = currentTotal + Number(input.amount_usdc);

  if (nextTotal > budget) {
    return null;
  }

  const id = randomUUID();
  await db.run(`
    INSERT INTO tool_calls (id, task_id, phase_id, kind, provider, settlement, amount_usdc, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, id, taskId, input.phase_id, input.kind, input.provider, input.settlement, input.amount_usdc, input.tx_hash);

  return { id, ...input };
};

export const setVerifierResult = async (taskId: string, result: VerifierResult) => {
  const status = result.approved ? "complete" : "disputed";
  const mStatus = result.approved ? "approved" : "disputed";

  await db.run("UPDATE tasks SET status = ? WHERE id = ?", status, taskId);
  await db.run("UPDATE milestones SET status = ?, verifier_result = ? WHERE task_id = ?", mStatus, JSON.stringify(result), taskId);
};

export const getVerifierResult = async (taskId: string): Promise<VerifierResult | null> => {
  const m = await db.get<{ verifier_result: string }>("SELECT verifier_result FROM milestones WHERE task_id = ?", taskId);
  return m?.verifier_result ? JSON.parse(m.verifier_result) : null;
};

export const listBundles = async (): Promise<TaskBundle[]> => {
  const rows = await db.all<{ id: string }>("SELECT id FROM tasks ORDER BY created_at DESC");
  const bundles = await Promise.all(rows.map(row => getBundle(row.id)));
  return bundles.filter((b): b is TaskBundle => b !== null);
};

export const getExpiredPendingReleases = async (): Promise<{ id: string }[]> => {
  const now = Date.now();
  return await db.all<{ id: string }>("SELECT id FROM tasks WHERE status = 'pending_release' AND release_at > 0 AND release_at < ?", now);
};

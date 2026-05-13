import { NextResponse } from "next/server";
import { createTask, listBundles, getExpiredPendingReleases, updateTaskStatus, setMilestoneStatus, getBundle } from "@/lib/store";
import { approveMilestone, releaseFunds } from "@/lib/tw/client";

export const runtime = "nodejs";

export async function GET() {
  // Check for expired pending releases and process them
  const expired = getExpiredPendingReleases();
  for (const row of expired) {
    try {
      const bundle = getBundle(row.id);
      if (bundle && bundle.task.escrow_contract_id) {
        console.log(`[Auto-Release] Processing expired task ${row.id}`);
        await approveMilestone(bundle.task.escrow_contract_id, 0);
        await releaseFunds(bundle.task.escrow_contract_id);
        setMilestoneStatus(row.id, "released");
        updateTaskStatus(row.id, "released");
      }
    } catch (err) {
      console.error(`[Auto-Release] Failed for ${row.id}:`, err);
    }
  }

  return NextResponse.json({ tasks: listBundles() });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    query?: string;
    budget_usdc?: number;
  };

  const query = payload.query?.trim();
  const budgetUSDC = Number(payload.budget_usdc);

  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  if (!Number.isFinite(budgetUSDC) || budgetUSDC <= 0 || budgetUSDC > 100) {
    return NextResponse.json(
      { error: "Budget must be a positive number not exceeding 100 USDC." },
      { status: 400 },
    );
  }

  const task = createTask(query, budgetUSDC);
  return NextResponse.json(task, { status: 201 });
}

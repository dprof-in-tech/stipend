import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, setVerifierResult, updateTaskStatus } from "@/lib/store";

import { runAdversarialVerifier } from "@/lib/verifier/engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { taskId?: string };

  if (!payload.taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  const bundle = await getBundle(payload.taskId);
  if (!bundle) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Relaxed check: allow verifier to run if task is "complete" or "disputed"
  if (bundle.task.status !== "complete" && bundle.task.status !== "disputed") {
    return NextResponse.json(
      { error: "Agent must finish execution before verification" },
      { status: 409 }
    );
  }

  try {
    const result = await runAdversarialVerifier(bundle);
    await setVerifierResult(payload.taskId, result);

    if (result.approved) {
      // 1. Set to pending_release with a 2-minute buffer
      const releaseAt = Date.now() + 120000;
      await updateTaskStatus(payload.taskId, "pending_release", releaseAt);
      await setMilestoneStatus(payload.taskId, "pending_release");
    } else if (result.partial_payout_eligible) {
      // TIERED SETTLEMENT: Partial Success (3.0 - 3.4)
      console.log(`[Tiered Payout] Task ${payload.taskId} eligible for 50/50 split.`);
      
      const escrowId = bundle.task.escrow_contract_id;
      const budget = parseFloat(bundle.task.budget_usdc);
      
      // 1. Raise Dispute
      const { disputeEscrow, resolveDispute } = await import("@/lib/tw/client");
      await disputeEscrow(escrowId);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 2. Resolve with 50/50 split
      const distributions: Array<[string, number]> = [
        [bundle.task.client_address, budget * 0.5],
        [(await import("@/lib/tw/client")).getAgentPublicKey(), budget * 0.5]
      ];
      
      await resolveDispute(escrowId, distributions);
      
      await setMilestoneStatus(payload.taskId, "released");
      await updateTaskStatus(payload.taskId, "released");
    } else {
      await setMilestoneStatus(payload.taskId, "disputed");
      await updateTaskStatus(payload.taskId, "disputed");
    }

    return NextResponse.json({ result, task: await getBundle(payload.taskId) });
  } catch (error) {
    console.error(`[Verifier Crash] Task ${payload.taskId}:`, error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}

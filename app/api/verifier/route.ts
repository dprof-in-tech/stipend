import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, setVerifierResult, updateTaskStatus } from "@/lib/store";
import { approveMilestone, releaseFunds } from "@/lib/tw/client";
import { runAdversarialVerifier } from "@/lib/verifier/engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { taskId?: string };

  if (!payload.taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  const bundle = getBundle(payload.taskId);
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
    setVerifierResult(payload.taskId, result);

    if (result.approved) {
      await approveMilestone(bundle.task.escrow_contract_id);
      setMilestoneStatus(payload.taskId, "approved");
      await releaseFunds(bundle.task.escrow_contract_id);
      setMilestoneStatus(payload.taskId, "released");
      updateTaskStatus(payload.taskId, "complete");
    } else {
      setMilestoneStatus(payload.taskId, "disputed");
      updateTaskStatus(payload.taskId, "disputed");
    }

    return NextResponse.json({ result, task: getBundle(payload.taskId) });
  } catch (error) {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}

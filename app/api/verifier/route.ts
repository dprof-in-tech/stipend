import { NextResponse } from "next/server";
import { getBundle, markDisputed, recordVerifierResult, setMilestoneStatus } from "@/lib/store";
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
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (!bundle.task.escrow_contract_id) {
    return NextResponse.json({ error: "Task has no escrow contract." }, { status: 409 });
  }

  if (bundle.milestone.status !== "submitted") {
    return NextResponse.json({ error: "Task is not ready for verification." }, { status: 409 });
  }

  const result = runAdversarialVerifier(bundle);
  recordVerifierResult(payload.taskId, result);

  try {
    if (result.approved) {
      await approveMilestone(bundle.task.escrow_contract_id);
      const approved = setMilestoneStatus(payload.taskId, "approved");
      if (!approved) {
        return NextResponse.json({ error: "Milestone cannot transition to approved state." }, { status: 409 });
      }

      await releaseFunds(bundle.task.escrow_contract_id);
      const released = setMilestoneStatus(payload.taskId, "released");
      if (!released) {
        return NextResponse.json({ error: "Milestone cannot transition to released state." }, { status: 409 });
      }
    } else {
      const disputed = markDisputed(payload.taskId);
      if (!disputed) {
        return NextResponse.json(
          {
            error: "Verifier rejection could not transition task to disputed.",
          },
          { status: 409 },
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred during verification settlement.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ result, task: getBundle(payload.taskId) });
}

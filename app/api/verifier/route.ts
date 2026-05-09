import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, setVerifierResult } from "@/lib/store";
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

  const result = runAdversarialVerifier(bundle);
  setVerifierResult(payload.taskId, result);

  if (result.approved) {
    await approveMilestone();
    setMilestoneStatus(payload.taskId, "approved");
    await releaseFunds();
    setMilestoneStatus(payload.taskId, "released");
  }

  return NextResponse.json({ result, task: getBundle(payload.taskId) });
}

import { NextResponse } from "next/server";
import { getBundle, markDisputed } from "@/lib/store";
import { disputeEscrow } from "@/lib/tw/client";

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

  try {
    await disputeEscrow(bundle.task.escrow_contract_id);
    const disputed = markDisputed(payload.taskId);
    if (!disputed) {
      return NextResponse.json({ error: "Dispute transition is not allowed." }, { status: 409 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispute request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ task: getBundle(payload.taskId) });
}

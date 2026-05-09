import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
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

  await disputeEscrow();
  setMilestoneStatus(payload.taskId, "disputed");
  updateTaskStatus(payload.taskId, "disputed");

  return NextResponse.json({ task: getBundle(payload.taskId) });
}

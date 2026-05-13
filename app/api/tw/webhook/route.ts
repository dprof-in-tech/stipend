import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    taskId?: string;
    milestoneStatus?: "approved" | "released" | "disputed";
  };

  if (!payload.taskId || !payload.milestoneStatus) {
    return NextResponse.json({ error: "taskId and milestoneStatus are required." }, { status: 400 });
  }

  const bundle = await getBundle(payload.taskId);
  if (!bundle) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  await setMilestoneStatus(payload.taskId, payload.milestoneStatus);
  if (payload.milestoneStatus === "disputed") {
    await updateTaskStatus(payload.taskId, "disputed");
  }

  return NextResponse.json({ task: await getBundle(payload.taskId) });
}

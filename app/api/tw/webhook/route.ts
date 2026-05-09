import { NextResponse } from "next/server";
import { getBundle, markDisputed, setMilestoneStatus } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    taskId?: string;
    milestoneStatus?: "approved" | "released" | "disputed";
  };

  if (!payload.taskId || !payload.milestoneStatus) {
    return NextResponse.json({ error: "taskId and milestoneStatus are required." }, { status: 400 });
  }

  const bundle = getBundle(payload.taskId);
  if (!bundle) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if ((payload.milestoneStatus === "approved" || payload.milestoneStatus === "released") && bundle.task.status === "disputed") {
    return NextResponse.json({ error: "Cannot move a disputed task to approved/released milestone states." }, { status: 409 });
  }

  if (payload.milestoneStatus === "disputed") {
    const disputed = markDisputed(payload.taskId);
    if (!disputed) {
      return NextResponse.json({ error: "Task state transition is not allowed." }, { status: 409 });
    }

    return NextResponse.json({ task: getBundle(payload.taskId) });
  }

  const milestoneUpdated = setMilestoneStatus(payload.taskId, payload.milestoneStatus);
  if (!milestoneUpdated) {
    return NextResponse.json({ error: "Milestone state transition is not allowed." }, { status: 409 });
  }

  return NextResponse.json({ task: getBundle(payload.taskId) });
}

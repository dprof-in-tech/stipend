import { NextResponse } from "next/server";
import { startAgentExecution } from "@/lib/agent/runtime";
import { getBundle, updateTaskStatus } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { feedback } = await request.json();

    const bundle = await getBundle(id);
    if (!bundle) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (bundle.task.status !== "pending_release" && bundle.task.status !== "verified_approved") {
      return NextResponse.json(
        { error: "Task is not in a disputable state." },
        { status: 409 }
      );
    }

    // Set status to running (retry)
    await updateTaskStatus(id, "running", 0); // clear release_at

    // Trigger agent with feedback
    void startAgentExecution(id, feedback);

    return NextResponse.json(await getBundle(id));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Dispute retry failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

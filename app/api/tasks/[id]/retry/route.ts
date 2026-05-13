import { NextResponse } from "next/server";
import { startAgentExecution } from "@/lib/agent/runtime";
import { getBundle, updateTaskStatus } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const bundle = getBundle(id);

    if (!bundle) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (bundle.task.status !== "failed" && bundle.task.status !== "error") {
      return NextResponse.json(
        { error: "Only failed tasks can be retried." },
        { status: 409 },
      );
    }

    // Set back to running state
    updateTaskStatus(id, "running");

    // Start agent async
    void startAgentExecution(id);

    return NextResponse.json(getBundle(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

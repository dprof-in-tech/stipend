import { NextResponse } from "next/server";
import { startAgentExecution } from "@/lib/agent/runtime";
import { getBundle, updateTaskStatus } from "@/lib/store";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const bundle = await getBundle(id);

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
    await updateTaskStatus(id, "running");

    // Start agent async
    waitUntil(startAgentExecution(id));

    return NextResponse.json(await getBundle(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

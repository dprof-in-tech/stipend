import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { approveMilestone, releaseFunds } from "@/lib/tw/client";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bundle = await getBundle(id);

  if (!bundle) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    const escrowId = bundle.task.escrow_contract_id;

    // 1. Approve the milestone on-chain
    await approveMilestone(escrowId, 0);

    // 2. Release the funds to the agent
    await releaseFunds(escrowId);

    // 3. Update local state
    await setMilestoneStatus(id, "released");
    await updateTaskStatus(id, "released");

    return NextResponse.json(await getBundle(id));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Release failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

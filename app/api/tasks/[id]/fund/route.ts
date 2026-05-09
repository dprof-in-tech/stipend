import { NextResponse } from "next/server";
import { startAgentExecution } from "@/lib/agent/runtime";
import { getBundle, setEscrowContract, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { deployEscrow, fundEscrow } from "@/lib/tw/client";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = getBundle(id);

  if (!bundle) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (bundle.task.status !== "planning" || bundle.task.escrow_contract_id) {
    return NextResponse.json({ error: "Task is not eligible for funding." }, { status: 409 });
  }

  try {
    const escrow = await deployEscrow(id);
    await fundEscrow(escrow.escrowContractId);

    const escrowUpdated = setEscrowContract(id, escrow.escrowContractId);
    const milestoneUpdated = setMilestoneStatus(id, "pending");
    const taskUpdated = updateTaskStatus(id, "funded");
    if (!escrowUpdated || !milestoneUpdated || !taskUpdated) {
      return NextResponse.json({ error: "Task state transition failed while funding escrow." }, { status: 409 });
    }

    void startAgentExecution(id);

    return NextResponse.json({
      ...getBundle(id),
      escrow,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred during escrow funding.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

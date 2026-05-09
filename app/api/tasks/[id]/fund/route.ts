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

  const escrow = await deployEscrow(id);
  await fundEscrow(escrow.escrowContractId);

  setEscrowContract(id, escrow.escrowContractId);
  setMilestoneStatus(id, "pending");
  updateTaskStatus(id, "funded");

  void startAgentExecution(id);

  return NextResponse.json({
    ...getBundle(id),
    escrow,
  });
}

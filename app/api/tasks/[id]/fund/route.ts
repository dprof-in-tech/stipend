import { NextResponse } from "next/server";
import { startAgentExecution } from "@/lib/agent/runtime";
import { getBundle, setEscrowContract, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { deployEscrow, fundEscrow } from "@/lib/tw/client";
import { getServerManagedWallet } from "@/lib/stellar/wallet";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = getBundle(id);

  if (!bundle) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (bundle.task.status !== "planning") {
    return NextResponse.json(
      { error: "Task has already been funded or is in a terminal state." },
      { status: 409 },
    );
  }

  const agentWallet = getServerManagedWallet("agent");
  const verifierWallet = getServerManagedWallet("verifier");

  const escrow = await deployEscrow(id, {
    budgetUsdc: bundle.task.budget_usdc,
    agentAddress: agentWallet.publicKey,
    verifierAddress: verifierWallet.publicKey,
  });

  await fundEscrow(escrow.escrowContractId);

  setEscrowContract(id, escrow.escrowContractId);
  setMilestoneStatus(id, "pending");
  updateTaskStatus(id, "funded");

  void startAgentExecution(id);

  return NextResponse.json(getBundle(id));
}

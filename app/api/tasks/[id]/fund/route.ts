import { NextResponse } from "next/server";
import { startAgentExecution } from "@/lib/agent/runtime";
import { getBundle, setEscrowContract, setMilestoneStatus, updateTaskStatus, setClientAddress } from "@/lib/store";
import { buildDeployXdr, buildFundXdr, sendSignedXdr } from "@/lib/tw/client";
import { getServerManagedWallet } from "@/lib/stellar/wallet";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const bundle = await getBundle(id);

    if (!bundle) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    if (bundle.task.status !== "planning" && bundle.task.status !== "funded") {
      return NextResponse.json(
        { error: "Task is in a terminal state." },
        { status: 409 },
      );
    }

    const { clientPublicKey, build, signedXdr } = (await request.json().catch(() => ({}))) as {
      clientPublicKey?: string;
      build?: boolean;
      signedXdr?: string;
    };
    
    if (build) {
      if (!clientPublicKey) throw new Error("clientPublicKey is required to build transaction");

      // Stage 1: Build Deployment (if no contract ID)
      if (!bundle.task.escrow_contract_id) {
        const agentWallet = getServerManagedWallet("agent");
        const verifierWallet = getServerManagedWallet("verifier");

        const { unsignedTransaction } = await buildDeployXdr(id, {
          budgetUsdc: bundle.task.budget_usdc,
          agentAddress: agentWallet.publicKey,
          verifierAddress: verifierWallet.publicKey,
          clientAddress: clientPublicKey,
        });

        return NextResponse.json({
          unsignedTransaction,
          type: "deploy",
        });
      }

      // Stage 2: Build Funding
      const { unsignedTransaction } = await buildFundXdr(
        bundle.task.escrow_contract_id,
        clientPublicKey,
        bundle.task.budget_usdc,
      );

      return NextResponse.json({
        unsignedTransaction,
        type: "fund",
        escrowContractId: bundle.task.escrow_contract_id,
      });
    }

    if (signedXdr) {
      const submit = await sendSignedXdr(signedXdr);
      if (submit.status !== "SUCCESS") {
        throw new Error(submit.message ?? "Failed to submit transaction");
      }

      // If we just deployed, save the contract ID
      if (submit.contractId) {
        await setEscrowContract(id, submit.contractId);
        await setClientAddress(id, clientPublicKey || "");
      } else if (bundle.task.escrow_contract_id) {
        // If we just funded
        await setMilestoneStatus(id, "pending");
        await updateTaskStatus(id, "funded");
        void startAgentExecution(id);
      }

      return NextResponse.json(await getBundle(id));
    }
    return NextResponse.json({ error: "Either { build: true } or signedXdr is required." }, { status: 400 });
  } catch (rawErr) {
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    console.error("Fund escrow error:", message);
    try {
      const fs = await import("fs");
      fs.appendFileSync("error.log", `[${new Date().toISOString()}] ${message}\n`);
    } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

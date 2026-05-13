import { NextResponse } from "next/server";
import { getBundle, setMilestoneStatus, updateTaskStatus } from "@/lib/store";
import { buildDisputeXdr, sendSignedXdr, resolveDispute, getClientPublicKey, getPlatformPublicKey, disputeEscrow, reimbursePlatformFromAgent } from "@/lib/tw/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { taskId?: string; signedXdr?: string; build?: boolean; clientPublicKey?: string };

  if (!payload.taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  const bundle = await getBundle(payload.taskId);
  if (!bundle) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  // Direct path: Platform initiates dispute on behalf of the user
  if (!payload.build && !payload.signedXdr) {
    try {
      // 1. Raise Dispute (Platform signs as Approver)
      await disputeEscrow(bundle.task.escrow_contract_id);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 2. Resolve Dispute (Adjudicator signs) - 100% REFUND TO CLIENT
      const budget = parseFloat(bundle.task.budget_usdc);
      const spent = parseFloat(bundle.totalCostUSDC);
      
      const distributions: Array<[string, number]> = [];
      const clientAddress = bundle.task.client_address || payload.clientPublicKey;
      
      if (clientAddress) {
        distributions.push([clientAddress, budget]); // 100% refund
      }
      
      if (distributions.length > 0) {
        await resolveDispute(bundle.task.escrow_contract_id, distributions);
      }

      // 3. REIMBURSE PLATFORM FROM AGENT WALLET
      if (spent > 0) {
        try {
          await reimbursePlatformFromAgent(spent, `Reimburse tool cost: ${payload.taskId}`);
        } catch (reimburseErr) {
          console.error("Agent reimbursement failed:", reimburseErr);
          // We don't block the refund for this, but we log it
        }
      }

      await setMilestoneStatus(payload.taskId, "refunded");
      await updateTaskStatus(payload.taskId, "refunded");
      
      return NextResponse.json({ task: await getBundle(payload.taskId) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Dispute] Error processing dispute:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Build-only path (Deprecated but kept for now)
  if (payload.build) {
    const signer = payload.clientPublicKey ?? getClientPublicKey();
    const { unsignedTransaction } = await buildDisputeXdr(bundle.task.escrow_contract_id, signer);
    return NextResponse.json({ unsignedTransaction });
  }

  // Submit-signed path
  if (payload.signedXdr) {
    const submit = await sendSignedXdr(payload.signedXdr);
    if (submit.status !== "SUCCESS") {
      return NextResponse.json({ error: submit.message ?? submit.status }, { status: 400 });
    }

    // AUTOMATION: Immediately resolve the dispute to refund the client.
    // We refund the unspent budget to the client and send the spent portion (tool costs)
    // to the platform wallet to cover operator expenses.
    try {
      const budget = parseFloat(bundle.task.budget_usdc);
      const spent = parseFloat(bundle.totalCostUSDC);
      const refund = Math.max(0, budget - spent);
      
      const distributions: Array<[string, number]> = [];
      
      // 1. Refund the unspent portion to the client
      const clientAddress = bundle.task.client_address || payload.clientPublicKey;
      if (clientAddress && refund > 0) {
        distributions.push([clientAddress, refund]);
      }
      
      // 2. Send the spent portion back to the platform
      const platformAddress = getPlatformPublicKey();
      if (spent > 0) {
        distributions.push([platformAddress, spent]);
      }
      
      // If no client address was found and we have a refund, send it to platform as backup or error?
      // In this app, clientPublicKey should be present from the build step or store.
      if (distributions.length > 0) {
        await resolveDispute(bundle.task.escrow_contract_id, distributions);
      }

      await setMilestoneStatus(payload.taskId, "refunded");
      await updateTaskStatus(payload.taskId, "refunded");
    } catch (err) {
      console.error("Auto-resolution failed:", err);
      // Fallback: just mark as disputed if resolution fails
      await setMilestoneStatus(payload.taskId, "disputed");
      await updateTaskStatus(payload.taskId, "disputed");
    }

    return NextResponse.json({ task: await getBundle(payload.taskId) });
  }

  return NextResponse.json({ error: "Either { build: true } or signedXdr is required." }, { status: 400 });
}

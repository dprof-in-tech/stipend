// Trustless Work API client — testnet integration.
//
// Flow for every escrow action:
//   1. POST to TW endpoint → { unsignedTransaction: XDR }
//   2. Sign XDR with platform Stellar keypair (@stellar/stellar-sdk)
//   3. POST /helper/send-transaction { signedXdr } → { status: "SUCCESS" | "FAILED" }
//
// When TW_API_KEY is not set, falls back to a realistic mock (demo mode).

import { Keypair, Transaction, Networks } from "@stellar/stellar-sdk";
import { randomUUID } from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────

const TW_API_BASE = process.env.TW_API_BASE ?? "";
const TW_API_KEY = process.env.TW_API_KEY ?? "";
const TW_VIEWER_BASE =
  process.env.TW_VIEWER_BASE ?? "https://escrow-viewer.trustlesswork.com";

// USDC on Stellar testnet (Circle issuer)
const USDC_TESTNET_ISSUER =
  process.env.USDC_STELLAR_ISSUER ??
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// Stellar network passphrase
const STELLAR_NETWORK =
  process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

// ── Keypairs ──────────────────────────────────────────────────────────────────

function getPlatformKeypair(): Keypair {
  const secret = process.env.PLATFORM_STELLAR_SECRET;
  if (secret) return Keypair.fromSecret(secret);
  // Fallback: generate ephemeral keypair (signing will fail without funded account)
  return Keypair.random();
}

function getAgentKeypair(): Keypair {
  const secret = process.env.AGENT_STELLAR_SECRET;
  if (secret) return Keypair.fromSecret(secret);
  return Keypair.random();
}

export function getPlatformPublicKey(): string {
  const pub = process.env.PLATFORM_STELLAR_PUBLIC_KEY;
  if (pub) return pub;
  const secret = process.env.PLATFORM_STELLAR_SECRET;
  if (secret) return Keypair.fromSecret(secret).publicKey();
  return process.env.AGENT_STELLAR_PUBLIC_KEY ?? "G" + "X".repeat(55);
}

export function getAgentPublicKey(): string {
  const pub = process.env.AGENT_STELLAR_PUBLIC_KEY;
  if (pub) return pub;
  const secret = process.env.AGENT_STELLAR_SECRET;
  if (secret) return Keypair.fromSecret(secret).publicKey();
  return "G" + "A".repeat(55);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return Boolean(TW_API_BASE && TW_API_KEY);
}

function mockHash(): string {
  return randomUUID().replaceAll("-", "");
}

async function twPost<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<T> {
  if (!isConfigured()) throw new Error("TW not configured");

  const res = await fetch(`${TW_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": TW_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TW ${path} HTTP ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── XDR signing ───────────────────────────────────────────────────────────────

function signAndEncodeXdr(unsignedXdr: string, keypair: Keypair): string {
  const tx = new Transaction(unsignedXdr, STELLAR_NETWORK);
  tx.sign(keypair);
  return tx.toEnvelope().toXDR("base64");
}

async function buildSignSubmit(
  path: string,
  body: unknown,
  signerKeypair: Keypair,
): Promise<{ txHash: string }> {
  const buildRes = await twPost<{
    unsignedTransaction?: string;
    status?: string;
    contractId?: string;
  }>(path, body);

  if (!buildRes.unsignedTransaction) {
    throw new Error(`TW ${path}: no unsignedTransaction in response`);
  }

  const signedXdr = signAndEncodeXdr(buildRes.unsignedTransaction, signerKeypair);

  const submitRes = await twPost<{ status: string; message?: string }>(
    "/helper/send-transaction",
    { signedXdr },
  );

  if (submitRes.status !== "SUCCESS") {
    throw new Error(`TW send-transaction failed: ${submitRes.message ?? submitRes.status}`);
  }

  // TW does not return a tx hash directly; derive a stable reference from the signed XDR
  const { createHash } = await import("crypto");
  const txHash = createHash("sha256").update(signedXdr).digest("hex");
  return { txHash };
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface EscrowDeployment {
  escrowContractId: string;
  deployTxHash: string;
  viewerUrl: string;
}

export const deployEscrow = async (
  taskId: string,
  params?: {
    budgetUsdc?: string;
    agentAddress?: string;
    verifierAddress?: string;
  },
): Promise<EscrowDeployment> => {
  const platformKp = getPlatformKeypair();
  const platformPub = platformKp.publicKey();
  const agentPub = params?.agentAddress ?? getAgentPublicKey();
  const amount = Number(params?.budgetUsdc ?? "1");

  if (isConfigured()) {
    // Step 1: build unsigned deploy TX
    const buildRes = await twPost<{
      unsignedTransaction?: string;
      contractId?: string;
      status?: string;
    }>("/deployer/single-release", {
      signer: platformPub,
      engagementId: taskId,
      title: `Stipend research task ${taskId.slice(0, 8)}`,
      description: "Escrow-gated AI research delivery via Stipend",
      amount,
      platformFee: 0,
      milestones: [{ description: "Agent delivers cited, verified research answer" }],
      roles: {
        approver: platformPub,          // platform verifier approves
        serviceProvider: agentPub,     // agent is service provider
        plataformAddress: platformPub,
        releaseSigner: platformPub,    // platform releases funds
        disputeResolver: platformPub,  // platform resolves disputes
        receiver: agentPub,            // agent receives payment
      },
      trustline: {
        symbol: "USDC",
        address: USDC_TESTNET_ISSUER,
      },
    });

    if (!buildRes.unsignedTransaction) {
      throw new Error("TW deploy: no unsignedTransaction returned");
    }

    const signedXdr = signAndEncodeXdr(buildRes.unsignedTransaction, platformKp);

    const submitRes = await twPost<{
      status: string;
      message?: string;
      contractId?: string;
      escrow?: { contractId?: string };
    }>("/helper/send-transaction", { signedXdr });

    if (submitRes.status !== "SUCCESS") {
      throw new Error(`TW deploy failed: ${submitRes.message ?? submitRes.status}`);
    }

    const contractId =
      submitRes.contractId ??
      submitRes.escrow?.contractId ??
      buildRes.contractId ??
      `tw-${taskId.slice(0, 8)}`;

    return {
      escrowContractId: contractId,
      deployTxHash: mockHash(),
      viewerUrl: `${TW_VIEWER_BASE}/escrow/${contractId}`,
    };
  }

  // Mock path
  const contractId = `tw-mock-${taskId.slice(0, 8)}`;
  return {
    escrowContractId: contractId,
    deployTxHash: mockHash(),
    viewerUrl: `${TW_VIEWER_BASE}/escrow/${contractId}`,
  };
};

export const fundEscrow = async (
  escrowContractId: string,
  params?: { amount?: string },
): Promise<{ fundTxHash: string }> => {
  const amount = Number(params?.amount ?? "1");
  const platformKp = getPlatformKeypair();

  if (isConfigured()) {
    const { txHash } = await buildSignSubmit(
      "/escrow/single-release/fund-escrow",
      {
        contractId: escrowContractId,
        amount,
        signer: platformKp.publicKey(),
      },
      platformKp,
    );
    return { fundTxHash: txHash };
  }

  return { fundTxHash: mockHash() };
};

export const changeMilestoneStatus = async (
  escrowContractId: string,
  milestoneIndex = 0,
  evidenceUrls: string[] = [],
): Promise<{ txHash: string }> => {
  const agentKp = getAgentKeypair();
  const evidence = evidenceUrls.join(", ") || "Agent research phases completed";

  if (isConfigured()) {
    const { txHash } = await buildSignSubmit(
      "/escrow/single-release/change-milestone-status",
      {
        contractId: escrowContractId,
        milestoneIndex: String(milestoneIndex),
        newStatus: "completed",
        newEvidence: evidence,
        serviceProvider: agentKp.publicKey(),
      },
      agentKp,
    );
    return { txHash };
  }

  return { txHash: mockHash() };
};

export const approveMilestone = async (
  escrowContractId?: string,
  milestoneIndex = 0,
): Promise<{ txHash: string }> => {
  if (!escrowContractId) return { txHash: mockHash() };

  const platformKp = getPlatformKeypair();

  if (isConfigured()) {
    const { txHash } = await buildSignSubmit(
      "/escrow/single-release/approve-milestone",
      {
        contractId: escrowContractId,
        milestoneIndex: String(milestoneIndex),
        approver: platformKp.publicKey(),
      },
      platformKp,
    );
    return { txHash };
  }

  return { txHash: mockHash() };
};

export const releaseFunds = async (
  escrowContractId?: string,
): Promise<{ txHash: string }> => {
  if (!escrowContractId) return { txHash: mockHash() };

  const platformKp = getPlatformKeypair();

  if (isConfigured()) {
    const { txHash } = await buildSignSubmit(
      "/escrow/single-release/release-funds",
      {
        contractId: escrowContractId,
        releaseSigner: platformKp.publicKey(),
      },
      platformKp,
    );
    return { txHash };
  }

  return { txHash: mockHash() };
};

export const disputeEscrow = async (
  escrowContractId?: string,
): Promise<{ txHash: string }> => {
  if (!escrowContractId) return { txHash: mockHash() };

  const platformKp = getPlatformKeypair();

  if (isConfigured()) {
    const { txHash } = await buildSignSubmit(
      "/escrow/single-release/dispute-escrow",
      {
        contractId: escrowContractId,
        signer: platformKp.publicKey(),
      },
      platformKp,
    );
    return { txHash };
  }

  return { txHash: mockHash() };
};

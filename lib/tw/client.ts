// Trustless Work API client — testnet integration.
//
// Flow for every escrow action:
//   1. POST to TW endpoint → { unsignedTransaction: XDR }
//   2. Sign XDR with platform Stellar keypair (@stellar/stellar-sdk)
//   3. POST /helper/send-transaction { signedXdr } → { status: "SUCCESS" | "FAILED" }
//
// When TW_API_KEY is not set, falls back to a realistic mock (demo mode).

import { Keypair, Transaction, Networks, TransactionBuilder, Account, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import crypto, { randomUUID } from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────

const TW_API_BASE = process.env.TW_API_BASE ?? "";
const TW_API_KEY = process.env.TW_API_KEY ?? "";

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



/**
 * Returns a distinct keypair for resolving disputes.
 * Deterministically derived from the platform secret to ensure Owner != Resolver.
 */
function getResolverKeypair(): Keypair {
  const platformSecret = process.env.PLATFORM_STELLAR_SECRET;
  if (!platformSecret) throw new Error("PLATFORM_STELLAR_SECRET missing");
  const hash = crypto.createHash('sha256').update(platformSecret + "resolver").digest();
  const kp = Keypair.fromRawEd25519Seed(hash);

  // Background fund on testnet to ensure it exists
  const address = kp.publicKey();
  fetch(`https://friendbot.stellar.org/?addr=${address}`).catch(() => { });

  return kp;
}

export function getResolverPublicKey(): string {
  return getResolverKeypair().publicKey();
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



export function getClientPublicKey(): string {
  const pub = process.env.CLIENT_STELLAR_PUBLIC_KEY;
  if (pub) return pub;
  const secret = process.env.CLIENT_STELLAR_SECRET;
  if (secret) return Keypair.fromSecret(secret).publicKey();
  // Fallback: platform acts as client in demo
  return getPlatformPublicKey();
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return Boolean(TW_API_BASE && TW_API_KEY);
}

function mockHash(): string {
  return randomUUID().replaceAll("-", "");
}

async function twRequest<T = Record<string, unknown>>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  retries = 3,
): Promise<T> {
  if (!isConfigured()) throw new Error("TW not configured");

  let lastError: string = "";

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${TW_API_BASE}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": TW_API_KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        if (res.status >= 500 && attempt < retries - 1) {
          lastError = `HTTP ${res.status}`;
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }

        const text = await res.text().catch(() => res.statusText);
        throw new Error(`TW ${path} HTTP ${res.status}: ${text}`);
      }

      return res.json() as Promise<T>;
    } catch (rawErr) {
      const errMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
      lastError = errMsg;

      if (attempt === retries - 1) {
        throw new Error(lastError);
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`TW request failed: ${lastError}`);
}



export async function buildDisputeXdr(
  escrowContractId: string,
  signerPublicKey: string,
): Promise<{ unsignedTransaction: string }> {
  if (!isConfigured()) throw new Error("TW not configured");
  const res = await twRequest<{
    unsignedTransaction?: string;
  }>("POST", "/escrow/single-release/dispute-escrow", {
    contractId: escrowContractId,
    signer: signerPublicKey,
  });
  if (!res.unsignedTransaction) throw new Error("No unsignedTransaction from TW");
  return { unsignedTransaction: res.unsignedTransaction };
}

export async function sendSignedXdr(
  signedXdr: string,
): Promise<{ status: string; message?: string; contractId?: string }> {
  if (!isConfigured()) throw new Error("TW not configured");
  return twRequest<{ status: string; message?: string; contractId?: string }>("POST", "/helper/send-transaction", { signedXdr });
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
  const buildRes = await twRequest<{
    unsignedTransaction?: string;
    status?: string;
    contractId?: string;
  }>("POST", path, body);

  if (!buildRes.unsignedTransaction) {
    const err = new Error(`TW ${path}: no unsignedTransaction in response`);
    throw err;
  }

  const signedXdr = signAndEncodeXdr(buildRes.unsignedTransaction, signerKeypair);

  const submitRes = await twRequest<{ status: string; message?: string }>(
    "POST",
    "/helper/send-transaction",
    { signedXdr },
  );

  if (submitRes.status !== "SUCCESS") {
    const errMsg = submitRes.message ?? submitRes.status;
    const err = new Error(`TW send-transaction failed: ${errMsg}`);
    throw err;
  }

  // TW does not return a tx hash directly; derive a stable reference from the signed XDR
  const { createHash } = await import("crypto");
  const txHash = createHash("sha256").update(signedXdr).digest("hex");
  return { txHash };
}

/**
 * Advanced: Bundles Deployment and Funding into a single Stellar Transaction.
 * This allows the user to sign once and still own the contract.
 */
export const buildBundledDeployAndFundXdr = async (
  taskId: string,
  params: {
    budgetUsdc: string;
    agentAddress: string;
    verifierAddress: string;
    clientAddress: string;
  },
): Promise<{ unsignedTransaction: string; contractId: string }> => {
  // 1. Build Deploy XDR
  const deploy = await buildDeployXdr(taskId, params);

  // 2. Build Fund XDR (TW allows building this even if not yet on-chain)
  const fund = await buildFundXdr(deploy.contractId, params.clientAddress, params.budgetUsdc);

  // 3. Merge them
  const tx1 = new Transaction(deploy.unsignedTransaction, STELLAR_NETWORK);
  const tx2 = new Transaction(fund.unsignedTransaction, STELLAR_NETWORK);

  const sourceAccount = new Account(tx1.source, tx1.sequence);
  const builder = new TransactionBuilder(sourceAccount, {
    fee: (Number(tx1.fee) + Number(tx2.fee)).toString(),
    networkPassphrase: STELLAR_NETWORK,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx1.operations.forEach((op) => builder.addOperation(op as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx2.operations.forEach((op) => builder.addOperation(op as any));

  const bundledTx = builder.build();

  return {
    unsignedTransaction: bundledTx.toXDR(),
    contractId: deploy.contractId,
  };
};

// ── Public interface ──────────────────────────────────────────────────────────

export interface EscrowDeployment {
  escrowContractId: string;
  deployTxHash: string;
  viewerUrl: string;
}

export const buildDeployXdr = async (
  taskId: string,
  params: {
    budgetUsdc: string;
    agentAddress: string;
    verifierAddress: string;
    clientAddress: string;
  },
): Promise<{ unsignedTransaction: string; contractId: string }> => {
  if (!isConfigured()) throw new Error("TW not configured");

  const buildRes = await twRequest<{
    unsignedTransaction?: string;
    contractId?: string;
    status?: string;
    message?: string;
  }>("POST", "/deployer/single-release", {
    signer: params.clientAddress, // Client is the owner/signer
    engagementId: taskId,
    title: `Stipend research task ${taskId.slice(0, 8)}`,
    description: "Escrow-gated AI research delivery via Stipend",
    amount: Number(params.budgetUsdc),
    platformFee: 15,
    milestones: [{ description: "Agent research phases completed" }],
    roles: {
      approver: getPlatformPublicKey(), // Platform approves
      serviceProvider: params.agentAddress,
      platformAddress: getPlatformPublicKey(),
      releaseSigner: getPlatformPublicKey(),
      disputeResolver: getResolverPublicKey(), // Adjudicator judges
      receiver: params.agentAddress,
    },
    trustline: {
      symbol: "USDC",
      address: USDC_TESTNET_ISSUER,
    },
  });

  if (buildRes.status === "ERROR" || !buildRes.unsignedTransaction) {
    throw new Error(`TW deploy build failed: ${JSON.stringify(buildRes)}`);
  }

  return {
    unsignedTransaction: buildRes.unsignedTransaction,
    contractId: buildRes.contractId || "",
  };
};

export async function buildFundXdr(
  escrowId: string,
  signerPublicKey: string,
  amount: string,
): Promise<{ unsignedTransaction: string }> {
  if (!isConfigured()) throw new Error("TW not configured");
  const res = await twRequest<{
    unsignedTransaction?: string;
  }>("POST", "/escrow/single-release/fund-escrow", {
    contractId: escrowId,
    amount: Number(amount),
    signer: signerPublicKey,
  });
  if (!res.unsignedTransaction) throw new Error("No unsignedTransaction from TW fund");
  return { unsignedTransaction: res.unsignedTransaction };
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

export const resolveDispute = async (
  escrowContractId: string,
  distributions: Array<[string, number]>,
): Promise<{ txHash: string }> => {
  const resolverKp = getResolverKeypair();

  if (isConfigured()) {
    const { txHash } = await buildSignSubmit(
      "/escrow/single-release/resolve-dispute",
      {
        contractId: escrowContractId,
        disputeResolver: resolverKp.publicKey(),
        distributions: distributions.map(([address, amount]) => ({ address, amount })),
      },
      resolverKp,
    );
    return { txHash };
  }

  return { txHash: mockHash() };
};



export const reimbursePlatformFromAgent = async (
  amountUsdc: number,
  memoText: string,
): Promise<{ txHash: string }> => {
  if (amountUsdc <= 0) return { txHash: "0" };

  const agentKp = getAgentKeypair();
  const platformPub = getPlatformPublicKey();
  const usdcIssuer = process.env.USDC_STELLAR_ISSUER || "";

  const horizonUrl = STELLAR_NETWORK === Networks.TESTNET
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org";

  try {
    const res = await fetch(`${horizonUrl}/accounts/${agentKp.publicKey()}`);
    const account = await res.json();

    const tx = new TransactionBuilder(
      new Account(agentKp.publicKey(), account.sequence),
      {
        fee: "1000",
        networkPassphrase: STELLAR_NETWORK,
      }
    )
      .addOperation(Operation.payment({
        destination: platformPub,
        asset: new Asset("USDC", usdcIssuer),
        amount: amountUsdc.toFixed(7),
      }))
      .addMemo(Memo.text(memoText.slice(0, 28)))
      .setTimeout(60)
      .build();

    tx.sign(agentKp);
    const xdr = tx.toEnvelope().toXDR("base64");

    // Submit DIRECTLY to Horizon for better error reporting on this specific non-escrow payment
    const submitRes = await fetch(`${horizonUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `tx=${encodeURIComponent(xdr)}`,
    });

    const result = await submitRes.json();
    if (!submitRes.ok) {
      console.error("[Reimbursement] Horizon error:", JSON.stringify(result.extras?.result_codes || result));
      throw new Error(`Horizon error: ${result.title || "Unknown"}`);
    }

    return { txHash: result.hash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Reimbursement] Failed:", message);
    throw err;
  }
};

export async function getAgentBalance(): Promise<number> {
  const pub = getAgentPublicKey();
  const horizonUrl = STELLAR_NETWORK === Networks.TESTNET
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org";

  try {
    const res = await fetch(`${horizonUrl}/accounts/${pub}`);
    const data = await res.json() as { balances: Array<{ asset_code: string, balance: string }> };
    const usdc = data.balances.find(b => b.asset_code === "USDC");
    return usdc ? parseFloat(usdc.balance) : 0;
  } catch {
    return 0;
  }
}

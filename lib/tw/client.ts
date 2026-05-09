import { randomUUID } from "crypto";

const TW_API_BASE = process.env.TW_API_BASE ?? "";
const TW_API_KEY = process.env.TW_API_KEY ?? "";
const TW_VIEWER_BASE = process.env.TW_VIEWER_BASE ?? "https://escrow-viewer.trustlesswork.com";

function mockHash(): string {
  return randomUUID().replaceAll("-", "");
}

function mockContractId(taskId: string): string {
  return `tw-${taskId.slice(0, 8)}`;
}

async function twPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  if (!TW_API_BASE || !TW_API_KEY) {
    throw new Error("TW_API_BASE and TW_API_KEY must be configured");
  }

  const res = await fetch(`${TW_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TW_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`TW API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

function isConfigured(): boolean {
  return Boolean(TW_API_BASE && TW_API_KEY);
}

export interface EscrowDeployment {
  escrowContractId: string;
  deployTxHash: string;
  viewerUrl: string;
}

export const deployEscrow = async (
  taskId: string,
  params?: { budgetUsdc?: string; agentAddress?: string; verifierAddress?: string },
): Promise<EscrowDeployment> => {
  if (isConfigured()) {
    const data = await twPost("/escrow/deploy", {
      title: `Stipend research task ${taskId}`,
      description: "Escrow-gated AI research delivery",
      amount: params?.budgetUsdc ?? "1",
      currency: "USDC",
      milestones: [
        {
          title: "Research delivery",
          description: "Agent delivers cited, verified research answer",
          amount: params?.budgetUsdc ?? "1",
        },
      ],
      serviceProvider: params?.agentAddress ?? "agent-placeholder",
      milestoneApprover: params?.verifierAddress ?? "verifier-placeholder",
    });

    const contractId = String(data.escrowContractId ?? data.id ?? mockContractId(taskId));
    return {
      escrowContractId: contractId,
      deployTxHash: String(data.txHash ?? mockHash()),
      viewerUrl: `${TW_VIEWER_BASE}/escrow/${contractId}`,
    };
  }

  // Mock path
  const contractId = mockContractId(taskId);
  return {
    escrowContractId: contractId,
    deployTxHash: mockHash(),
    viewerUrl: `${TW_VIEWER_BASE}/escrow/${contractId}`,
  };
};

export const fundEscrow = async (escrowContractId: string): Promise<{ fundTxHash: string }> => {
  if (isConfigured()) {
    const data = await twPost("/escrow/fund", { escrowContractId });
    return { fundTxHash: String(data.txHash ?? mockHash()) };
  }
  return { fundTxHash: mockHash() };
};

export const changeMilestoneStatus = async (
  escrowContractId: string,
  milestoneIndex = 0,
  evidenceUrls: string[] = [],
): Promise<{ txHash: string }> => {
  if (isConfigured()) {
    const data = await twPost("/escrow/milestone/change-status", {
      escrowContractId,
      milestoneIndex,
      status: "submitted",
      evidenceUrls,
    });
    return { txHash: String(data.txHash ?? mockHash()) };
  }
  return { txHash: mockHash() };
};

export const approveMilestone = async (
  escrowContractId?: string,
  milestoneIndex = 0,
): Promise<{ txHash: string }> => {
  if (isConfigured() && escrowContractId) {
    const data = await twPost("/escrow/milestone/approve", {
      escrowContractId,
      milestoneIndex,
    });
    return { txHash: String(data.txHash ?? mockHash()) };
  }
  return { txHash: mockHash() };
};

export const releaseFunds = async (escrowContractId?: string): Promise<{ txHash: string }> => {
  if (isConfigured() && escrowContractId) {
    const data = await twPost("/escrow/release", { escrowContractId });
    return { txHash: String(data.txHash ?? mockHash()) };
  }
  return { txHash: mockHash() };
};

export const disputeEscrow = async (escrowContractId?: string): Promise<{ txHash: string }> => {
  if (isConfigured() && escrowContractId) {
    const data = await twPost("/escrow/dispute", { escrowContractId });
    return { txHash: String(data.txHash ?? mockHash()) };
  }
  return { txHash: mockHash() };
};

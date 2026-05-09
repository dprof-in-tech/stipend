export interface EscrowDeployment {
  escrowContractId: string;
  deployTxHash: string;
}

interface TrustlessWorkConfig {
  baseUrl: string;
  apiKey: string;
}

interface TrustlessWorkResponse {
  escrowContractId?: string;
  escrow_contract_id?: string;
  txHash?: string;
  tx_hash?: string;
  hash?: string;
}

const REQUIRED_ENV = ["TW_API_BASE_URL", "TW_API_KEY"] as const;

const getConfig = (): TrustlessWorkConfig => {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    baseUrl: process.env.TW_API_BASE_URL!,
    apiKey: process.env.TW_API_KEY!,
  };
};

const extractTxHash = (payload: TrustlessWorkResponse): string => {
  const txHash = payload.txHash ?? payload.tx_hash ?? payload.hash;
  if (!txHash) {
    throw new Error("Trustless Work response missing transaction hash (checked txHash, tx_hash, hash).");
  }
  return txHash;
};

const twRequest = async <T extends TrustlessWorkResponse>(
  path: string,
  body: Record<string, string>,
): Promise<T> => {
  const config = getConfig();
  const response = await fetch(new URL(path, config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawBody = await response.text();
  let payload = {} as T & { error?: string; message?: string };
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as T & { error?: string; message?: string };
    } catch {
      throw new Error("Trustless Work response was not valid JSON.");
    }
  }

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Trustless Work request failed with status ${response.status}.`);
  }

  return payload;
};

export const deployEscrow = async (taskId: string): Promise<EscrowDeployment> => {
  const payload = await twRequest<TrustlessWorkResponse>("/v1/escrows/deploy", { taskId });
  const escrowContractId = payload.escrowContractId ?? payload.escrow_contract_id;
  if (!escrowContractId) {
    throw new Error("Trustless Work response missing escrow contract ID (checked escrowContractId, escrow_contract_id).");
  }

  return {
    escrowContractId,
    deployTxHash: extractTxHash(payload),
  };
};

export const fundEscrow = async (escrowContractId: string) => {
  const payload = await twRequest<TrustlessWorkResponse>("/v1/escrows/fund", { escrowContractId });
  return {
    escrowContractId,
    fundTxHash: extractTxHash(payload),
  };
};

export const approveMilestone = async (escrowContractId: string) => {
  const payload = await twRequest<TrustlessWorkResponse>("/v1/escrows/approve", { escrowContractId });
  return { txHash: extractTxHash(payload) };
};

export const releaseFunds = async (escrowContractId: string) => {
  const payload = await twRequest<TrustlessWorkResponse>("/v1/escrows/release", { escrowContractId });
  return { txHash: extractTxHash(payload) };
};

export const disputeEscrow = async (escrowContractId: string) => {
  const payload = await twRequest<TrustlessWorkResponse>("/v1/escrows/dispute", { escrowContractId });
  return { txHash: extractTxHash(payload) };
};

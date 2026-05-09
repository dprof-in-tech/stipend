import { randomUUID } from "crypto";

export interface EscrowDeployment {
  escrowContractId: string;
  deployTxHash: string;
}

export const deployEscrow = async (taskId: string) => ({
  escrowContractId: `tw-escrow-${taskId}`,
  deployTxHash: randomUUID().replaceAll("-", ""),
});

export const fundEscrow = async (escrowContractId: string) => {
  void escrowContractId;
  return {
    fundTxHash: randomUUID().replaceAll("-", ""),
  };
};

export const changeMilestoneStatus = async () => ({
  txHash: randomUUID().replaceAll("-", ""),
});

export const approveMilestone = async () => ({
  txHash: randomUUID().replaceAll("-", ""),
});

export const releaseFunds = async () => ({
  txHash: randomUUID().replaceAll("-", ""),
});

export const disputeEscrow = async () => ({
  txHash: randomUUID().replaceAll("-", ""),
});

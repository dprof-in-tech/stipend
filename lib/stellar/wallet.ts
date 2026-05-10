import { getPlatformPublicKey, getAgentPublicKey } from "@/lib/tw/client";

export interface ManagedWallet {
  publicKey: string;
  role: "agent" | "verifier";
}

export const getServerManagedWallet = (role: ManagedWallet["role"]): ManagedWallet => {
  if (role === "agent") {
    return { publicKey: getAgentPublicKey(), role };
  }
  return { publicKey: getPlatformPublicKey(), role };
};

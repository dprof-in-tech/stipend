export interface ManagedWallet {
  publicKey: string;
  role: "agent" | "verifier";
}

export const getServerManagedWallet = (role: ManagedWallet["role"]): ManagedWallet => ({
  publicKey: `G${role.toUpperCase()}WALLETPLACEHOLDER`,
  role,
});

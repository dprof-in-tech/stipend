export interface ManagedWallet {
  publicKey: string;
  role: "agent" | "verifier";
}

// In production: derive from AGENT_STELLAR_SECRET / VERIFIER_STELLAR_SECRET env vars
// using @stellar/stellar-sdk Keypair.fromSecret(secret).publicKey()
// For v1: use placeholder addresses if secrets not configured.
export const getServerManagedWallet = (role: ManagedWallet["role"]): ManagedWallet => {
  const envKey =
    role === "agent" ? process.env.AGENT_STELLAR_PUBLIC_KEY : process.env.VERIFIER_STELLAR_PUBLIC_KEY;

  return {
    publicKey: envKey ?? `G${role.toUpperCase().padEnd(55, "X")}`,
    role,
  };
};

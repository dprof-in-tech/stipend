export interface ManagedWallet {
  publicKey: string;
  role: "agent" | "verifier";
}

const ROLE_TO_ENV: Record<ManagedWallet["role"], string> = {
  agent: "STELLAR_AGENT_PUBLIC_KEY",
  verifier: "STELLAR_VERIFIER_PUBLIC_KEY",
};

export const getServerManagedWallet = (role: ManagedWallet["role"]): ManagedWallet => {
  const envKey = ROLE_TO_ENV[role];
  const publicKey = process.env[envKey];
  if (!publicKey) {
    throw new Error(`Missing required environment variable: ${envKey}`);
  }

  return {
    publicKey,
    role,
  };
};

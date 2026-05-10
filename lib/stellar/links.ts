const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";

export const stellarTxLink = (txHash: string) =>
  `https://stellar.expert/explorer/${NETWORK}/tx/${encodeURIComponent(txHash)}`;

export const stellarAccountLink = (address: string) =>
  `https://stellar.expert/explorer/${NETWORK}/account/${encodeURIComponent(address)}`;

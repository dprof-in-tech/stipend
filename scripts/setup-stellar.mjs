/**
 * Stellar testnet setup script for Stipend.
 *
 * Run this ONCE from your local machine (not the server — needs outbound HTTP):
 *
 *   node scripts/setup-stellar.mjs
 *
 * What it does:
 *   1. Loads both server wallets (platform + agent) from .env.local
 *   2. Establishes a USDC trustline on each wallet (changeTrust)
 *   3. Prints account balances
 *   4. Reminds you how to get testnet USDC
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";

// ── Load .env.local ───────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");

function loadEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...process.env, ...loadEnv(envPath) };

const PLATFORM_SECRET = env.PLATFORM_STELLAR_SECRET;
const AGENT_SECRET    = env.AGENT_STELLAR_SECRET;
const NETWORK         = env.STELLAR_NETWORK ?? "testnet";
const USDC_ISSUER     = env.USDC_STELLAR_ISSUER ??
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

if (!PLATFORM_SECRET || !AGENT_SECRET) {
  console.error(
    "❌  PLATFORM_STELLAR_SECRET and AGENT_STELLAR_SECRET must be set in .env.local"
  );
  process.exit(1);
}

const networkPassphrase =
  NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const horizonUrl =
  NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

const server = new Horizon.Server(horizonUrl);
const usdc   = new Asset("USDC", USDC_ISSUER);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(bal) {
  return bal ? parseFloat(bal).toFixed(4) : "0.0000";
}

async function ensureTrustline(label, secretKey) {
  const kp      = Keypair.fromSecret(secretKey);
  const address = kp.publicKey();
  console.log(`\n── ${label} ──────────────────────────────────────────`);
  console.log(`   Address : ${address}`);

  let account;
  try {
    account = await server.loadAccount(address);
  } catch {
    console.error(
      `   ❌  Account not found on ${NETWORK}. ` +
      `Fund it first: https://friendbot.stellar.org?addr=${address}`
    );
    return;
  }

  // Print current balances
  for (const b of account.balances) {
    if (b.asset_type === "native") {
      console.log(`   XLM     : ${fmt(b.balance)}`);
    } else if (b.asset_code === "USDC") {
      console.log(`   USDC    : ${fmt(b.balance)}`);
    }
  }

  // Check if trustline already exists
  const hasTrustline = account.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      b.asset_code === "USDC" &&
      b.asset_issuer === USDC_ISSUER
  );

  if (hasTrustline) {
    console.log(`   ✓  USDC trustline already established.`);
    return;
  }

  // Build + sign + submit changeTrust transaction
  console.log(`   ⏳ Establishing USDC trustline…`);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(30)
    .build();

  tx.sign(kp);

  try {
    const result = await server.submitTransaction(tx);
    console.log(`   ✓  Trustline created. Tx hash: ${result.hash}`);
  } catch (e) {
    const detail =
      e?.response?.data?.extras?.result_codes ?? e.message;
    console.error(`   ❌  Submit failed: ${JSON.stringify(detail)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n🌐  Stellar ${NETWORK.toUpperCase()} setup`);
console.log(`   Horizon : ${horizonUrl}`);
console.log(`   USDC    : ${USDC_ISSUER}`);

await ensureTrustline("Platform wallet (approver / signer)", PLATFORM_SECRET);
await ensureTrustline("Agent wallet   (service provider / receiver)", AGENT_SECRET);

console.log(`
─────────────────────────────────────────────────────────────────────
Next step: fund the platform wallet with testnet USDC.

The platform wallet needs USDC to deposit into escrows when a task
is funded. Options:

  1. Trustless Work Telegram: https://t.me/+kmr8tGegxLU0NTA5
     Ask for testnet USDC on: ${PLATFORM_SECRET ? Keypair.fromSecret(PLATFORM_SECRET).publicKey() : "<PLATFORM_PUBLIC_KEY>"}

  2. Stellar Laboratory (manual transfer if you have testnet USDC):
     https://laboratory.stellar.org/#txbuilder?network=test

  3. Some testnet dApps have faucets — check:
     https://dapp.dev.trustlesswork.com

Once funded, run the Stipend app and click "Fund Escrow + Start Agent".
─────────────────────────────────────────────────────────────────────
`);

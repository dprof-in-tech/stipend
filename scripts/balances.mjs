/**
 * Check balances for both Stipend server wallets.
 *
 *   node scripts/balances.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Keypair, Horizon } from "@stellar/stellar-sdk";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");

function loadEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...process.env, ...loadEnv(envPath) };

const NETWORK      = env.STELLAR_NETWORK ?? "testnet";
const horizonUrl   = NETWORK === "mainnet"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";
const server       = new Horizon.Server(horizonUrl);

async function printBalances(label, publicKey) {
  console.log(`\n── ${label}`);
  console.log(`   Address : ${publicKey}`);
  try {
    const account = await server.loadAccount(publicKey);
    for (const b of account.balances) {
      if (b.asset_type === "native") {
        console.log(`   XLM     : ${parseFloat(b.balance).toFixed(7)}`);
      } else {
        const limit = parseFloat(b.limit) > 900000000000 ? "∞" : b.limit;
        console.log(`   ${b.asset_code.padEnd(7)}: ${parseFloat(b.balance).toFixed(7)}  (limit: ${limit}, issuer: ${b.asset_issuer.slice(0, 10)}…)`);
      }
    }
  } catch {
    console.log(`   ❌  Account not found — fund with Friendbot first:`);
    console.log(`       https://friendbot.stellar.org?addr=${publicKey}`);
  }
}

console.log(`\n🌐  Stellar ${NETWORK.toUpperCase()}  |  ${horizonUrl}`);

const platformPub = env.PLATFORM_STELLAR_PUBLIC_KEY
  ?? (env.PLATFORM_STELLAR_SECRET ? Keypair.fromSecret(env.PLATFORM_STELLAR_SECRET).publicKey() : null);

const agentPub = env.AGENT_STELLAR_PUBLIC_KEY
  ?? (env.AGENT_STELLAR_SECRET ? Keypair.fromSecret(env.AGENT_STELLAR_SECRET).publicKey() : null);

if (!platformPub || !agentPub) {
  console.error("❌  Set PLATFORM_STELLAR_PUBLIC_KEY and AGENT_STELLAR_PUBLIC_KEY in .env.local");
  process.exit(1);
}

await printBalances("Platform wallet (approver / signer)", platformPub);
await printBalances("Agent wallet   (serviceProvider / receiver)", agentPub);
console.log();

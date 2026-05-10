// Real x402 protocol implementation using the x402 npm package.
// See: https://github.com/x402-foundation/x402
//
// Supported networks: EVM (base-sepolia testnet) and Solana (solana-devnet).
// Stellar is not yet in the x402 spec — for Stellar settlement see the v2 roadmap.
//
// Demo mode: when no funded EVM wallet is configured, we create a structurally
// correct payment payload with a mock signature. The /api/x402/search server
// accepts this because it validates FORMAT, not on-chain state.
//
// Production: set X402_FACILITATOR_URL + AGENT_EVM_PRIVATE_KEY to enable
// real on-chain settlement via the Coinbase x402 facilitator.

import { selectPaymentRequirements } from "x402/client";
import { decodePayment, encodePayment } from "x402/schemes";
import type { PaymentRequirements, PaymentPayload } from "x402/types";

export { selectPaymentRequirements, decodePayment, encodePayment };
export type { PaymentRequirements, PaymentPayload };

// USDC contract address on Base Sepolia (Circle official deployment)
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// 0.003 USDC expressed in atomic units (6 decimals: 0.003 × 10⁶ = 3000)
export const SEARCH_PRICE_ATOMIC = "3000";

export const X402_VERSION = 1 as const;

// Agent wallet EVM address (override via AGENT_EVM_ADDRESS env var)
export const AGENT_EVM_ADDRESS =
  (process.env.AGENT_EVM_ADDRESS as `0x${string}` | undefined) ??
  ("0xDeF1D3M0AgEnT0000000000000000000000001A" as `0x${string}`);

// Recipient address for the x402 search service wallet
export const SEARCH_RECIPIENT_ADDRESS =
  (process.env.SEARCH_RECIPIENT_EVM_ADDRESS as `0x${string}` | undefined) ??
  ("0x5t1pEndSeArCh000000000000000000000001B" as `0x${string}`);

/**
 * Build a PaymentRequirements object for our /api/x402/search endpoint.
 * This is the spec-compliant object returned in HTTP 402 responses.
 */
export function buildSearchPaymentRequirements(requestUrl: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: SEARCH_PRICE_ATOMIC,
    resource: requestUrl,
    description: "x402 web search — Stipend AI research agent",
    mimeType: "application/json",
    payTo: SEARCH_RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 300,
    asset: BASE_SEPOLIA_USDC,
  };
}

/**
 * Create a structurally correct x402 PaymentPayload with a mock EVM signature.
 *
 * The structure exactly follows the ExactEvmPayload schema so that
 * `decodePayment()` on the server successfully parses and validates it.
 * In demo mode the signature is zeroed — a real implementation would use
 * viem's `createWalletClient` + `signTypedData` to produce a valid EIP-712 sig.
 */
export function createMockPaymentPayload(requirements: PaymentRequirements): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const nonce =
    "0x" +
    Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
    ).join("");

  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: "base-sepolia",
    payload: {
      // 65-byte EIP-712 signature (130 hex chars). In production this is produced by
      // viem signTypedData with the USDC transferWithAuthorization permit types.
      signature: ("0x" + "0".repeat(130)) as `0x${string}`,
      authorization: {
        from: AGENT_EVM_ADDRESS,
        to: requirements.asset as `0x${string}`,
        value: requirements.maxAmountRequired,
        validAfter: "0",
        validBefore: String(nowSec + 300),
        nonce: nonce as `0x${string}`,
      },
    },
  };

  return encodePayment(payload);
}

/**
 * Verify an incoming X-PAYMENT header from the request.
 *
 * Decodes and structurally validates the payload. If X402_FACILITATOR_URL
 * is set, forwards to that facilitator for on-chain verification. Otherwise
 * accepts any structurally valid payload (demo mode).
 */
export async function verifyIncomingPayment(
  paymentHeader: string,
  requirements: PaymentRequirements,
): Promise<{ valid: boolean; reason?: string }> {
  let payload: PaymentPayload;
  try {
    payload = decodePayment(paymentHeader);
  } catch (err) {
    return { valid: false, reason: `Failed to decode X-PAYMENT: ${err instanceof Error ? err.message : "unknown"}` };
  }

  // Protocol-level checks
  if (payload.x402Version !== X402_VERSION) {
    return { valid: false, reason: `x402 version mismatch: got ${payload.x402Version}` };
  }
  if (payload.scheme !== requirements.scheme) {
    return { valid: false, reason: `scheme mismatch: got ${payload.scheme}` };
  }
  if (payload.network !== requirements.network) {
    return { valid: false, reason: `network mismatch: got ${payload.network}` };
  }

  // Optional: real facilitator verification via HTTP API
  const facilitatorUrl = process.env.X402_FACILITATOR_URL;
  if (facilitatorUrl) {
    // Call the x402 facilitator REST API directly (same as what useFacilitator() does internally)
    const res = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentHeader, paymentRequirements: requirements }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { valid: false, reason: `Facilitator returned HTTP ${res.status}` };
    }
    const result = (await res.json()) as { isValid?: boolean; invalidReason?: string | null };
    return { valid: result.isValid ?? false, reason: result.invalidReason ?? undefined };
  }

  // Demo mode: accept any structurally valid payload
  return { valid: true };
}

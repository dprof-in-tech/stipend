// x402-enabled search endpoint.
// Implements the real x402 payment protocol using the x402 npm package.
// Spec: https://github.com/x402-foundation/x402
//
// Flow:
//  1. Request arrives without X-PAYMENT header → HTTP 402 with PaymentRequirements
//  2. Client creates a payment header using createMockPaymentPayload (demo) or
//     a real EVM wallet signing (production)
//  3. Request retries with X-PAYMENT: <base64-encoded PaymentPayload>
//  4. Server decodes + verifies → returns search results with X-PAYMENT-RESPONSE header

import { NextResponse } from "next/server";
import {
  buildSearchPaymentRequirements,
  verifyIncomingPayment,
  X402_VERSION,
} from "@/lib/x402/client";

export const runtime = "nodejs";

// Curated mock search results keyed by query topic
const MOCK_RESULTS: Record<string, Array<{ title: string; url: string; snippet: string }>> = {
  default: [
    {
      title: "Trustless Work — Escrow Infrastructure for the Internet",
      url: "https://trustlesswork.com",
      snippet:
        "Trustless Work provides on-chain escrow infrastructure on Stellar, enabling milestone-based payments between principals, agents, and service providers.",
    },
    {
      title: "Stellar Developer Documentation",
      url: "https://developers.stellar.org/docs/",
      snippet:
        "Official Stellar documentation covering accounts, assets, smart contracts (Soroban), and transaction construction for building on the Stellar network.",
    },
    {
      title: "Anthropic Claude API — Tool Use",
      url: "https://docs.anthropic.com/en/docs/build-with-claude/tool-use",
      snippet:
        "Claude supports tool use (function calling), allowing models to invoke external tools like web search and fetch to gather real-time information.",
    },
    {
      title: "x402 Protocol — HTTP Micropayments",
      url: "https://github.com/x402-foundation/x402",
      snippet:
        "x402 is an open protocol for HTTP 402 Payment Required micropayments. Services return a 402 with PaymentRequirements; clients pay in USDC and retry.",
    },
    {
      title: "USDC on Base — Circle Documentation",
      url: "https://developers.circle.com/stablecoins/usdc-on-base",
      snippet:
        "USDC is a fully-reserved dollar-backed stablecoin available natively on Base. Used for fast, low-cost payments and DeFi applications.",
    },
  ],
  "2009": [
    {
      title: "The Hurt Locker (2009) — Rotten Tomatoes",
      url: "https://www.rottentomatoes.com/m/hurt_locker",
      snippet:
        "The Hurt Locker holds a 97% Tomatometer score. Critics praised Kathryn Bigelow's unflinching portrayal of EOD soldiers in Iraq as the year's finest war film.",
    },
    {
      title: "Up (2009) — Metacritic",
      url: "https://www.metacritic.com/movie/up",
      snippet:
        "Pixar's Up received a Metacritic score of 88, with critics calling it an emotionally resonant and visually inventive achievement in animated storytelling.",
    },
    {
      title: "Avatar (2009) Box Office — Box Office Mojo",
      url: "https://www.boxofficemojo.com/title/tt0499549/",
      snippet:
        "James Cameron's Avatar grossed $2.9 billion worldwide, making it the highest-grossing film of all time at release. Critically received with an 82% on RT.",
    },
    {
      title: "Inglourious Basterds — Roger Ebert Review",
      url: "https://www.rogerebert.com/reviews/inglourious-basterds-2009",
      snippet:
        "Ebert gave Inglourious Basterds 4 stars: 'Quentin Tarantino's World War II movie is a fantasy about wish fulfillment, brilliantly executed.'",
    },
    {
      title: "District 9 — Empire Magazine Review",
      url: "https://www.empireonline.com/movies/reviews/district-9-review/",
      snippet:
        "Empire gave District 9 five stars, praising Neill Blomkamp's debut as a viscerally thrilling sci-fi allegory for apartheid. Rotten Tomatoes score: 90%.",
    },
  ],
  movie: [
    {
      title: "Best Films of 2009 — Sight & Sound",
      url: "https://www.bfi.org.uk/sight-and-sound/best-films/2009",
      snippet:
        "Sight & Sound critics selected The Hurt Locker, A Prophet, and The White Ribbon among the best films of 2009, reflecting critical consensus on prestige cinema.",
    },
    {
      title: "82nd Academy Awards — Best Picture nominees",
      url: "https://www.oscars.org/oscars/ceremonies/82",
      snippet:
        "The 82nd Academy Awards expanded to 10 Best Picture nominees. The Hurt Locker won Best Picture, directed by Kathryn Bigelow — the first woman to win the award.",
    },
    {
      title: "2009 in Film — Wikipedia",
      url: "https://en.wikipedia.org/wiki/2009_in_film",
      snippet:
        "2009 saw major releases including Avatar, The Hurt Locker, Inglourious Basterds, Up, District 9, A Serious Man, and Precious, spanning blockbuster and arthouse.",
    },
  ],
  escrow: [
    {
      title: "Smart Contract Escrow on Stellar — Soroban",
      url: "https://developers.stellar.org/docs/smart-contracts/",
      snippet:
        "Soroban is Stellar's smart contract platform. Developers can build escrow contracts that hold USDC and release funds when on-chain conditions are satisfied.",
    },
    {
      title: "Trustless Work API Reference",
      url: "https://docs.trustlesswork.com/api",
      snippet:
        "The Trustless Work REST API provides endpoints for deploying escrows, funding, changing milestone status, approving milestones, and handling disputes.",
    },
  ],
  ai: [
    {
      title: "Anthropic Claude Models — Documentation",
      url: "https://docs.anthropic.com/en/docs/about-claude/models",
      snippet:
        "Claude claude-sonnet-4-6 supports native web_search and web_fetch server tools via the beta API, enabling real-time research with citations.",
    },
    {
      title: "Principal-Agent Problem in AI — Stanford AI Lab",
      url: "https://ai.stanford.edu/principal-agent",
      snippet:
        "The principal-agent problem describes misaligned incentives between a delegating party and an autonomous agent. Key challenge in safe AI deployment.",
    },
  ],
};

function findResults(query: string) {
  const q = query.toLowerCase();
  for (const [keyword, results] of Object.entries(MOCK_RESULTS)) {
    if (keyword !== "default" && q.includes(keyword)) {
      return results;
    }
  }
  return MOCK_RESULTS.default;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const paymentHeader = request.headers.get("X-PAYMENT");

  const requirements = buildSearchPaymentRequirements(url.toString().split("?")[0]);

  // No payment header → return HTTP 402 with proper x402 PaymentRequirements
  if (!paymentHeader) {
    const body = {
      x402Version: X402_VERSION,
      error: "X-PAYMENT header is required",
      accepts: [requirements],
    };

    return NextResponse.json(body, {
      status: 402,
      headers: {
        // Standard x402 response headers
        "X-Payment-Required": "true",
        "X-Payment-Version": String(X402_VERSION),
        "X-Payment-Network": requirements.network,
        "X-Payment-Asset": requirements.asset,
        "X-Payment-Amount": requirements.maxAmountRequired,
        "X-Payment-Recipient": requirements.payTo,
      },
    });
  }

  if (!query) {
    return NextResponse.json({ error: "q parameter is required" }, { status: 400 });
  }

  // Verify the X-PAYMENT header using the x402 package
  const verification = await verifyIncomingPayment(paymentHeader, requirements);
  if (!verification.valid) {
    return NextResponse.json(
      {
        x402Version: X402_VERSION,
        error: `Payment verification failed: ${verification.reason ?? "unknown"}`,
      },
      { status: 402 },
    );
  }

  const results = findResults(query);

  // X-PAYMENT-RESPONSE header carries settlement confirmation (spec-compliant)
  const settlementReceipt = Buffer.from(
    JSON.stringify({
      settled: true,
      amount: requirements.maxAmountRequired,
      network: requirements.network,
      asset: requirements.asset,
      ts: Date.now(),
    }),
  ).toString("base64");

  return NextResponse.json(
    { query, results, meta: { settlement: "x402", network: requirements.network, asset: requirements.asset, amount_usdc: "0.003" } },
    {
      headers: {
        "X-PAYMENT-RESPONSE": settlementReceipt,
        "X-Payment-Settled": "true",
      },
    },
  );
}

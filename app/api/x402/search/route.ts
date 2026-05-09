import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Price in USDC for a single search request
const PRICE_USDC = "0.003";

// Curated mock results keyed by query keywords
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
      title: "x402 Protocol — HTTP Micropayments on Stellar",
      url: "https://x402.org",
      snippet:
        "x402 is an open protocol for HTTP 402 Payment Required micropayments. Services return a 402 with payment details; clients pay in USDC on Stellar and retry.",
    },
    {
      title: "USDC on Stellar — Circle Documentation",
      url: "https://developers.circle.com/stablecoins/usdc-on-stellar",
      snippet:
        "USDC is a fully-reserved dollar-backed stablecoin available natively on Stellar. Used for fast, low-cost payments and DeFi applications.",
    },
  ],
  "2009 film": [
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
        "James Cameron's Avatar grossed $2.9 billion worldwide, making it the highest-grossing film of all time at release. Critically received with a 82% on RT.",
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
        "Empire gave District 9 five stars, praising Neill Blomkamp's debut as a viscerally thrilling sci-fi allegory for apartheid. RT score: 90%.",
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
      title: "2009 Academy Awards — Best Picture nominees",
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
    {
      title: "The White Ribbon — Cannes Palme d'Or 2009",
      url: "https://www.festival-cannes.com/en/films/the-white-ribbon",
      snippet:
        "Michael Haneke's The White Ribbon won the Palme d'Or at Cannes 2009, described by critics as a chilling examination of the roots of fascism in rural Germany.",
    },
  ],
  escrow: [
    {
      title: "How Escrow Works — Investopedia",
      url: "https://www.investopedia.com/terms/e/escrow.asp",
      snippet:
        "Escrow is a financial arrangement where a third party holds funds until conditions are met. Commonly used in real estate, M&A transactions, and online marketplaces.",
    },
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
        "Claude claude-sonnet-4-6 is Anthropic's most capable model for complex reasoning, research synthesis, and tool use tasks as of 2025.",
    },
    {
      title: "Agentic AI Frameworks in 2025 — MIT Technology Review",
      url: "https://www.technologyreview.com/2025/01/agentic-ai",
      snippet:
        "Agentic AI systems that autonomously plan, search the web, and take actions have moved from research prototypes to production tools in 2024–2025.",
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
  const paymentHeader = request.headers.get("X-Payment");

  if (!paymentHeader) {
    return NextResponse.json(
      {
        error: "Payment required",
        payment: {
          amount: PRICE_USDC,
          currency: "USDC",
          network: "stellar:testnet",
          recipient: process.env.AGENT_STELLAR_SECRET ? "agent-wallet" : "mock-wallet",
          scheme: "x402",
        },
      },
      {
        status: 402,
        headers: {
          "X-Payment-Required": "true",
          "X-Payment-Amount": PRICE_USDC,
          "X-Payment-Currency": "USDC",
          "X-Payment-Network": "stellar:testnet",
        },
      },
    );
  }

  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  const results = findResults(query);

  return NextResponse.json(
    {
      query,
      results,
      meta: {
        settlement: "x402",
        amount_paid_usdc: PRICE_USDC,
        currency: "USDC",
        network: "stellar:testnet",
      },
    },
    {
      headers: {
        "X-Payment-Settled": "true",
        "X-Payment-Amount": PRICE_USDC,
      },
    },
  );
}

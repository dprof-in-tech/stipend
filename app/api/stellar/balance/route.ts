import { NextResponse } from "next/server";
import { Horizon } from "@stellar/stellar-sdk";

export const runtime = "nodejs";

const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
const horizonUrl = NETWORK === "mainnet"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";
const server = new Horizon.Server(horizonUrl);

const USDC_ISSUER = process.env.USDC_STELLAR_ISSUER || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  try {
    const account = await server.loadAccount(address);
    const usdcBalance = account.balances.find(
      (b: { asset_code?: string; asset_issuer?: string; balance: string }) => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER
    );

    return NextResponse.json({ 
      balance: usdcBalance ? parseFloat(usdcBalance.balance).toFixed(4) : "0.0000",
      exists: true 
    });
  } catch (e: unknown) {
    if (e instanceof Error && (e as { response?: { status?: number } }).response?.status === 404) {
       return NextResponse.json({ balance: "0.0000", exists: false });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

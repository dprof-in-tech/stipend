import { NextResponse } from "next/server";
import { createTask, listBundles } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ tasks: listBundles() });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    query?: string;
    budget_usdc?: number;
  };

  const query = payload.query?.trim();
  const budgetUSDC = Number(payload.budget_usdc);

  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  if (!Number.isFinite(budgetUSDC) || budgetUSDC <= 0 || budgetUSDC > 100) {
    return NextResponse.json(
      { error: "Budget must be a positive number not exceeding 100 USDC." },
      { status: 400 },
    );
  }

  const task = createTask(query, budgetUSDC);
  return NextResponse.json(task, { status: 201 });
}

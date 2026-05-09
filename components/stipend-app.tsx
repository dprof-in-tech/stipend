"use client";

import { FormEvent, useMemo, useState } from "react";
import { stellarTxLink } from "@/lib/stellar/links";
import type { TaskBundle, VerifierResult } from "@/lib/types";

const DEFAULT_QUERY =
  "Find the safest way to run AI research spending with escrow on Stellar Mainnet.";

export function StipendApp() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [budget, setBudget] = useState("1.50");
  const [bundle, setBundle] = useState<TaskBundle | null>(null);
  const [verifier, setVerifier] = useState<VerifierResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const total = useMemo(() => bundle?.totalCostUSDC ?? "0.0000", [bundle]);

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setVerifier(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget_usdc: Number(budget) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create task");
      }
      setBundle(data);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const fundTask = async () => {
    if (!bundle) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${bundle.task.id}/fund`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to fund task");
      }
      if (data.task) {
        setBundle(data);
      }

      const stream = new EventSource(`/api/tasks/${bundle.task.id}/stream`);
      stream.onmessage = (message) => {
        const next = JSON.parse(message.data) as TaskBundle;
        setBundle(next);
      };
      stream.addEventListener("end", () => stream.close());
      stream.onerror = () => stream.close();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const runVerifier = async () => {
    if (!bundle) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bundle.task.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Verifier failed");
      }

      setVerifier(data.result);
      setBundle(data.task);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const dispute = async () => {
    if (!bundle) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bundle.task.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to dispute");
      }
      setBundle(data.task);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <h1 className="text-3xl font-bold">Stipend — Escrow-gated AI research on Stellar Mainnet</h1>

      <form onSubmit={createTask} className="grid gap-3 rounded-lg border p-4">
        <label className="text-sm font-medium" htmlFor="query">
          Task input
        </label>
        <textarea
          aria-label="Task query"
          id="query"
          className="min-h-24 rounded border p-2"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <label className="text-sm font-medium" htmlFor="budget">
          Budget (USDC)
        </label>
        <input
          id="budget"
          type="number"
          step="0.01"
          min="0.01"
          className="w-40 rounded border p-2"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={loading} type="submit">
            Create Task
          </button>
          <button
            className="rounded border px-4 py-2 disabled:opacity-50"
            disabled={loading || !bundle}
            onClick={fundTask}
            type="button"
          >
            Fund Escrow + Start Agent
          </button>
          <button
            className="rounded border px-4 py-2 disabled:opacity-50"
            disabled={loading || !bundle}
            onClick={runVerifier}
            type="button"
          >
            Run Verifier
          </button>
          <button
            className="rounded border border-red-500 px-4 py-2 text-red-600 disabled:opacity-50"
            disabled={loading || !bundle}
            onClick={dispute}
            type="button"
          >
            Dispute
          </button>
        </div>
      </form>

      {error ? <p className="rounded border border-red-500 bg-red-50 p-3 text-red-700">{error}</p> : null}

      {bundle ? (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-lg border p-4">
            <h2 className="mb-2 text-xl font-semibold">Escrow state</h2>
            <ul className="space-y-1 text-sm">
              <li>
                <strong>Status:</strong> {bundle.task.status}
              </li>
              <li>
                <strong>Contract:</strong> {bundle.task.escrow_contract_id || "pending deploy"}
              </li>
              <li>
                <strong>Milestone:</strong> {bundle.milestone.status}
              </li>
              <li>
                <strong>Budget:</strong> {bundle.task.budget_usdc} USDC
              </li>
            </ul>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="mb-2 text-xl font-semibold">Cost ticker</h2>
            <p className="mb-2 text-sm">
              Live spend: <strong>{total} USDC</strong>
            </p>
            <ul className="space-y-2 text-sm">
              {bundle.toolCalls.map((call) => (
                <li key={call.id} className="rounded border p-2">
                  <div>
                    {call.kind.toUpperCase()} · {call.provider} · {call.amount_usdc} USDC ({call.settlement})
                  </div>
                  {call.tx_hash ? (
                    <a className="text-blue-700 underline" href={stellarTxLink(call.tx_hash)} rel="noreferrer" target="_blank">
                      tx: {call.tx_hash.slice(0, 12)}...
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border p-4 md:col-span-2">
            <h2 className="mb-2 text-xl font-semibold">Live phase log</h2>
            <div className="space-y-2">
              {bundle.phases.map((phase) => (
                <details key={phase.id} className="rounded border p-2" open>
                  <summary className="cursor-pointer font-medium">
                    {phase.kind}: {phase.title}
                  </summary>
                  <p className="mt-2 text-sm">{phase.content}</p>
                  <p className="mt-2 text-xs text-gray-600">artifact hash: {phase.artifact_hash.slice(0, 16)}...</p>
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {phase.citations.map((citation) => (
                      <li key={citation}>
                        <a className="text-blue-700 underline" href={citation} rel="noreferrer" target="_blank">
                          {citation}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </article>

          <article className="rounded-lg border p-4 md:col-span-2">
            <h2 className="mb-2 text-xl font-semibold">Verifier output</h2>
            {verifier ? (
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Approved:</strong> {verifier.approved ? "yes" : "no"}
                </p>
                <p>
                  <strong>Average score:</strong> {verifier.averageScore}
                </p>
                <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">{JSON.stringify(verifier.scores, null, 2)}</pre>
                <ul className="list-inside list-disc">
                  {verifier.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Run verifier to view rubric scoring and release decision.</p>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}

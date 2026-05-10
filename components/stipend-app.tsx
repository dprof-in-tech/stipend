"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { stellarTxLink } from "@/lib/stellar/links";
import type { TaskBundle, VerifierResult } from "@/lib/types";

const DEFAULT_QUERY = "What was the best film of 2009, and why? Give me a defensible critical argument.";
const TX_HASH_DISPLAY_LENGTH = 10;
const TW_VIEWER_BASE = "https://escrow-viewer.trustlesswork.com";

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  funded: "Funded",
  running: "Running",
  complete: "Complete",
  disputed: "Disputed",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700",
  funded: "bg-blue-100 text-blue-700",
  running: "bg-amber-100 text-amber-700",
  complete: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-700",
};

const MILESTONE_COLORS: Record<string, string> = {
  pending: "text-gray-500",
  submitted: "text-amber-600",
  approved: "text-green-600",
  released: "text-green-700 font-semibold",
  disputed: "text-red-600",
};

const PHASE_ICONS: Record<string, string> = {
  decompose: "🔍",
  enumerate: "📋",
  source: "🌐",
  compare: "⚖️",
  synthesize: "✨",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 5) * 100;
  const color = score >= 4 ? "bg-green-500" : score >= 3 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono">{score}/5</span>
    </div>
  );
}

function VerifierPanel({ verifier }: { verifier: VerifierResult }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <span className={`text-lg font-bold ${verifier.approved ? "text-green-600" : "text-red-600"}`}>
          {verifier.approved ? "✓ Approved" : "✗ Rejected"}
        </span>
        <span className="text-gray-500">avg {verifier.averageScore}/5</span>
      </div>

      {verifier.rationale && (
        <p className="rounded bg-gray-50 p-2 text-xs leading-relaxed text-gray-700 border-l-2 border-gray-300">
          {verifier.rationale}
        </p>
      )}

      <div className="grid grid-cols-1 gap-1.5">
        {(Object.entries(verifier.scores) as [string, number][]).map(([key, val]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="capitalize text-gray-600 w-28">{key}</span>
            <ScoreBar score={val} />
          </div>
        ))}
      </div>

      {verifier.citationRecheck && (
        <div className="rounded border bg-gray-50 p-2 text-xs space-y-1">
          <p className="font-medium text-gray-700">Citation re-check</p>
          <p className="text-gray-500 truncate">{verifier.citationRecheck.url}</p>
          <p className={verifier.citationRecheck.found ? "text-green-600" : "text-red-600"}>
            {verifier.citationRecheck.found ? "✓ Quote verified" : "✗ Quote not found"}
            {" · "}
            {verifier.citationRecheck.notes}
          </p>
        </div>
      )}

      {verifier.reasons.length > 0 && (
        <ul className="space-y-1">
          {verifier.reasons.map((r, i) => (
            <li key={i} className="text-xs text-gray-600 flex gap-1">
              <span>·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StipendApp() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [budget, setBudget] = useState("5.00");
  const [bundle, setBundle] = useState<TaskBundle | null>(null);
  const [verifier, setVerifier] = useState<VerifierResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [verifying, setVerifying] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  const phaseLogRef = useRef<HTMLDivElement>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  // Auto-scroll phase log to bottom when new phases arrive
  useEffect(() => {
    if (phaseLogRef.current) {
      phaseLogRef.current.scrollTop = phaseLogRef.current.scrollHeight;
    }
  }, [bundle?.phases.length]);

  const withLoading = async (label: string, fn: () => Promise<void>) => {
    setLoading(true);
    setLoadingLabel(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  };

  const createTask = (event: FormEvent) => {
    event.preventDefault();
    void withLoading("Creating task…", async () => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget_usdc: Number(budget) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create task");
      setBundle(data);
      setVerifier(null);
    });
  };

  const fundTask = () => {
    if (!bundle) return;
    void withLoading("Funding escrow…", async () => {
      const res = await fetch(`/api/tasks/${bundle.task.id}/fund`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fund task");
      setBundle(data);

      stopStream();
      const source = new EventSource(`/api/tasks/${bundle.task.id}/stream`);
      streamRef.current = source;

      source.onmessage = (msg) => {
        const next = JSON.parse(msg.data) as TaskBundle;
        setBundle(next);
      };
      source.addEventListener("end", () => stopStream());
      source.onerror = () => stopStream();
    });
  };

  const runVerifier = () => {
    if (!bundle) return;
    setVerifying(true);
    void withLoading("Running adversarial verifier…", async () => {
      const res = await fetch("/api/verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bundle.task.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verifier failed");
      setVerifier(data.result);
      setBundle(data.task);
    }).finally(() => setVerifying(false));
  };

  const dispute = () => {
    if (!bundle) return;
    void withLoading("Filing dispute…", async () => {
      const res = await fetch("/api/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bundle.task.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to dispute");
      setBundle(data.task);
    });
  };

  const totalCost = bundle?.totalCostUSDC ?? "0.0000";
  const taskStatus = bundle?.task.status ?? "planning";
  const isRunning = taskStatus === "running";
  const isComplete = taskStatus === "complete";
  const isDisputed = taskStatus === "disputed";
  const canFund = !!bundle && taskStatus === "planning" && !loading;
  const canVerify = isComplete && !verifier && !verifying;
  const canDispute = !!bundle && !isDisputed && !loading;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Stipend</h1>
          <p className="text-sm text-gray-600 mt-0.5">Escrow-gated AI research on Stellar</p>
        </div>
        {bundle && (
          <div className="flex items-center gap-3">
            <Badge status={taskStatus} />
            {bundle.task.escrow_contract_id && (
              <a
                href={`${TW_VIEWER_BASE}/escrow/${bundle.task.escrow_contract_id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-blue-300 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
              >
                View on Escrow Viewer ↗
              </a>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Task input + controls */}
        <aside className="w-80 shrink-0 border-r bg-white flex flex-col overflow-y-auto">
          <form onSubmit={createTask} className="flex flex-col gap-4 p-6 border-b">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="query">
                Research question
              </label>
              <textarea
                id="query"
                className="w-full min-h-28 rounded-lg border border-gray-300 p-3 text-sm text-black resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading || isRunning}
                placeholder="Ask anything that requires real research…"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="budget">
                Budget (USDC)
              </label>
              <input
                id="budget"
                type="number"
                step="0.01"
                min="0.10"
                max="100"
                className="w-full text-black rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                disabled={loading || isRunning}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              disabled={loading || isRunning || !query.trim()}
            >
              {loading && loadingLabel === "Creating task…" ? "Creating…" : "Create Task"}
            </button>
          </form>

          {/* Action buttons */}
          {bundle && (
            <div className="flex flex-col gap-3 p-6 border-b">
              <button
                onClick={fundTask}
                disabled={!canFund}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {loading && loadingLabel === "Funding escrow…" ? "Funding…" : "Fund Escrow + Start Agent"}
              </button>

              <button
                onClick={runVerifier}
                disabled={!canVerify || loading}
                className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {verifying ? "Verifying…" : "Run Verifier"}
              </button>

              <button
                onClick={dispute}
                disabled={!canDispute || loading}
                className="w-full rounded-lg border-2 border-red-500 bg-white py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                {loading && loadingLabel === "Filing dispute…" ? "Disputing…" : "Dispute"}
              </button>
            </div>
          )}

          {/* Escrow state */}
          {bundle && (
            <div className="p-6 space-y-4 border-b">
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Escrow state</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Contract</dt>
                  <dd className="font-mono text-xs max-w-36 truncate text-right text-gray-900">
                    {bundle.task.escrow_contract_id || "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Budget</dt>
                  <dd className="font-semibold text-gray-900">{bundle.task.budget_usdc} USDC</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Milestone</dt>
                  <dd className={`font-semibold ${MILESTONE_COLORS[bundle.milestone.status] ?? "text-gray-900"}`}>
                    {bundle.milestone.status}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Spent</dt>
                  <dd className="font-mono font-semibold text-amber-700">{totalCost} USDC</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Cost ticker */}
          {bundle && bundle.toolCalls.length > 0 && (
            <div className="p-6 flex-1">
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-4">Cost ticker</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {bundle.toolCalls.map((call) => (
                  <div key={call.id} className="rounded border bg-white p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-gray-600 uppercase text-[10px] font-semibold">{call.kind}</span>
                      <span className={`text-[10px] font-semibold rounded px-2 py-1 ${call.settlement === "x402" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-700"}`}>
                        {call.settlement}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700 truncate max-w-28 font-medium">{call.provider}</span>
                      <span className="font-mono font-semibold text-amber-700">{call.amount_usdc}</span>
                    </div>
                    {call.tx_hash && (
                      <a
                        href={stellarTxLink(call.tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline block font-mono text-[10px]"
                      >
                        tx: {call.tx_hash.slice(0, TX_HASH_DISPLAY_LENGTH)}… ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Center panel: Live agent log */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b bg-white px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Live phase log</h2>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Agent running
              </span>
            )}
            {isComplete && !verifier && (
              <span className="text-xs text-green-600 font-medium">Agent complete — ready for verification</span>
            )}
          </div>

          <div ref={phaseLogRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {!bundle && (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <p className="text-4xl mb-3">🔬</p>
                <p className="text-base text-gray-700 font-medium">Create a task to start the research agent.</p>
                <p className="text-sm text-gray-600 mt-2">Funds lock in escrow. Agent works. Verifier gates release.</p>
              </div>
            )}

            {bundle && bundle.phases.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                {taskStatus === "planning" && (
                  <>
                    <p className="text-4xl mb-3">💰</p>
                    <p className="text-base text-gray-700 font-medium">Fund the escrow to start the agent.</p>
                  </>
                )}
                {isRunning && (
                  <>
                    <p className="text-4xl mb-3 animate-spin">⚙️</p>
                    <p className="text-base text-gray-700 font-medium">Agent is working…</p>
                  </>
                )}
              </div>
            )}

            {bundle?.phases.map((phase) => (
              <details key={phase.id} open className="group rounded-xl border bg-white shadow-sm overflow-hidden">
                <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors">
                  <span className="text-lg">{PHASE_ICONS[phase.kind] ?? "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{phase.kind}</span>
                    <p className="text-base font-semibold text-gray-900 truncate">{phase.title}</p>
                  </div>
                  <span className="text-gray-400 group-open:rotate-90 transition-transform text-xs">▶</span>
                </summary>

                <div className="border-t px-5 py-4 space-y-4">
                  <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{phase.content}</p>

                  {phase.citations.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Sources</p>
                      <ul className="space-y-1.5">
                        {phase.citations.map((url) => (
                          <li key={url}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-blue-600 hover:underline break-all"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs font-mono text-gray-400">
                    sha256: {phase.artifact_hash.slice(0, 20)}…
                  </p>
                </div>
              </details>
            ))}
          </div>

          {error && (
            <div className="border-t bg-red-50 px-6 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </main>

        {/* Right panel: Verifier output */}
        <aside className="w-72 shrink-0 border-l bg-white flex flex-col overflow-y-auto">
          <div className="border-b px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Verifier output</h2>
            <p className="text-xs text-gray-600 mt-1">Adversarial LLM judge</p>
          </div>

          <div className="flex-1 p-5">
            {verifier ? (
              <VerifierPanel verifier={verifier} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <p className="text-3xl mb-2">⚖️</p>
                <p className="text-xs">
                  {isComplete
                    ? "Click Run Verifier to evaluate the agent’s output."
                    : "Verifier runs after the agent completes."}
                </p>
              </div>
            )}
          </div>

          {/* Dispute + release info */}
          {verifier && (
            <div className="border-t p-5 space-y-2">
              {verifier.approved && bundle?.milestone.status === "released" && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-800">
                  <p className="font-semibold">✓ Funds released</p>
                  <p className="mt-0.5 text-green-600">
                    {bundle.task.budget_usdc} USDC transferred to agent wallet.
                  </p>
                  {bundle.task.escrow_contract_id && (
                    <a
                      href={`${TW_VIEWER_BASE}/escrow/${bundle.task.escrow_contract_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-blue-600 hover:underline"
                    >
                      View on Escrow Viewer ↗
                    </a>
                  )}
                </div>
              )}
              {!verifier.approved && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  <p className="font-semibold">✗ Verification failed</p>
                  <p className="mt-0.5 text-red-600">Funds remain in escrow. You can dispute to reclaim.</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

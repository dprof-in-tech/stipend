"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { TaskBundle, VerifierResult } from '@/lib/types';


// Sub-components
import { T } from './stipend/theme';
import { Header } from './stipend/header';
import { Card, Btn, MonoText } from './stipend/ui';
import { TaskBrief } from './stipend/task-brief';
import { MoneyFlow } from './stipend/money-flow';
import { PhaseTimeline } from './stipend/phase-timeline';
import { CostTicker } from './stipend/cost-ticker';

// Stages
import { FundStage } from './stipend/stages/fund-stage';
import { RunningStage } from './stipend/stages/running-stage';
import { CompleteStage } from './stipend/stages/complete-stage';
import { VerifierStage } from './stipend/stages/verifier-stage';
import { PendingReleaseStage } from './stipend/stages/pending-release-stage';
import { PhaseDetail } from './stipend/phase-detail';
import { generateResearchMarkdown, downloadFile, downloadReportPDF } from '@/lib/export/report';
import { IconSpin, IconX } from './stipend/icons';
import { TutorialModal } from './stipend/tutorial-modal';

// Export primitives for sub-components (if needed)
export { MonoText as Mono };

interface StipendAppProps {
  status: string;
  bundle: TaskBundle | null;
  verifier: VerifierResult | null;
  error: string | null;
  onCreateAndFund: (query: string, budget: string) => void;
  onRunVerifier: () => void;
  onDispute: () => void;
  onRelease: () => void;
  onNewTask: () => void;
  onRetry: () => void;
  onDisputeRetry: (feedback: string) => void;
  onDownloadReport: () => void;
  onDownloadPDF: () => void;
  loading: boolean;
  loadingLabel: string;
  verifying: boolean;
  onConnectWallet: () => void;
  clientPub: string | null;
  walletBalance: string;
}

function StipendApp({
  status,
  bundle,
  error,
  onCreateAndFund,
  onRunVerifier,
  onDispute,
  onRelease,
  onNewTask,
  onRetry,
  onDisputeRetry,
  onDownloadReport,
  onDownloadPDF,
  loading,
  loadingLabel,
  verifying,
  onConnectWallet,
  clientPub,
  walletBalance
}: StipendAppProps) {
  const [query, setQuery] = useState(bundle?.task.query ?? "");
  const [budget, setBudget] = useState(bundle?.task.budget_usdc ?? "");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  useEffect(() => {
    if (bundle) {
      setTimeout(() => {
        setQuery(bundle.task.query);
        setBudget(bundle.task.budget_usdc);
      }, 0);
    }
  }, [bundle]);

  const handleCreateAndFund = () => onCreateAndFund(query, budget);

  const task = bundle?.task;
  const phases = bundle?.phases ?? [];
  const toolCalls = bundle?.toolCalls ?? [];
  const totalSpent = bundle?.totalCostUSDC ?? "0.0000";

  return (
    <div style={{
      minHeight: '100vh', background: T.panel, color: T.ink,
      fontFamily: 'var(--geist-font-sans)',
      display: 'flex', flexDirection: 'column',
    }}>
      <Header
        status={status}
        taskId={task?.id ?? "—"}
        escrowId={task?.escrow_contract_id ?? ""}
        clientPub={clientPub}
        onConnectWallet={onConnectWallet}
        onNewTask={onNewTask}
      />

      {error && (
        <div style={{
          background: T.redSoft, border: `1px solid ${T.red}`, color: T.red,
          padding: '12px 28px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <IconX />
          <span>{error}</span>
        </div>
      )}

      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '360px 1fr',
        gap: 20, padding: '20px 28px', maxWidth: 1440, width: '100%', margin: '0 auto',
        alignItems: 'start',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TaskBrief
            task={task ?? { id: '—', query, budget_usdc: budget, status: 'planning', escrow_contract_id: '', created_at: '', client_address: '' }}
            editable={status === 'planning'}
            onQueryChange={setQuery}
            onBudgetChange={setBudget}
          />
          <MoneyFlow
            status={status}
            totalSpent={totalSpent}
            budget={task?.budget_usdc ?? budget}
            escrowId={task?.escrow_contract_id ?? "—"}
            walletBalance={walletBalance}
          />
          {phases.length > 0 && (
            <PhaseTimeline
              phases={phases}
              status={status}
              selectedId={selectedPhaseId}
              onSelect={(id) => setSelectedPhaseId(id === selectedPhaseId ? null : id)}
            />
          )}
        </div>

        {/* Right column */}
        <Card pad={0} style={{ overflow: 'hidden' }}>
          {selectedPhaseId ? (
            <PhaseDetail
              phase={phases.find(p => p.id === selectedPhaseId)}
              onClose={() => setSelectedPhaseId(null)}
            />
          ) : (
            <>
              {status === 'planning' && (
                <FundStage query={query} budget={budget} onCreateAndFund={handleCreateAndFund} loading={loading} loadingLabel={loadingLabel} />
              )}
              {status === 'funded' && (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <IconSpin />
                  <div style={{ marginTop: 12, color: T.ink2 }}>Escrow funded. Starting agent...</div>
                </div>
              )}
              {status === 'running' && <RunningStage phases={phases} />}
              {status === 'complete' && <CompleteStage onRunVerifier={onRunVerifier} verifying={verifying} />}
              {(status === 'failed' || status === 'error') && (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ color: T.red, marginBottom: 12 }}><IconX /></div>
                  <div style={{ fontSize: 20, fontWeight: 500 }}>Agent failed</div>
                  <div style={{ color: T.ink2, marginTop: 8, marginBottom: 24 }}>The task could not be completed. You can reclaim your funds below.</div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <Btn tone="danger" onClick={onDispute} disabled={loading}>{loading ? 'Working...' : 'Reclaim funds'}</Btn>
                    <Btn tone="secondary" onClick={onRetry} disabled={loading}>{loading ? 'Working...' : 'Retry Agent'}</Btn>
                  </div>
                </div>
              )}
              {status === 'pending_release' && bundle && (
                <PendingReleaseStage 
                  releaseAt={bundle.task.release_at || 0}
                  onAccept={onRelease}
                  onDisputeRetry={onDisputeRetry}
                  onDownload={onDownloadReport}
                  onDownloadPDF={onDownloadPDF}
                  loading={loading}
                />
              )}
              {(status === 'verified_approved' || status === 'verified_rejected' || status === 'released' || status === 'disputed' || status === 'refunded') && bundle && (
                <VerifierStage
                  verifier={bundle.milestone.verifier_score || {
                    approved: status === 'verified_approved',
                    scores: { interpretation: 0, coverage: 0, evidence: 0, reasoning: 0, citations: 0 },
                    averageScore: 0,
                    reasons: [],
                    fabricatedCitation: false
                  }}
                  status={status}
                  onDispute={onDispute}
                  onRelease={onRelease}
                  onRunVerifier={onRunVerifier}
                  onDownload={onDownloadReport}
                  onDownloadPDF={onDownloadPDF}
                  loading={loading}
                  verifying={verifying}
                  totalSpent={totalSpent}
                  budget={task?.budget_usdc ?? budget}
                />
              )}
            </>
          )}
        </Card>
      </div>

      {status !== 'planning' && (
        <CostTicker toolCalls={toolCalls} spent={totalSpent} budget={task?.budget_usdc ?? budget} />
      )}
    </div>
  );
}

export function StipendAppWrapper() {
  const [bundle, setBundle] = useState<TaskBundle | null>(null);
  const [verifier, setVerifier] = useState<VerifierResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [clientPub, setClientPub] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [showTutorial, setShowTutorial] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swkClassRef = useRef<any>(null);

  const fetchBalance = useCallback(async (address: string) => {
    try {
      const res = await fetch(`/api/stellar/balance?address=${address}`);
      const data = await res.json();
      if (data.balance) setWalletBalance(data.balance);
    } catch (e) {
      console.error("Failed to fetch balance:", e);
    }
  }, []);

  useEffect(() => {
    const seen = localStorage.getItem("stipend_tutorial_seen");
    if (!seen) setTimeout(() => setShowTutorial(true), 0);
    
    const initKit = async () => {
      try {
        const { StellarWalletsKit, Networks, KitEventType } = await import("@creit.tech/stellar-wallets-kit");
        const { defaultModules } = await import("@creit.tech/stellar-wallets-kit/modules/utils");
        
        StellarWalletsKit.init({
          network: Networks.TESTNET,
          modules: defaultModules(),
        });
        
        // Listen for disconnects (e.g. from the Profile Modal)
        StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
          setClientPub(null);
          localStorage.removeItem("stipend_wallet");
          setWalletBalance("0.0000");
        });

        swkClassRef.current = StellarWalletsKit;
        
        // Auto-reconnect if we have a saved wallet
        const saved = localStorage.getItem("stipend_wallet");
        if (saved) {
          try {
            const info = await StellarWalletsKit.getAddress();
            if (info && info.address) {
              setClientPub(info.address);
              fetchBalance(info.address);
            }
          } catch (err) {
            // silent
          }
        }
      } catch (e) {
        console.error("Kit init failed:", e);
      }
    };
    
    initKit();
  }, [fetchBalance]);

  const connectWallet = useCallback(async (reconnect: boolean | any = false) => {
    const isReconnect = reconnect === true;
    try {
      const Kit = swkClassRef.current;
      if (!Kit) return;
      
      if (isReconnect) {
        const info = await Kit.getAddress();
        if (info && info.address) {
          setClientPub(info.address);
          fetchBalance(info.address);
        }
        return;
      }
      
      if (clientPub) {
        // If already connected, show the profile modal which allows disconnecting
        await Kit.profileModal();
        return;
      }
      
      const { address } = await Kit.authModal();
      if (address) {
        setClientPub(address);
        localStorage.setItem("stipend_wallet", address);
        fetchBalance(address);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!reconnect) setError(`Wallet connect failed: ${msg}`);
    }
  }, [fetchBalance, clientPub]);

  // Remove the redundant second useEffect since we moved auto-reconnect logic inside initKit
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const handleNewTask = () => {
    stopStream();
    setBundle(null);
    setVerifier(null);
    setError(null);
  };

  const createAndFund = async (query: string, budget: string) => {
    setLoading(true);
    setLoadingLabel("Creating task...");
    setError(null);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, budget_usdc: Number(budget) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBundle(data);

      const taskId = data.task.id;

      const performOnChainStage = async () => {
        const Kit = swkClassRef.current;
        if (!clientPub || !Kit) throw new Error("Connect wallet to fund task");

        setLoadingLabel("Building transaction...");
        const buildRes = await fetch(`/api/tasks/${taskId}/fund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientPublicKey: clientPub, build: true }),
        });
        const buildData = await buildRes.json();
        if (!buildRes.ok) throw new Error(buildData.error);

        const { unsignedTransaction, type } = buildData;
        setLoadingLabel(type === "deploy" ? "Signing deployment..." : "Signing deposit...");
        
        const { signedTxXdr } = await Kit.signTransaction(unsignedTransaction, { 
          networkPassphrase: "Test SDF Network ; September 2015" 
        });
        if (!signedTxXdr) throw new Error("Signature failed");

        setLoadingLabel("Submitting to Stellar...");
        const submitRes = await fetch(`/api/tasks/${taskId}/fund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedXdr: signedTxXdr, clientPublicKey: clientPub }),
        });
        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData.error);

        if (type === "deploy") {
          // Successfully deployed! Now move to stage 2 (funding)
          setBundle(submitData);
          await performOnChainStage();
        } else {
          // Successfully funded!
          setBundle(submitData);
          fetchBalance(clientPub);
          
          const source = new EventSource(`/api/tasks/${taskId}/stream`);
          streamRef.current = source;
          source.onmessage = (msg) => {
            const next = JSON.parse(msg.data);
            setBundle(next);
            if (next.task.status === 'failed' || next.task.status === 'error') stopStream();
          };
        }
      };

      await performOnChainStage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const retryAgent = async () => {
    if (!bundle) return;
    setLoading(true);
    setLoadingLabel("Retrying agent...");
    try {
      const res = await fetch(`/api/tasks/${bundle.task.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBundle(data);

      const source = new EventSource(`/api/tasks/${data.task.id}/stream`);
      streamRef.current = source;
      source.onmessage = (msg) => {
        const next = JSON.parse(msg.data);
        setBundle(next);
        if (next.task.status === 'failed' || next.task.status === 'error') stopStream();
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const disputeRetry = async (feedback: string) => {
    if (!bundle) return;
    setLoading(true);
    setLoadingLabel("Submitting dispute...");
    try {
      const res = await fetch(`/api/tasks/${bundle.task.id}/dispute-retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBundle(data);
      
      const source = new EventSource(`/api/tasks/${data.task.id}/stream`);
      streamRef.current = source;
      source.onmessage = (msg) => {
        const next = JSON.parse(msg.data);
        setBundle(next);
        if (next.task.status === 'failed' || next.task.status === 'error') stopStream();
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = () => {
    if (!bundle) return;
    const md = generateResearchMarkdown(bundle);
    downloadFile(`research-report-${bundle.task.id.slice(0, 8)}.md`, md, 'text/markdown');
  };

  const handleDownloadPDF = async () => {
    if (!bundle) return;
    await downloadReportPDF(bundle);
  };

  const runVerifier = async () => {
    if (!bundle) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bundle.task.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVerifier(data.result);
      setBundle(data.task);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  const dispute = async () => {
    if (!bundle || !clientPub) return;
    setLoading(true);
    setLoadingLabel("Reclaiming funds...");
    try {
      const res = await fetch("/api/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: bundle.task.id, clientPublicKey: clientPub }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBundle(data.task);
      fetchBalance(clientPub);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const releaseFunds = async () => {
    if (!bundle) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${bundle.task.id}/release`, { method: "POST" });
      const data = await res.json();
      setBundle(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showTutorial && (
        <TutorialModal onClose={() => {
          localStorage.setItem("stipend_tutorial_seen", "true");
          setShowTutorial(false);
        }} />
      )}
      <StipendApp
        status={bundle?.task.status ?? 'planning'}
        bundle={bundle}
        verifier={verifier}
        error={error}
        onCreateAndFund={createAndFund}
        onRunVerifier={runVerifier}
        onDispute={dispute}
        onRelease={releaseFunds}
        onNewTask={handleNewTask}
        onRetry={retryAgent}
        onDisputeRetry={disputeRetry}
        onDownloadReport={handleDownloadReport}
        onDownloadPDF={handleDownloadPDF}
        loading={loading}
        loadingLabel={loadingLabel}
        verifying={verifying}
        onConnectWallet={connectWallet}
        clientPub={clientPub}
        walletBalance={walletBalance}
      />
    </>
  );
}

import { useState, useEffect } from "react";
import { T } from "../theme";
import { Btn } from "../ui";

interface Props {
  releaseAt: number;
  onAccept: () => void;
  onDisputeRetry: (feedback: string) => void;
  onDownload: () => void;
  onDownloadPDF: () => void;
  loading: boolean;
}

export function PendingReleaseStage({ releaseAt, onAccept, onDisputeRetry, onDownload, onDownloadPDF, loading }: Props) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const updateTime = () => setTimeLeft(Math.max(0, Math.floor((releaseAt - Date.now()) / 1000)));
    updateTime(); // Initial update
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [releaseAt]);

  if (showFeedback) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 8 }}>Dispute & Refine</div>
        <div style={{ color: T.ink2, marginBottom: 20, fontSize: 14 }}>
          Tell the agent what was wrong or missing. It will retry the task with this context.
        </div>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. You missed the sales data for 2024..."
          style={{
            width: '100%', minHeight: 120, padding: 12, borderRadius: 8,
            background: T.panel, border: `1px solid ${T.hair}`, color: T.ink,
            fontFamily: 'inherit', fontSize: 14, marginBottom: 20, outline: 'none'
          }}
        />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Btn tone="secondary" onClick={() => setShowFeedback(false)} disabled={loading}>Back</Btn>
          <Btn tone="danger" onClick={() => onDisputeRetry(feedback)} disabled={loading || !feedback.trim()}>
            {loading ? 'Starting retry...' : 'Retry with Feedback'}
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div style={{ color: T.emerald, marginBottom: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <div style={{ fontSize: 20, fontWeight: 500 }}>Verification Successful!</div>
      <div style={{ color: T.ink2, marginTop: 8, marginBottom: 24, fontSize: 14, maxWidth: 400, margin: '8px auto 24px' }}>
        The agent&apos;s work has been verified. Funds will be released automatically in:
      </div>

      <div style={{ fontSize: 48, fontWeight: 700, color: T.ink, marginBottom: 32, fontVariantNumeric: 'tabular-nums' }}>
        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Btn tone="primary" onClick={onAccept} disabled={loading}>
          {loading ? 'Releasing...' : 'Accept & Release Now'}
        </Btn>
        <Btn tone="secondary" onClick={() => setShowFeedback(true)} disabled={loading}>
          Dispute & Retry
        </Btn>
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${T.hairSoft}`, display: 'flex', justifyContent: 'center', gap: 12 }}>
        <Btn tone="ghost" onClick={onDownload}>Download .MD</Btn>
        <Btn tone="ghost" onClick={onDownloadPDF}>Download PDF</Btn>
      </div>
    </div>
  );
}

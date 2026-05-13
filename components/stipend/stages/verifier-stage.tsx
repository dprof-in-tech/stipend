import { VerifierResult } from "@/lib/types";
import { T } from "../theme";
import { SectionLabel, Pill, MonoText, StageHeader, Btn, ScoreRow } from "../ui";
import { IconCheck, IconX, IconLock, IconBolt, IconSpin } from "../icons";

export function VerifierStage({ 
  verifier, 
  onDispute, 
  onRelease, 
  onRunVerifier, 
  onDownload,
  onDownloadPDF,
  status, 
  loading, 
  verifying, 
  totalSpent, 
  budget 
}: { 
  verifier: VerifierResult, 
  onDispute: () => void, 
  onRelease: () => void, 
  onRunVerifier: () => void, 
  onDownload: () => void,
  onDownloadPDF: () => void,
  status: string, 
  loading: boolean, 
  verifying: boolean, 
  totalSpent: string, 
  budget: string 
}) {
  const approved = verifier.approved;
  const released = status === 'released';
  const refunded = status === 'refunded';

  if (released || refunded) {
    return (
      <div style={{ animation: 'fadein 0.4s ease-out' }}>
        <StageHeader
          eyebrow="Settlement Finalized"
          title={released ? "Funds released to agent." : "100% Funds reclaimed successfully."}
          right={<Pill tone={released ? "emerald" : "amber"} icon={<IconCheck/>}>Settled</Pill>}
        />
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ 
            width: 72, height: 72, borderRadius: 36, background: released ? T.emeraldSoft : T.amberSoft, 
            color: released ? T.emerald : T.amber,
            display: 'grid', placeItems: 'center', margin: '0 auto 24px',
            border: `1px solid ${released ? T.emerald : T.amber}`
          }}>
            {released ? <IconCheck/> : <IconLock/>}
          </div>
          <div style={{ fontSize: 26, fontWeight: 500, color: T.ink, letterSpacing: -0.8, marginBottom: 12 }}>
            Escrow resolution complete
          </div>
          <div style={{ fontSize: 16, color: T.ink2, lineHeight: 1.6, maxWidth: 420, margin: '0 auto 32px' }}>
            {released 
              ? (verifier.averageScore >= 3.5 
                  ? `The research met the quality threshold and ${budget} USDC has been released to the agent.`
                  : `The research was helpful but flawed (Score: ${verifier.averageScore}). A 50/50 split has been processed: ${(parseFloat(budget)*0.5).toFixed(2)} USDC returned to you, and remainder to the agent.`)
              : `A full refund of ${budget} USDC has been returned to your wallet. The agent's bond covered the ${totalSpent} USDC in tool costs.`
            }
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Btn tone="secondary" onClick={onDownload}>Download .MD</Btn>
            <Btn tone="primary" onClick={onDownloadPDF}>Download PDF</Btn>
            <Btn tone="ghost" onClick={() => window.location.reload()} icon={<IconSpin/>}>New Research Task</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StageHeader
        eyebrow="Adversarial verifier · Claude Haiku"
        title={approved ? "The agent's work passes review." : "The agent's work falls short."}
        right={
          <div style={{ textAlign: 'right' }}>
            <MonoText style={{ fontSize: 32, fontWeight: 500, color: approved ? T.emerald : T.red, letterSpacing: -1 }}>
              {verifier.averageScore.toFixed(1)}
            </MonoText>
            <div style={{ fontSize: 11, color: T.mute, fontFamily: 'var(--geist-font-mono)' }}>/ 5.0 average</div>
          </div>
        }
      />
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          {Object.entries(verifier.scores).map(([k, v]) => (
            <ScoreRow key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} score={v as number} threshold={3.0}/>
          ))}
        </div>

        {verifier.rationale && <div style={{ marginBottom: 22 }}>
          <SectionLabel>Rationale</SectionLabel>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink2, fontStyle: 'italic',
                        paddingLeft: 14, borderLeft: `2px solid ${approved ? T.emerald : T.red}` }}>
            &quot;{verifier.rationale}&quot;
          </div>
        </div>}

        {verifier.citationRecheck && (
          <div style={{ marginBottom: 22 }}>
            <SectionLabel>Citation re-check</SectionLabel>
            <div style={{ padding: 14, background: T.panel, borderRadius: 10, border: `1px solid ${T.hairSoft}`,
                          display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ color: verifier.citationRecheck.found ? T.emerald : T.red, marginTop: 1 }}>
                {verifier.citationRecheck.found ? <IconCheck/> : <IconX/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MonoText style={{ fontSize: 12, color: T.ink2, display: 'block',
                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {verifier.citationRecheck.url}
                </MonoText>
                <div style={{ fontSize: 13, color: T.ink2, marginTop: 6 }}>
                  {verifier.citationRecheck.notes}
                </div>
              </div>
            </div>
          </div>
        )}

        {approved ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn tone="emerald" size="lg" icon={loading ? <IconSpin/> : <IconBolt/>} onClick={onRelease} disabled={loading} full>Release funds to agent</Btn>
            <Btn tone="danger" size="lg" onClick={onDispute} disabled={loading}>{loading ? 'Working…' : 'Dispute'}</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn tone="primary" size="lg" onClick={onRunVerifier} disabled={verifying} icon={verifying ? <IconSpin/> : <IconBolt/>}>{verifying ? 'Running verifier…' : 'Retry verifier'}</Btn>
            <Btn tone="danger" size="lg" onClick={onDispute} disabled={loading} full>{loading ? 'Working…' : 'Dispute & 100% Refund'}</Btn>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${T.hairSoft}`, display: 'flex', justifyContent: 'center', gap: 12 }}>
          <Btn tone="ghost" onClick={onDownload}>Download .MD</Btn>
          <Btn tone="ghost" onClick={onDownloadPDF}>Download PDF</Btn>
        </div>
      </div>
    </div>
  );
}

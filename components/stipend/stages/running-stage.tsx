import { Phase } from "@/lib/types";
import { T } from "../theme";
import { Pill, MonoText, StageHeader, SectionLabel } from "../ui";
import { IconSpin, IconLink } from "../icons";

function PhaseDetail({ phase, idx, of }: { phase: Phase | undefined, idx: number, of: number }) {
  if (!phase) {
    return (
      <div>
        <StageHeader
          eyebrow={`Phase ${idx+1} / ${of}`}
          title="Loading phase details..."
        />
        <div style={{ padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <IconSpin/>
            <span style={{ fontSize: 14, color: T.ink2 }}>Waiting for phase output...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <StageHeader
        eyebrow={`Phase ${idx+1} / ${of} · ${phase.kind}`}
        title={phase.title}
        right={<Pill tone="outline"><MonoText style={{ fontSize: 10 }}>{phase.artifact_hash.slice(0, 12)}…</MonoText></Pill>}
      />
      <div style={{ padding: '20px 24px' }}>
        <div style={{
          fontSize: 15, lineHeight: 1.55, color: T.ink2,
          fontFamily: 'var(--geist-font-sans)',
        }}>
          {phase.content}
        </div>
        {phase.citations.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${T.hairSoft}` }}>
            <SectionLabel>Sources fetched ({phase.citations.length})</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {phase.citations.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                   style={{
                     display: 'flex', alignItems: 'center', gap: 10,
                     padding: '10px 14px', background: T.panel, borderRadius: 8,
                     textDecoration: 'none', color: T.ink, fontSize: 13,
                     border: `1px solid ${T.hairSoft}`,
                   }}>
                  <IconLink/>
                  <MonoText style={{ fontSize: 12, color: T.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</MonoText>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function RunningStage({ phases }: { phases: Phase[] }) {
  if (!phases || phases.length === 0) {
    return (
      <div>
        <StageHeader
          eyebrow="Agent running"
          title="Processing your request..."
        />
        <div style={{ padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <IconSpin/>
            <span style={{ fontSize: 14, color: T.ink2 }}>Executing phases...</span>
          </div>
          <div style={{ fontSize: 13, color: T.mute, lineHeight: 1.6 }}>
            The agent is working through your research task. Phases will appear here as they complete.
          </div>
        </div>
      </div>
    );
  }
  const latest = phases[phases.length - 1];
  return <PhaseDetail phase={latest} idx={phases.length - 1} of={phases.length}/>;
}

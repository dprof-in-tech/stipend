import { Phase } from "@/lib/types";
import { T } from "./theme";
import { SectionLabel, MonoText } from "./ui";
import { IconX } from "./icons";

export function PhaseDetail({ phase, onClose }: { phase?: Phase, onClose: () => void }) {
  if (!phase) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: '24px 32px', borderBottom: `1px solid ${T.hairSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <SectionLabel>{phase.kind} Phase</SectionLabel>
          <div style={{ fontSize: 24, fontWeight: 600, color: T.ink, marginTop: 4 }}>
            {phase.title}
          </div>
        </div>
        <button 
          onClick={onClose}
          style={{ 
            width: 32, height: 32, borderRadius: 16, border: 'none',
            background: T.panel, color: T.ink2, cursor: 'pointer',
            display: 'grid', placeItems: 'center'
          }}
        >
          <IconX />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
        <div style={{ 
          fontSize: 16, lineHeight: 1.6, color: T.ink, whiteSpace: 'pre-wrap',
          maxWidth: '800px'
        }}>
          {phase.content}
        </div>

        {phase.citations && phase.citations.length > 0 && (
          <div style={{ marginTop: 40, paddingTop: 32, borderTop: `1px solid ${T.hairSoft}` }}>
            <SectionLabel>Sources Fetched</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {phase.citations.map((url, i) => (
                <a 
                  key={i} 
                  href={url} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ 
                    display: 'flex', gap: 12, alignItems: 'center',
                    padding: '12px 16px', background: T.panel, borderRadius: 8,
                    textDecoration: 'none', border: `1px solid ${T.hairSoft}`
                  }}
                >
                  <MonoText style={{ color: T.mute, fontSize: 11 }}>[{i + 1}]</MonoText>
                  <div style={{ 
                    fontSize: 13, color: T.ink2, overflow: 'hidden', 
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {url}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

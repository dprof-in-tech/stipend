import { Phase } from "@/lib/types";
import { T } from "./theme";
import { Card, SectionLabel, Pill, MonoText } from "./ui";
import { IconSpin, IconCheck, PHASE_GLYPHS } from "./icons";

export function PhaseTimeline({ 
  phases, 
  status, 
  selectedId, 
  onSelect 
}: { 
  phases: Phase[], 
  status: string,
  selectedId?: string | null,
  onSelect?: (id: string) => void
}) {
  const isRunning = status === 'running';
  return (
    <Card pad={0}>
      <div style={{ padding: '16px 20px 8px' }}>
        <SectionLabel right={
          isRunning ? <Pill tone="amber" icon={<IconSpin/>}>Streaming</Pill>
                    : <Pill tone="emerald" icon={false}><IconCheck/></Pill>
        }>Phases</SectionLabel>
      </div>
      <div style={{ padding: '0 20px 16px', position: 'relative' }}>
        {phases.map((p, i) => {
          const isLast = i === phases.length - 1;
          const active = isRunning && isLast;
          const isSelected = selectedId === p.id;

          return (
            <div 
              key={p.id} 
              onClick={() => onSelect?.(p.id)}
              style={{ 
                display: 'flex', gap: 14, position: 'relative', 
                paddingBottom: isLast ? 0 : 18,
                cursor: onSelect ? 'pointer' : 'default',
                opacity: selectedId && !isSelected ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {!isLast && <div style={{
                position: 'absolute', left: 11, top: 26, bottom: 0, width: 1.5,
                background: isSelected ? T.ink : T.hair,
              }}/>}
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                background: isSelected ? T.ink : (active ? T.amberSoft : T.ink), 
                color: isSelected ? '#fff' : (active ? T.amber : '#fff'),
                border: active && !isSelected ? `1.5px solid ${T.amber}` : 'none',
                display: 'grid', placeItems: 'center',
                fontSize: 12, flexShrink: 0,
                fontFamily: 'var(--geist-font-mono)',
                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 0.2s ease',
                zIndex: 2,
              }}>
                {active && !isSelected ? <IconSpin/> : PHASE_GLYPHS[p.kind] || '·'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <MonoText style={{ 
                    fontSize: 10, color: isSelected ? T.ink : T.mute, 
                    letterSpacing: 1.2, textTransform: 'uppercase',
                    fontWeight: isSelected ? 600 : 400
                  }}>
                    {String(i+1).padStart(2,'0')} · {p.kind}
                  </MonoText>
                  {p.duration_ms && (
                    <MonoText style={{ fontSize: 10, color: T.mute, marginLeft: 'auto' }}>
                      {(p.duration_ms / 1000).toFixed(1)}s
                    </MonoText>
                  )}
                </div>
                <div style={{ 
                  fontSize: 14, fontWeight: isSelected ? 600 : 500, 
                  color: isSelected ? T.ink : T.ink, 
                  marginTop: 2, letterSpacing: -0.1 
                }}>
                  {p.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

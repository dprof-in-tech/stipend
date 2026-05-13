import { useMemo, useState } from "react";
import { ToolCall } from "@/lib/types";
import { T } from "./theme";
import { MonoText } from "./ui";

export function CostTicker({ toolCalls, spent, budget }: { toolCalls: ToolCall[], spent: string, budget: string }) {
  const [isPaused, setIsPaused] = useState(false);
  const calls = useMemo(() => [...toolCalls].reverse(), [toolCalls]);
  const pct = (parseFloat(spent) / parseFloat(budget)) * 100;
  return (
    <div style={{
      borderTop: `1px solid ${T.hair}`, background: T.surface,
      display: 'flex', alignItems: 'stretch', height: 56,
    }}>
      <div style={{
        flexShrink: 0, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14,
        borderRight: `1px solid ${T.hair}`, minWidth: 260,
      }}>
        <MonoText style={{ fontSize: 10, color: T.mute, letterSpacing: 1.4, textTransform: 'uppercase' }}>spent</MonoText>
        <MonoText style={{ fontSize: 18, fontWeight: 500, color: T.amber, letterSpacing: -0.3 }}>
          {spent}
        </MonoText>
        <span style={{ fontSize: 11, color: T.mute }}>/ {budget} USDC</span>
        <div style={{ flex: 1, height: 4, background: T.panel, borderRadius: 2, overflow: 'hidden', marginLeft: 6 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: T.amber }}/>
        </div>
      </div>

      <div 
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: 'default' }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div style={{
          display: 'flex', alignItems: 'center', height: '100%', gap: 18, padding: '0 20px',
          animation: 'ticker 32s linear infinite', 
          animationPlayState: isPaused ? 'paused' : 'running',
          width: 'max-content',
        }}>
          {[...calls, ...calls].map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
              <MonoText style={{
                fontSize: 10, padding: '3px 7px', borderRadius: 4,
                background: c.settlement === 'x402' ? T.violetSoft : T.panel,
                color: c.settlement === 'x402' ? T.violet : T.ink2,
                textTransform: 'uppercase', letterSpacing: 0.8,
              }}>
                {c.settlement}
              </MonoText>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{c.provider}</span>
              <MonoText style={{ fontSize: 11, color: T.mute }}>{c.kind}</MonoText>
              <MonoText style={{ fontSize: 13, color: T.amber, fontWeight: 500 }}>−{c.amount_usdc}</MonoText>
              {c.tx_hash && <MonoText style={{ fontSize: 10, color: T.mute }}>{c.tx_hash.slice(0, 8)}…</MonoText>}
              <span style={{ color: T.hair }}>·</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 40,
                      background: `linear-gradient(90deg, ${T.surface}, transparent)`, pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 40,
                      background: `linear-gradient(270deg, ${T.surface}, transparent)`, pointerEvents: 'none' }}/>
      </div>
    </div>
  );
}

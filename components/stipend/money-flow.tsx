import { T } from "./theme";
import { Card, SectionLabel, MonoText } from "./ui";

export function MoneyFlow({ status, totalSpent, budget, escrowId, walletBalance }: { 
  status: string, 
  totalSpent: string, 
  budget: string, 
  escrowId: string, 
  walletBalance: string 
}) {
  // Stages: wallet → escrow → agent → verifier → release
  const isReleased = status === 'released';
  const isDisputed = status === 'disputed';
  
  const flow = [
    { key: 'wallet',   label: 'Wallet',   sub: `${walletBalance} USDC` },
    { key: 'escrow',   label: 'Escrow',   sub: isReleased ? '0.0000 locked' : `${budget} locked` },
    { key: 'agent',    label: 'Agent',    sub: `${totalSpent} spent` },
    { key: 'verifier', label: 'Verifier', sub: 'Judge' },
    { key: 'release',  label: 'Release',  sub: isReleased ? (isDisputed ? 'reclaimed' : 'to agent') : (isDisputed ? 'disputed' : 'pending') },
  ];

  const activeIdx = {
    planning: 1, funded: 1, running: 2, complete: 3,
    verified_approved: 4, verified_rejected: 3, disputed: 4, released: 4,
    failed: 1, error: 1,
  }[status] ?? 1;

  const doneIdx = {
    planning: 0, funded: 1, running: 1, complete: 2,
    verified_approved: 3, verified_rejected: 3, disputed: 3, released: 4,
    failed: 0, error: 0,
  }[status] ?? 0;

  return (
    <Card pad={18}>
      <SectionLabel right={
        <MonoText style={{ fontSize: 10, color: T.mute }}>
          escrow {escrowId.slice(0, 6)}…{escrowId.slice(-4)}
        </MonoText>
      }>Money flow</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
        {flow.map((s, i) => {
          const done = i <= doneIdx;
          const active = i === activeIdx;
          const isLast = i === flow.length - 1;
          return (
            <div key={s.key} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: isLast ? 0 : 12 }}>
              {!isLast && <div style={{
                position: 'absolute', left: 10, top: 22, bottom: 0, width: 1.5,
                background: i < doneIdx ? T.ink : T.hair,
              }}/>}
              <div style={{
                width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                background: done ? T.ink : T.surface,
                border: `1.5px solid ${active ? T.blue : done ? T.ink : T.hair}`,
                display: 'grid', placeItems: 'center',
                color: done ? '#fff' : T.mute,
                fontSize: 10, fontFamily: 'var(--geist-font-mono)',
                boxShadow: active ? `0 0 0 3px ${T.blueSoft}` : 'none',
                transition: 'all 0.2s',
              }}>
                {done && i < doneIdx ? '✓' : i + 1}
              </div>
              <div style={{ lineHeight: 1.2, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: 1, gap: 12, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: done ? T.ink : T.mute }}>{s.label}</div>
                <MonoText style={{ fontSize: 11, color: active ? T.blue : T.mute }}>{s.sub}</MonoText>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

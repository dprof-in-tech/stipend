
import Link from "next/link";
import { T } from "./theme";
import { Btn, MonoText, Pill } from "./ui";
import { IconLink } from "./icons";
import Image from "next/image";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Image src="/logo.svg" alt="Logo" width={size} height={size} />
      <span style={{ fontFamily: 'var(--geist-font-sans)', fontWeight: 600, fontSize: 18, letterSpacing: -0.4, color: T.ink }}>
        Stipend
      </span>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: 'neutral' | 'blue' | 'amber' | 'emerald' | 'red' | 'outline', label: string }> = {
    planning: { tone: 'neutral', label: 'Planning' },
    funded: { tone: 'blue', label: 'Funded · awaiting agent' },
    running: { tone: 'amber', label: 'Agent running' },
    complete: { tone: 'blue', label: 'Awaiting verifier' },
    verified_approved: { tone: 'emerald', label: 'Verified · Approved' },
    verified_rejected: { tone: 'red', label: 'Verified · Failed' },
    disputed: { tone: 'red', label: 'Disputed' },
    released: { tone: 'emerald', label: 'Funds released' },
    refunded: { tone: 'amber', label: 'Funds reclaimed' },
    failed: { tone: 'red', label: 'Agent failed' },
    error: { tone: 'red', label: 'Error' },
  };
  const c = map[status];
  if (!c) return null;
  return <Pill tone={c.tone} size="lg">{c.label}</Pill>;
}

export function Header({
  status,
  taskId,
  escrowId,
  clientPub,
  onConnectWallet,
  onNewTask
}: {
  status: string,
  taskId: string,
  escrowId: string,
  clientPub: string | null,
  onConnectWallet: () => void,
  onNewTask?: () => void
}) {
  return (
    <header style={{
      height: 60, padding: '0 28px', borderBottom: `1px solid ${T.hair}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: T.surface, position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div onClick={onNewTask} style={{ cursor: 'pointer' }}>
          <Logo />
        </div>
        <div style={{ width: 1, height: 24, background: T.hair }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MonoText style={{ fontSize: 11, color: T.mute, textTransform: 'uppercase', letterSpacing: 0.5 }}>{taskId}</MonoText>
          <StatusPill status={status} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {onNewTask && (
          <Btn tone="secondary" size="sm" onClick={onNewTask}>New Task</Btn>
        )}
        {escrowId ? (
          <Link href={`https://viewer.trustlesswork.com/${escrowId}`} target="_blank" style={{ textDecoration: 'none' }}>
            <Btn tone="secondary" size="sm" icon={<IconLink />}>Escrow Viewer</Btn>
          </Link>
        ) : (
          <Btn tone="ghost" size="sm" icon={<IconLink />} disabled>Escrow Viewer</Btn>
        )}
        <Btn tone={clientPub ? 'secondary' : 'primary'} size="sm" onClick={onConnectWallet}>
          {clientPub ? `${clientPub.slice(0, 4)}…${clientPub.slice(-4)}` : 'Connect Wallet'}
        </Btn>
      </div>
    </header>
  );
}

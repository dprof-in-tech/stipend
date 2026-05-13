import { ReactNode } from "react";
import { T } from "./theme";

// I'll define Mono here instead
export function MonoText({ children, style }: { children: ReactNode, style?: React.CSSProperties }) {
  return <span style={{ fontFamily: 'var(--geist-font-mono)', ...style }}>{children}</span>;
}

export function Card({ children, pad = 24, tint = T.surface, style = {} }: { children: ReactNode, pad?: number, tint?: string, style?: React.CSSProperties }) {
  return (
    <div style={{
      background: tint,
      border: `1.5px solid ${T.hair}`,
      borderRadius: 16,
      padding: pad,
      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      ...style
    }}>
      {children}
    </div>
  );
}

export function Btn({ children, onClick, tone = 'primary', size = 'md', icon, disabled, full, style }: {
  children: ReactNode, onClick?: () => void, tone?: 'primary' | 'secondary' | 'danger' | 'emerald' | 'blue' | 'ghost',
  size?: 'sm' | 'md' | 'lg', icon?: ReactNode, disabled?: boolean, full?: boolean, style?: React.CSSProperties
}) {
  const bg = {
    primary: T.ink,
    secondary: T.surface,
    danger: T.red,
    emerald: T.emerald,
    blue: T.blue,
    ghost: 'transparent',
  }[tone];

  const color = {
    primary: '#fff',
    secondary: T.ink,
    danger: '#fff',
    emerald: '#fff',
    blue: '#fff',
    ghost: T.ink2,
  }[tone];

  const border = tone === 'secondary' ? `1.5px solid ${T.hair}` : 'none';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: bg, color, border, borderRadius: 10,
        padding: size === 'lg' ? '0 24px' : '0 16px',
        height: size === 'lg' ? 48 : size === 'sm' ? 32 : 40,
        fontSize: size === 'lg' ? 15 : 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: full ? '100%' : 'auto',
        transition: 'all 0.2s',
        ...style
      }}
    >
      {icon}
      {children}
    </button>
  );
}

export function Pill({ children, tone = 'neutral', size = 'md', icon }: { children: ReactNode, tone?: 'neutral' | 'blue' | 'amber' | 'emerald' | 'red' | 'outline', size?: 'sm' | 'md' | 'lg', icon?: ReactNode }) {
  const colors = {
    neutral: { bg: T.hairSoft, text: T.mute },
    blue:    { bg: T.blueSoft, text: T.blue },
    amber:   { bg: T.amberSoft, text: T.amber },
    emerald: { bg: T.emeraldSoft, text: T.emerald },
    red:     { bg: T.redSoft, text: T.red },
    outline: { bg: 'transparent', text: T.mute, border: `1px solid ${T.hair}` },
  }[tone] as { bg: string, text: string, border?: string };

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: colors.bg, color: colors.text,
      border: colors.border || 'none',
      padding: size === 'lg' ? '6px 14px' : '3px 10px',
      borderRadius: 100,
      fontSize: size === 'lg' ? 13 : 11, fontWeight: 600,
      fontFamily: 'var(--geist-font-sans)',
    }}>
      {icon}
      {children}
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode, right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <MonoText style={{ fontSize: 10, color: T.mute, letterSpacing: 1.2, textTransform: 'uppercase' }}>{children}</MonoText>
      {right}
    </div>
  );
}

export function StageHeader({ title, eyebrow, right }: { title: string, eyebrow: string, right?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 16, padding: '20px 24px', borderBottom: `1px solid ${T.hair}`,
    }}>
      <div>
        <MonoText style={{ fontSize: 11, color: T.mute, letterSpacing: 1.4, textTransform: 'uppercase' }}>{eyebrow}</MonoText>
        <div style={{ fontSize: 22, fontWeight: 500, color: T.ink, letterSpacing: -0.4, marginTop: 4 }}>
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}

export function ScoreRow({ label, score, threshold }: { label: string, score: number, threshold: number }) {
  const pct = (score / 5.0) * 100;
  const thresholdPct = (threshold / 5.0) * 100;
  const passing = score >= threshold;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.ink2 }}>{label}</div>
        <MonoText style={{ fontSize: 13, fontWeight: 500, color: passing ? T.emerald : T.red }}>{score.toFixed(1)}</MonoText>
      </div>
      <div style={{ height: 6, background: T.panel, borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
                      background: passing ? T.emerald : T.red, borderRadius: 3 }}/>
        <div title={`Threshold ${threshold}`} style={{
          position: 'absolute', left: `${thresholdPct}%`, top: -3, bottom: -3, width: 1.5,
          background: T.ink, opacity: 0.4,
        }}/>
      </div>
    </div>
  );
}

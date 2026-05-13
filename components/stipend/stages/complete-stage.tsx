import { T } from "../theme";
import { Card, Pill, StageHeader, Btn } from "../ui";
import { IconCheck, IconBolt, IconSpin } from "../icons";

export function CompleteStage({ onRunVerifier, verifying }: { onRunVerifier: () => void, verifying: boolean }) {
  return (
    <div style={{ animation: 'fadein 0.3s ease-out' }}>
      <StageHeader
        eyebrow="Agent complete"
        title="Analysis finished. Ready for review."
        right={<Pill tone="emerald" icon={<IconCheck/>}>Research ready</Pill>}
      />
      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          The research agent has synthesized its findings across all phases. Funds remain locked in escrow until you approve the result or the verifier confirms quality.
        </div>

        <Card tint={T.panel} pad={20} style={{ borderColor: T.hairSoft, marginBottom: 24, borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: T.blue }}>
            <IconBolt/>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>Final Verification Step</span>
          </div>
          <div style={{ fontSize: 13, color: T.mute, marginTop: 8, lineHeight: 1.5 }}>
            Run the automated verifier to check for citation accuracy and reasoning depth. If the score is ≥ 3.0, the task will be marked as complete.
          </div>
        </Card>

        <Btn tone="primary" size="lg" full onClick={onRunVerifier} icon={verifying ? <IconSpin/> : <IconBolt/>} disabled={verifying}>
          {verifying ? 'Running adversarial verifier…' : 'Run adversarial verifier'}
        </Btn>
      </div>
    </div>
  );
}

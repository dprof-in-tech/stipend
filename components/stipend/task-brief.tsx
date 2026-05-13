import { Task } from "@/lib/types";
import { T } from "./theme";
import { Card, SectionLabel, MonoText } from "./ui";

export function TaskBrief({ task, editable, onQueryChange, onBudgetChange }: {
  task: Task,
  editable?: boolean,
  onQueryChange: (value: string) => void,
  onBudgetChange: (value: string) => void
}) {
  return (
    <Card pad={20}>
      <SectionLabel>The brief</SectionLabel>
      {editable ? (
        <textarea
          value={task.query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="what is the best movie of 2019?"
          style={{
            fontFamily: 'var(--geist-font-sans)', fontSize: 17, fontWeight: 500,
            color: T.ink, letterSpacing: -0.2, lineHeight: 1.4,
            width: '100%', height: 150, border: '1px solid black', borderRadius: 15, background: 'transparent', resize: 'none', padding: 12
          }}
        />
      ) : (
        <div style={{
          fontFamily: 'var(--geist-font-sans)', fontSize: 17, fontWeight: 500,
          color: T.ink, letterSpacing: -0.2, lineHeight: 1.4,
        }}>
          {task.query}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginTop: 8, paddingTop: 14, borderTop: `1px solid ${T.hairSoft}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {editable ? (
            <input
              type="text"
              value={task.budget_usdc}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*\.?\d*$/.test(val)) {
                  onBudgetChange(val);
                }
              }}
              placeholder="5.0"
              style={{
                fontFamily: 'var(--geist-font-mono)', fontSize: 22, fontWeight: 500, padding: 2,
                color: T.ink, letterSpacing: -0.4, background: 'transparent',
                width: '80px', height: 32, border: '1px solid black', borderRadius: 6,
              }}
            />
          ) : (
            <MonoText style={{ fontSize: 22, fontWeight: 500, color: T.ink, letterSpacing: -0.4 }}>{task.budget_usdc}</MonoText>
          )}
          <MonoText style={{ fontSize: 12, color: T.mute }}>USDC budget</MonoText>
        </div>
      </div>
    </Card>
  );
}

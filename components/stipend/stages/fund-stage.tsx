import { T } from "../theme";
import { Card, StageHeader, Btn } from "../ui";
import { IconLock, IconSpin } from "../icons";

export function FundStage({ query, budget, onCreateAndFund, loading, loadingLabel }: { 
  query: string, 
  budget: string, 
  onCreateAndFund: () => void, 
  loading: boolean, 
  loadingLabel: string 
}) {
  const canFund = (Number.isFinite(parseFloat(budget)) && parseFloat(budget) > 0 && query.trim().length > 0);

  return (
    <div>
      <StageHeader
        eyebrow="Step 1 of 4"
        title="Lock the budget. Then the agent works."
      />
      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.6, marginBottom: 20 }}>
          The research agent requires an upfront budget to cover search micropayments and reasoning costs. These funds are held in a trustless escrow contract.
        </div>
        <Card pad={16} tint={T.panel} style={{ borderColor: T.hairSoft }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ color: T.blue, marginTop: 2 }}><IconLock/></div>
            <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>
              Funds are escrowed in a Soroban contract on Stellar. The agent draws from this budget for each tool call (search, fetch, LLM). Anything unspent is refunded if you dispute.
            </div>
          </div>
        </Card>
        <Btn tone="blue" size="lg" full onClick={onCreateAndFund} icon={loading ? <IconSpin/> : <IconLock/>} style={{ marginTop: 18 }} disabled={!canFund || loading}>
          {loading ? (loadingLabel || 'Funding and starting…') : `Fund ${budget || '0.00'} USDC and start the agent`}
        </Btn>
      </div>
    </div>
  );
}

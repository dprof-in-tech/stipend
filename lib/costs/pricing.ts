/**
 * Granular pricing for LLM token usage (USDC per 1M tokens)
 */
export const MODEL_RATES = {
  "anthropic/claude-3-5-sonnet-latest": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-5-haiku-20241022": { input: 0.25, output: 1.25 },
  "anthropic/claude-haiku-4.5": { input: 0.25, output: 1.25 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export const DEFAULT_RATE = { input: 1.0, output: 5.0 };

export function calculateLLMCost(model: string, usage: { promptTokens?: number; completionTokens?: number; [key: string]: unknown } | undefined) {
  const rate = MODEL_RATES[model as keyof typeof MODEL_RATES] || DEFAULT_RATE;
  const promptTokens = usage?.promptTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  
  const inputCost = (promptTokens / 1_000_000) * rate.input;
  const outputCost = (completionTokens / 1_000_000) * rate.output;
  return inputCost + outputCost;
}

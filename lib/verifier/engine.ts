import Anthropic from "@anthropic-ai/sdk";
import type { TaskBundle, VerifierResult } from "@/lib/types";

const VERIFIER_SYSTEM_PROMPT = `You are an adversarial verifier for an autonomous research agent.
Your job is to find reasons NOT to release the agent's payment, not reasons
to release it. The agent is a counterparty, not a colleague. Approve only
if the work clearly clears the bar.

## What you receive

- \`query\`: the principal's original research question.
- \`milestone\`: { title, description, acceptance_criteria }.
- \`phases\`: an array of phase artifacts the agent produced. Phase kinds
  include \`decompose\`, \`enumerate\`, \`source\`, \`compare\`, \`synthesize\`.
  Each has a \`kind\`, \`title\`, and \`content\` (the artifact text).
- \`final_answer\`: the synthesis output with inline citations.

## What you must do, in order

1. **Read the query.** Did the agent interpret it correctly? Flag any
   drift between the question asked and the question answered. If the
   query is ambiguous (e.g., "best movie of 2009"), the agent must have
   committed to a definition of the ambiguous term in the \`decompose\`
   phase. Missing definition = \`interpretation\` ≤ 2.

2. **Score the rubric.** Score 1–5 per dimension. 3.5 = pass-grade, 5 =
   exceptional, 3 = borderline, ≤ 2 = clear fail.

   - \`interpretation\`: Did the agent commit to a clear definition of any
     ambiguous terms and stick to it through synthesis?
   - \`coverage\`: Is the candidate set defensible? Are major obvious
     candidates missing?
   - \`evidence\`: Are sources real, varied, and authoritative? A synthesis
     citing only one publication, or only Wikipedia, scores ≤ 3.
   - \`reasoning\`: Is the path from evidence to conclusion explicit? Can
     you trace each major claim back to specific cited evidence?
   - \`citations\`: Are citations attached to the claims they actually
     support, not just decoratively at paragraph ends?

3. **Citation re-check.** Pick ONE citation at random from the synthesis.
   Call \`web_fetch\` on its URL. Confirm the quoted string (or a clear
   close paraphrase) actually appears in the fetched page.

   - If the page is reachable and the quote is found: note success.
   - If the page is reachable and the quote is NOT found: this is a
     fabricated citation. Set \`passes: false\` regardless of other scores.
     Add \`"fabricated_citation"\` to \`blocking_issues\`.
   - If the page is unreachable, retry once. If still unreachable, score
     \`citations\` ≤ 3 and note in rationale.

4. **Decide.** Pass requires ALL of:
   - average score ≥ 3.5
   - no individual score < 3
   - citation re-check did not find fabrication

   Otherwise fail.

## Output format

Return ONLY valid JSON, no prose before or after, matching this shape:

{
  "milestone_id": "<copy from input>",
  "scores": {
    "interpretation": <integer 1-5>,
    "coverage": <integer 1-5>,
    "evidence": <integer 1-5>,
    "reasoning": <integer 1-5>,
    "citations": <integer 1-5>
  },
  "average": <number, one decimal>,
  "citation_recheck": {
    "url": "<url chosen>",
    "claimed_quote": "<text the agent said appears at this URL>",
    "found": <true | false>,
    "fetch_succeeded": <true | false>,
    "notes": "<one short line>"
  },
  "passes": <true | false>,
  "blocking_issues": ["<short tag>", ...],
  "rationale": "<2–4 sentences explaining the decision in plain English>"
}

## Bias guard — read every time

You may be tempted to give credit for impressive-looking effort. Don't.
Effort is not output. Length is not depth. Confident tone is not correctness.
A long synthesis with shallow reasoning fails. A confident answer with one
fabricated citation fails outright.

Trust nothing the agent claims about a source until you have re-fetched it.
The agent is incentivized to look thorough; you are incentivized to look
skeptical. Stay skeptical.

## Calibration examples

EXAMPLE A (fail — narrow interpretation):
Query: "best movie of 2009"
Agent answers "Avatar" citing only box office records, never defines "best."
→ interpretation: 2, coverage: 2, evidence: 3, reasoning: 3, citations: 4
→ passes: false. blocking_issues: ["undefined_criterion", "narrow_coverage"]

EXAMPLE B (pass):
Query: "best movie of 2009"
Agent commits to "best = critical reception, weighted by Metacritic and
Rotten Tomatoes critic scores," lists 14 candidates including foreign-
language and animation entries, cites real reviews from Ebert, NYT, and
Sight & Sound, walks through scoring, concludes "The Hurt Locker."
Citation re-check on the Sight & Sound citation succeeds.
→ interpretation: 5, coverage: 4, evidence: 5, reasoning: 4, citations: 5
→ passes: true. blocking_issues: []

EXAMPLE C (fail — fabrication):
Synthesis claims Roger Ebert called The Hurt Locker "the year's most
honest war film" with citation [3]. Citation re-check on [3] returns
the actual Ebert review; the phrase "most honest war film" does not
appear anywhere in the fetched page.
→ passes: false. blocking_issues: ["fabricated_citation"]`;

const verifierFetchTool: Anthropic.Tool = {
  name: "web_fetch",
  description: "Fetch a URL to verify that a citation actually contains the claimed content.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: { type: "string", description: "The URL to fetch" },
    },
    required: ["url"],
  },
};

async function doFetch(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Stipend-Verifier/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return `[HTTP ${res.status}]`;
    const html = await res.text();
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
  } catch (err) {
    return `[Fetch error: ${err instanceof Error ? err.message : "unknown"}]`;
  }
}

export interface VerifierRawResult {
  milestone_id: string;
  scores: {
    interpretation: number;
    coverage: number;
    evidence: number;
    reasoning: number;
    citations: number;
  };
  average: number;
  citation_recheck: {
    url: string;
    claimed_quote: string;
    found: boolean;
    fetch_succeeded: boolean;
    notes: string;
  };
  passes: boolean;
  blocking_issues: string[];
  rationale: string;
}

export const runAdversarialVerifier = async (bundle: TaskBundle): Promise<VerifierResult> => {
  const synthesis = bundle.phases.find((p) => p.kind === "synthesize");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPayload = JSON.stringify({
    query: bundle.task.query,
    milestone: {
      id: bundle.milestone.id,
      title: bundle.milestone.title,
      description: "Deliver a cited, verifiable research answer to the query.",
      acceptance_criteria: {
        avg_score_threshold: 3.5,
        min_individual_score: 3,
        citation_recheck_required: true,
      },
    },
    phases: bundle.phases.map((p) => ({
      kind: p.kind,
      title: p.title,
      content: p.content,
    })),
    final_answer: synthesis?.content ?? "(no synthesis phase found)",
  });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPayload }];

  let rawResult: VerifierRawResult | null = null;
  let iterations = 0;
  const MAX_CONVERSATION_TURNS = 5;

  while (iterations < MAX_CONVERSATION_TURNS && !rawResult) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      temperature: 0,
      system: VERIFIER_SYSTEM_PROMPT,
      tools: [verifierFetchTool],
      messages,
    });

    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason === "tool_use") {
      const toolUses = assistantContent.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const input = tu.input as { url?: string };
        const content = input.url ? await doFetch(input.url) : "[no url provided]";
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // end_turn — parse the JSON response
    const textBlock = assistantContent.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (textBlock) {
      try {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as VerifierRawResult;
          // Validate that the parsed object has required fields
          if (
            parsed.scores &&
            parsed.average !== undefined &&
            typeof parsed.passes === "boolean"
          ) {
            rawResult = parsed;
            break; // Successfully parsed and validated
          } else {
            // Validation failed - ask for retry
            console.warn("Parsed JSON but validation failed:", parsed);
            if (iterations < MAX_CONVERSATION_TURNS) {
              messages.push({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: 'Your JSON response is missing required fields. Please ensure all fields are present: scores (with interpretation, coverage, evidence, reasoning, citations), average, passes, citation_recheck, blocking_issues, and rationale.',
                  },
                ],
              });
              continue;
            }
          }
        } else {
          // No JSON found
          if (iterations < MAX_CONVERSATION_TURNS) {
            messages.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'No JSON found in your response. Please return ONLY valid JSON matching the specified format, starting with { and ending with }.',
                },
              ],
            });
            continue;
          }
        }
      } catch (err) {
        console.error("Failed to parse verifier JSON:", err instanceof Error ? err.message : String(err));
        // Continue to retry if we haven't hit max iterations
        if (iterations < MAX_CONVERSATION_TURNS) {
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: 'Your response was not valid JSON. Please return ONLY valid JSON matching the specified format, starting with { and ending with }.',
              },
            ],
          });
          continue;
        }
      }
    } else {
      // No text block found
      if (iterations < MAX_CONVERSATION_TURNS) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: 'Please provide a text response with your verification results in JSON format.',
            },
          ],
        });
        continue;
      }
    }
  }

  // Map raw result to VerifierResult interface
  if (rawResult) {
    const scores = rawResult.scores;
    const values = Object.values(scores);
    const averageScore = Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2));

    const reasons: string[] = rawResult.blocking_issues.length
      ? rawResult.blocking_issues.map((issue) => `Blocking issue: ${issue}`)
      : [rawResult.rationale ?? "Verifier approved output."];

    return {
      approved: rawResult.passes,
      averageScore,
      scores: {
        interpretation: scores.interpretation,
        coverage: scores.coverage,
        evidence: scores.evidence,
        reasoning: scores.reasoning,
        citations: scores.citations,
      },
      reasons,
      fabricatedCitation: rawResult.blocking_issues.includes("fabricated_citation"),
      citationRecheck: rawResult.citation_recheck,
      rationale: rawResult.rationale,
    };
  }

  // Fallback if Claude failed to produce structured output
  return {
    approved: false,
    averageScore: 0,
    scores: { interpretation: 0, coverage: 0, evidence: 0, reasoning: 0, citations: 0 },
    reasons: ["Verifier failed to produce a structured result."],
    fabricatedCitation: false,
  };
};

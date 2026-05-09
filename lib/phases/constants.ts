import type { PhaseKind } from "@/lib/types";

export const PHASE_ORDER: PhaseKind[] = [
  "decompose",
  "enumerate",
  "source",
  "compare",
  "synthesize",
];

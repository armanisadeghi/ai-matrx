/**
 * THE ONE LIST OF PROPOSAL KINDS (KI-045). A new kind of AI proposal is ONE
 * entry here plus its module in `./kinds/` — never a new review screen.
 * Order is the queue's section order. Contract: `./types.ts` + `./FEATURE.md`.
 */

import { keywordMeaningKind } from "./kinds/keyword-meaning";
import { placementDriftKind } from "./kinds/placement-drift";
import { topicPlacementKind } from "./kinds/topic-placement";
import type { ApprovalKind } from "./types";

export const APPROVAL_KINDS: readonly ApprovalKind[] = [
  keywordMeaningKind,
  placementDriftKind,
  topicPlacementKind,
];

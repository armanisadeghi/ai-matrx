/**
 * THE ONE LIST OF PROPOSAL KINDS.
 *
 * A new kind of AI proposal is ONE entry here plus its module in `./kinds/` —
 * never a new review screen and never a second queue. Order is the queue's
 * section order. Contract: `./types.ts` + `./FEATURE.md`.
 *
 * LIFTED from `features/marketing/seo/value-system/approvals/registry.ts` on
 * 2026-09-17 by chair ruling: that registry was already the mechanism, so the
 * three keyword kinds simply stayed registrations while the registry itself
 * moved to the platform layer. Every host — `/approvals`, the approvals window,
 * the SEO console, the value workbench, the guidelines panel, the offering tree
 * — mounts THIS list and narrows with `kinds`.
 *
 * 🚨 Narrowing is a `kinds` prop, never a shorter registry. A host that hands
 * the queue its own list has started queue number two.
 */

import { gmailSendKind } from "./kinds/gmail-send";
import { keywordMeaningKind } from "./kinds/seo/keyword-meaning";
import { placementDriftKind } from "./kinds/seo/placement-drift";
import { topicPlacementKind } from "./kinds/seo/topic-placement";
import { sheetWriteKind } from "./kinds/sheet-write";
import type { ApprovalKind } from "./types";

export const APPROVAL_KINDS: readonly ApprovalKind[] = [
  // Things that leave the building first — a message nobody can recall.
  gmailSendKind,
  sheetWriteKind,
  // Then the keyword system's three (register KI-045).
  keywordMeaningKind,
  placementDriftKind,
  topicPlacementKind,
];

/** The keyword kinds, for a host that wants only them. */
export const SEO_APPROVAL_KIND_IDS: readonly string[] = [
  keywordMeaningKind.id,
  placementDriftKind.id,
  topicPlacementKind.id,
];

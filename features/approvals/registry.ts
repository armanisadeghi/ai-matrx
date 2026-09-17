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

import { contactImportKind } from "./kinds/contact-import";
import { documentAppendKind } from "./kinds/document-append";
import { documentCreateKind } from "./kinds/document-create";
import { gmailSendKind } from "./kinds/gmail-send";
import { keywordMeaningKind } from "./kinds/seo/keyword-meaning";
import { placementDriftKind } from "./kinds/seo/placement-drift";
import { topicPlacementKind } from "./kinds/seo/topic-placement";
import { sheetWriteKind } from "./kinds/sheet-write";
import { spreadsheetCreateKind } from "./kinds/spreadsheet-create";
import { taskImportKind } from "./kinds/task-import";
import type { ApprovalKind } from "./types";

export const APPROVAL_KINDS: readonly ApprovalKind[] = [
  // Things that leave the building first — a message nobody can recall.
  gmailSendKind,
  // Then the six Google Workspace kinds the aidream producer writes —
  // `aidream/services/google_workspace/approvals.py`, one row per proposed
  // change. Changes to a file the person already has come before the two that
  // create a new one, and the imports (which add records here, not in Google)
  // come last. The producer's RENDERED_PROPOSAL_KINDS must list exactly the
  // ids below, or it queues rows this screen cannot show.
  sheetWriteKind,
  documentAppendKind,
  documentCreateKind,
  spreadsheetCreateKind,
  contactImportKind,
  taskImportKind,
  // Then the keyword system's three (register KI-045).
  keywordMeaningKind,
  placementDriftKind,
  topicPlacementKind,
];

/**
 * The keyword kinds, derived from the modules themselves so it can never drift.
 *
 * ONE host uses it: the marketing approvals console, which mounts a queue PER
 * SITE. Every kind also declares its own `scopeRequirement`, so a person-scoped
 * kind is already skipped there — but skipped means "named with its door", and
 * sixteen sites would print the same two "this waits in your own queue" lines
 * sixteen times. The console narrows instead, and says it once itself
 * (Bugbot HIGH #3, 2026-09-17).
 */
export const SEO_APPROVAL_KIND_IDS: readonly string[] = [
  keywordMeaningKind.id,
  placementDriftKind.id,
  topicPlacementKind.id,
];

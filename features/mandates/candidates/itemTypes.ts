/**
 * The two Mandate Candidates record types' entries in THE one type map
 * (`features/item-presentation/registry.tsx`). The registration lives beside
 * its feature; the map is where the platform learns about it — the same seam
 * the Google mirrors and the Marketing site use.
 *
 * No `detailSource`: the rows are read through the aidream doors (`api.ts`),
 * which is where the payload's row security (A2) is applied as the viewer.
 * No `open`: agent cards never emit these; they open through `openers.ts`.
 */

import { GitCompareArrows, ListChecks } from "lucide-react";

import type { ItemTypeConfig } from "@/features/item-presentation/registry";

import { refineCandidateDetail, refineCandidateRunDetail } from "./detail";

const ACCENT = {
  text: "text-teal-600 dark:text-teal-400",
  bg: "bg-teal-500/10",
  ring: "ring-teal-500/20",
};

export const MANDATE_CANDIDATE_RUN_ITEM_TYPE: ItemTypeConfig = {
  type: "mandate_candidate_run",
  label: "Candidate run",
  icon: GitCompareArrows,
  accent: ACCENT,
  refineDetail: refineCandidateRunDetail,
};

export const MANDATE_CANDIDATE_ITEM_TYPE: ItemTypeConfig = {
  type: "mandate_candidate",
  label: "Mandate candidate",
  icon: ListChecks,
  accent: ACCENT,
  refineDetail: refineCandidateDetail,
};

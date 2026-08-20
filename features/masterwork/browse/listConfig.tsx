"use client";

import type { EntityListConfig } from "@/lib/entity-list/config";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { RULEBOOK_COLUMNS } from "./columns";
import {
  fetchRulebookCounts,
  fetchRulebookFacets,
  fetchRulebookPage,
} from "./service";
import { useRulebookRowActions } from "./useRulebookRowActions";
import type { RulebookListRow } from "../types";

const RULEBOOK_SCOPES: ListScopeKind[] = ["mine", "orgs", "shared", "public"];

export const rulebookListConfig: EntityListConfig<RulebookListRow> = {
  surfaceKey: "masterwork-browse",
  entityLabel: { singular: "Rulebook", plural: "Rulebooks" },
  scopes: RULEBOOK_SCOPES,
  service: {
    fetchPage: fetchRulebookPage,
    fetchCounts: fetchRulebookCounts,
    fetchFacets: fetchRulebookFacets,
  },
  columns: RULEBOOK_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  door: { token: "rulebook" },
  sourceFeature: "masterwork",
  getRowEntity: (row) => ({
    type: "rulebook",
    id: row.id,
    title: row.name,
  }),
  useRowActions: useRulebookRowActions,
  supportsArchived: false,
  facetSections: [],
  emptyState: {
    title: "No Rulebooks here",
    description:
      "A Rulebook is one Expert's captured judgment — the rules, why they exist, and how to catch violations. Create one, or open Public to see the built-in examples.",
  },
};

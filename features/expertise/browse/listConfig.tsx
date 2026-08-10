"use client";

import type { EntityListConfig } from "@/lib/entity-list/config";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { EXPERTISE_COLUMNS } from "./columns";
import {
  fetchExpertiseCounts,
  fetchExpertiseFacets,
  fetchExpertisePage,
} from "./service";
import { useExpertiseRowActions } from "./useExpertiseRowActions";
import type { ExpertisePackListRow } from "../types";

const EXPERTISE_SCOPES: ListScopeKind[] = ["mine", "orgs", "public"];

export const expertiseListConfig: EntityListConfig<ExpertisePackListRow> = {
  surfaceKey: "expertise-browse",
  entityLabel: { singular: "expertise pack", plural: "expertise packs" },
  scopes: EXPERTISE_SCOPES,
  service: {
    fetchPage: fetchExpertisePage,
    fetchCounts: fetchExpertiseCounts,
    fetchFacets: fetchExpertiseFacets,
  },
  columns: EXPERTISE_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  door: { token: "expertise_pack" },
  // TODO(expertise, phase 2): switch to the dedicated "expertise" slug once it
  // is registered in aidream source_attribution.SOURCE_FEATURES and regenerated.
  sourceFeature: "agents-other",
  getRowEntity: (row) => ({
    type: "expertise_pack",
    id: row.id,
    title: row.name,
  }),
  useRowActions: useExpertiseRowActions,
  supportsArchived: false,
  facetSections: [],
  emptyState: {
    title: "No expertise packs here",
    description:
      "A pack is one expert's rulebook — the rules, why they exist, and how to catch violations. Create one, or open Public to see the built-in examples.",
  },
};

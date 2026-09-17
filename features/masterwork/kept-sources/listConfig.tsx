"use client";

// features/masterwork/kept-sources/listConfig.tsx
//
// THE LIST OF WHAT A RULEBOOK KEPT — every source whose raw material survived.
//
// Deliberately NOT the same surface as `RulebookSourcesPanel`. That panel is
// the DUMP lane's capture desk: what you are ABOUT to distil, staged and not
// yet read. This list is what WAS read and kept. Showing intentions and records
// in one list would make "12 sources" mean two different things in the same
// sentence, which is the kind of number nobody can act on.
//
// NO SCOPE TABS. The Rulebook is the scope — "mine / my organizations /
// public" would be four ways of asking a question this list has already
// answered by being mounted inside one Rulebook. Access is decided by RLS on
// the parent Rulebook (`iam.accessible_entity_ids`), so a person who can read
// the Rulebook sees its kept material and nobody else does.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { KEPT_SOURCE_COLUMNS } from "./columns";
import { createKeptSourceService } from "./service";
import type { KeptSourceRow } from "./types";
import { keptSourceTitle } from "./types";
import { useKeptSourceRowActions } from "./useKeptSourceRowActions";
import type { RulebookRule } from "../types";

export function createKeptSourceListConfig(options: {
  rulebookId: string;
  rules: RulebookRule[];
  laneLabels: Map<string, string>;
  lanesResolved: boolean;
}): EntityListConfig<KeptSourceRow> {
  const { rulebookId, rules, laneLabels, lanesResolved } = options;
  return {
    surfaceKey: "masterwork-kept-sources",
    entityLabel: { singular: "kept source", plural: "kept sources" },
    scopes: [],
    service: createKeptSourceService({
      rulebookId,
      rules,
      laneLabels,
      lanesResolved,
    }),
    // The service is built from data that arrives asynchronously — the
    // Rulebook's rules and the Approach registry. Without this the shell would
    // keep the answer it got from the first render, when both were empty, and
    // every rule count would read 0 forever.
    serviceKey: `${rulebookId}:${rules.length}:${laneLabels.size}:${lanesResolved}`,
    columns: KEPT_SOURCE_COLUMNS,
    prefsVersion: 1,
    prefsDefaults: { sort: "captured_at", direction: "desc" },
    urlState: true,
    getRowId: (row) => row.id,
    getRowName: (row) => keptSourceTitle(row),
    // THE DOOR LAW: every row this list names opens to the words themselves.
    door: {
      hrefFor: (row) =>
        `/masterwork/${row.rulebook_id}/sources/kept/${encodeURIComponent(
          row.source_key,
        )}`,
    },
    sourceFeature: "masterwork",
    getRowEntity: (row) => ({
      type: "masterwork_source",
      id: row.id,
      title: keptSourceTitle(row),
    }),
    useRowActions: useKeptSourceRowActions,
    supportsArchived: false,
    facetSections: [
      {
        facet: "lane_label",
        filterId: "lane_label",
        label: "Lane",
        noneLabel: "Lane unknown",
      },
      {
        facet: "medium",
        filterId: "medium",
        label: "Kind",
        noneLabel: "Kind unknown",
      },
    ],
    emptyState: {
      title: "Nothing kept yet",
      description:
        "When you talk this Rulebook through, paste a transcript, upload a document or play one of the games, the words you gave us are kept here — not just the rules we drew out of them.",
    },
  };
}

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
import { useRulebookMasterworks } from "./useRulebookMasterworks";
import { MasterworkBrowseCards } from "./components/MasterworkBrowseCards";
import { MasterworkBrowseRows } from "./components/MasterworkBrowseRows";
import type { ItemMenuConfig } from "@/components/official/item/types";
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
  // THREE VIEWS, like /agents (Arman, 2026-08-21) — cards, rows, table. Each
  // one carries the Masterworks built from the Rulebook, so the list shows
  // both halves of the work without pretending they are peers.
  views: {
    cards: (p) => (
      <MasterworkViews
        rows={p.rows}
        density={p.density}
        menuFor={p.actions.menuFor}
        hrefFor={p.hrefFor}
        variant="cards"
      />
    ),
    rows: (p) => (
      <MasterworkViews
        rows={p.rows}
        density={p.density}
        menuFor={p.actions.menuFor}
        hrefFor={p.hrefFor}
        variant="rows"
      />
    ),
  },
  supportsArchived: false,
  facetSections: [],
  emptyState: {
    title: "No Rulebooks here",
    description:
      "A Rulebook is one Expert's captured judgment — the rules, why they exist, and how to catch violations. Create one, or open Public to see the built-in examples.",
  },
};

/**
 * Both non-table views need the same Masterworks-per-Rulebook read, and a
 * render prop cannot call a hook — so this is the ONE component that does,
 * switching on variant. (React rules: the hook must live in a component, not
 * in the config object.)
 */
function MasterworkViews({
  rows,
  density,
  menuFor,
  hrefFor,
  variant,
}: {
  rows: RulebookListRow[];
  density: "compact" | "comfortable";
  menuFor: (row: RulebookListRow) => () => ItemMenuConfig;
  hrefFor: (row: RulebookListRow) => string | undefined;
  variant: "cards" | "rows";
}) {
  const masterworksBy = useRulebookMasterworks(rows.map((r) => r.id));
  const View = variant === "cards" ? MasterworkBrowseCards : MasterworkBrowseRows;
  return (
    <View
      rows={rows}
      density={density}
      menuFor={menuFor}
      hrefFor={hrefFor}
      masterworksBy={masterworksBy}
    />
  );
}

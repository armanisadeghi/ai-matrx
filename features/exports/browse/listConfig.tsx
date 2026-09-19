"use client";

// features/exports/browse/listConfig.tsx
//
// The items inside one dropped export, expressed as an entity-list config.
//
// Built by a FUNCTION rather than declared as a module constant, because every
// read is scoped to one Library id — which is exactly what `serviceKey` is for
// (`lib/entity-list/config.tsx`: "A service built inside a component from
// asynchronously-loaded data MUST declare one").

import { Send } from "lucide-react";
import type { EntityListConfig } from "@/lib/entity-list/config";
import type {
  EntityBulkActionResult,
  EntityBulkSelection,
} from "@/lib/entity-list/selection";
import { directionLabel } from "../format";
import type { ExportItem, ExportSummary } from "../types";
import type { PendingSend } from "../components/SendToRulebookDialog";
import { EXPORT_ITEM_COLUMNS } from "./columns";
import { toItemFilterFromBulk } from "./itemQuery";
import type { ExportPageFacts } from "../counts";
import { createExportItemsService } from "./service";
import { useExportItemRowActions } from "./useExportItemRowActions";

export interface ExportItemsListConfigDeps {
  libraryId: string;
  getSummary: () => ExportSummary | null;
  /** Changes when the summary lands, so the shell re-asks for facets that were
   *  empty before the index finished. */
  summaryKey: string;
  onPageRead?: (facts: ExportPageFacts) => void;
  /** Opens the confirmation dialog and settles when the person is done. The
   *  page stamps the request id; a bulk action has no business inventing one. */
  onSendRequested: (
    pending: Omit<PendingSend, "requestId">,
  ) => Promise<EntityBulkActionResult | void>;
  /** The server's own words for the current filter, for the confirm sentence. */
  filterDescription: string;
}

export function createExportItemsListConfig(
  deps: ExportItemsListConfigDeps,
): EntityListConfig<ExportItem> {
  const correspondentLabel = (key: string): string => {
    const match = deps
      .getSummary()
      ?.top_correspondents.find((c) => c.key === key);
    return match?.label ?? key;
  };

  // The container facet's filter VALUE is `container_key()` (an opaque thread
  // id for most adapters), so the checkbox needs this the same way the
  // correspondent facet needs `correspondentLabel` — to show "Priya Raman"
  // rather than "priyaraman_10000000000".
  const containerLabel = (key: string): string => {
    const match = deps.getSummary()?.top_containers.find((c) => c.key === key);
    return match?.label ?? key;
  };

  return {
    surfaceKey: "exports-library-items",
    entityLabel: { singular: "item", plural: "items" },
    // The list lives inside the file-import surface it was uploaded through.
    sourceFeature: "files",
    // An export belongs to whoever dropped it. There is no shared or public
    // half of somebody's Google Takeout, so one scope is the honest set.
    scopes: ["mine"],
    service: createExportItemsService({
      libraryId: deps.libraryId,
      getSummary: deps.getSummary,
      onPageRead: deps.onPageRead,
    }),
    serviceKey: `${deps.libraryId}:${deps.summaryKey}`,
    columns: EXPORT_ITEM_COLUMNS,
    prefsVersion: 1,
    prefsDefaults: {
      sort: "occurred_at",
      direction: "desc",
      pageSize: 100,
    },
    getRowId: (row) => row.id,
    getRowName: (row) => row.title?.trim() || "(no subject)",
    useRowActions: useExportItemRowActions,
    // No archive axis, no favorites, and no deep search: there is no body text
    // to search inside, so offering the toggle would promise a scan of words
    // this platform deliberately never read.
    supportsArchived: false,
    urlState: true,

    /**
     * THE ACTION. One bulk verb, and it declares no `confirm`: the dialog it
     * opens IS the confirmation, and it has to be — the server refuses the
     * send without the exact sentence the person read
     * (403 `consent_required`), so a generic "Are you sure?" in front of it
     * would be a second stop that names less and still could not authorise
     * anything.
     *
     * 🚨 `selection.filter` travels, not the ids, whenever the person meant
     * "everything matching". `EntityBulkFilter` is the query with the page
     * dropped, mapped by the SAME `toItemFilter` the list reads pages with, so
     * the number in the sentence and the rows the server acts on come from one
     * definition of the filter.
     */
    bulkActions: [
      {
        id: "send-to-rulebook",
        label: "Send to a Rulebook",
        icon: Send,
        run: (selection: EntityBulkSelection<ExportItem>) =>
          deps.onSendRequested({
            count: selection.count,
            mode: selection.mode,
            ids: selection.ids,
            filter: toItemFilterFromBulk(selection.filter),
            filterDescription: deps.filterDescription,
          }),
      },
    ],
    bulkSelection: { noun: "item", selectAllMatching: true },

    facetSections: [
      {
        facet: "direction",
        filterId: "direction",
        label: "Who sent it",
        noneLabel: "Unknown",
        countInLabel: false,
        formatValue: directionLabel,
      },
      {
        facet: "kind",
        filterId: "kind",
        label: "Type",
        noneLabel: "Unknown",
        countInLabel: false,
      },
      {
        facet: "author",
        filterId: "author",
        label: "Correspondent",
        noneLabel: "Unknown",
        searchPlaceholder: "Find a person",
        formatValue: correspondentLabel,
      },
      {
        facet: "container_label",
        filterId: "container_label",
        label: "Thread / channel",
        noneLabel: "No thread",
        searchPlaceholder: "Find a thread or channel",
        formatValue: containerLabel,
      },
      {
        facet: "labels",
        filterId: "labels",
        label: "Labels",
        noneLabel: "No label",
        searchPlaceholder: "Find a label",
      },
    ],
    noneLabels: {
      direction: "Unknown",
      kind: "Unknown",
      author: "Unknown",
      container_label: "No thread",
      labels: "No label",
    },

    emptyState: {
      title: "Nothing matches that",
      description:
        "Widen the filters, or clear them to see everything this export contains.",
    },
  };
}

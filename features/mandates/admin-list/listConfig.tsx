"use client";

// features/mandates/admin-list/listConfig.tsx
//
// The admin mandate list as an entity-list config — modelled on /agents/all
// (features/agents/browse/listConfig.tsx): the name is a real link to the
// mandate's page, a row click opens the quick look (MandatePeek), and the
// row menu carries Quick look / Open / new tab / copy. The service is built
// by the page (it needs the viewer and dispatch), so it is left empty here.

import { useState } from "react";
import { Copy, ExternalLink, Eye } from "lucide-react";
import { toast } from "@/lib/toast";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { EMPTY_FACETS, EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import { adminMandateHref } from "@/features/mandates/browse/url-compat";
import { ADMIN_MANDATE_COLUMNS } from "./columns";
import { MandatePeek } from "./MandatePeek";
import type { MandateAdminRow } from "./types";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
}

function useMandateAdminRowActions(
  list: EntityListController<MandateAdminRow>,
): EntityRowActionsResult<MandateAdminRow> {
  const [peekId, setPeekId] = useState<string | null>(null);

  const menuFor = (row: MandateAdminRow) => (): ItemMenuConfig => {
    const href = adminMandateHref(row.mandateKey);
    return {
      sections: [
        {
          id: "open",
          items: [
            { id: "peek", label: "Quick look", icon: Eye, onSelect: () => setPeekId(row.id) },
            { id: "open", label: "Open", icon: ExternalLink, kind: "link", href },
            {
              id: "open-new-tab",
              label: "Open in new tab",
              icon: ExternalLink,
              kind: "link",
              href,
              target: "_blank",
            },
          ],
        },
        {
          id: "copy",
          items: [
            { id: "copy-key", label: "Copy key", icon: Copy, onSelect: () => copy(row.mandateKey, "key") },
            { id: "copy-id", label: "Copy id", icon: Copy, onSelect: () => copy(row.id, "id") },
          ],
        },
      ],
    };
  };

  return {
    actions: { menuFor, onOpenRow: (row) => setPeekId(row.id) },
    modals: peekId ? (
      <MandatePeek rowId={peekId} rows={list.rows} onClose={() => setPeekId(null)} />
    ) : null,
  };
}

export const adminMandateListConfig: EntityListConfig<MandateAdminRow> = {
  surfaceKey: "admin-mandates-list-preview",
  entityLabel: { singular: "mandate", plural: "mandates" },
  sourceFeature: "agents-other",
  getRowEntity: (row) => ({ type: "mandate", id: row.id, title: row.name }),
  scopes: ["mine", "orgs", "system"],
  service: {
    fetchPage: async () => ({ rows: [], total: 0 }),
    fetchCounts: async () => EMPTY_SCOPE_COUNTS,
    fetchFacets: async () => EMPTY_FACETS,
  },
  columns: ADMIN_MANDATE_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: { sort: "name", direction: "asc", pageSize: 50 },
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  door: { column: "name", hrefFor: (row) => adminMandateHref(row.mandateKey) },
  urlState: true,
  supportsArchived: false,
  tableToolbar: { tableId: "admin-mandates-list-preview" },
  searchPlaceholder: "Search mandates, keys, agents…",
  useRowActions: useMandateAdminRowActions,
  facetSections: [],
  copy: {
    label: "Mandate",
    listLabel: "Mandates",
    location: "/administration/mandates/list-preview",
    rowKind: "mandate",
    listKind: "mandate-list",
    humanRow: (row) =>
      `${row.name} (${row.mandateKey}) — ${row.featureLabel}; holder ${row.agentName}, ${row.pinText}`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No mandates here",
    description: "Nothing in this scope.",
  },
};

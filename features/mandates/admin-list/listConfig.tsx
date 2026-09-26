"use client";

// features/mandates/admin-list/listConfig.tsx
//
// The admin mandate list as an entity-list config — modelled on /agents/all
// (features/agents/browse/listConfig.tsx): the name is a real link to the
// mandate's page, a row click opens the quick look (MandatePeek), and the
// row menu carries Quick look / Open / new tab / copy. The service is built
// by the page (it needs the viewer and dispatch), so it is left empty here.
//
// TWO CONFIGS, ONE LIST (Arman, 2026-09-26):
//   adminMandateListConfig    the MANAGEMENT page — system mandates only: one
//                             scope, no tabs, no Owner column; rows open by key.
//   supportMandateListConfig  the SUPPORT lookup — Organizations / Users / All
//                             with the Owner column; rows open by id (a tenant
//                             key can repeat across organizations).

import { mandateStatusLabel } from "@/features/mandates/status/mandate-status";
import { useState } from "react";
import { Copy, ExternalLink, Eye, Trash2 } from "lucide-react";
import { dismissRecordToasts, recordToast, toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { softDeleteMandate } from "@/features/mandates/admin/service";
import { invalidateMandateAdminList } from "./store";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { EMPTY_FACETS, EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import { ADMIN_SUPPORT_LIST_SCOPES } from "@/lib/list-scope/types"; // admin-support-only: /administration/intelligence/mandates/support
import {
  ADMIN_MANDATES_HOME,
  ADMIN_MANDATES_SUPPORT,
  adminMandateRecordHref,
  adminMandateSupportRecordHref,
} from "@/features/mandates/admin-routes";
import { ADMIN_MANDATE_COLUMNS, SUPPORT_MANDATE_COLUMNS } from "./columns";
import type { MandateAdminLane } from "./rpc";
import { MandatePeek } from "./MandatePeek";
import type { MandateAdminRow } from "./types";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
}

/**
 * Remove a mandate — the old console's Remove, carried over: soft, confirmed,
 * and the confirm names what a person actually loses and what survives.
 */
async function removeMandate(row: MandateAdminRow): Promise<void> {
  const ok = await confirm({
    title: `Remove "${row.name}"?`,
    description:
      `Everywhere that runs this job stops finding it: the lists, the pickers, and any call that names the key "${row.mandateKey}" will report it missing. ` +
      (row.overridesCount === 0
        ? "It has no customizations, so nothing bound to it is lost. "
        : `Its ${row.overridesCount} customization${row.overridesCount === 1 ? "" : "s"} — every Mandate Holder, setting and mapping bound to it — stop applying with it. `) +
      `This is a soft removal: the record and its history are kept, so an admin can restore it if this was a mistake.`,
    confirmLabel: "Remove it",
    cancelLabel: "Keep it",
    variant: "destructive",
  });
  if (!ok) return;
  const ref = { type: "mandate", id: row.id, title: row.mandateKey };
  try {
    await softDeleteMandate(row.id);
    dismissRecordToasts(ref);
    recordToast.success(ref, `Removed "${row.name}" — resolving it now refuses.`);
    invalidateMandateAdminList();
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : "That job was not removed.");
  }
}

/** Where a row opens: management by key, support by id. */
export function mandateAdminRowHref(lane: MandateAdminLane, row: MandateAdminRow): string {
  return lane === "system"
    ? adminMandateRecordHref(row.mandateKey)
    : adminMandateSupportRecordHref(row.id);
}

const rowActionsFor = (lane: MandateAdminLane) =>
  function useMandateAdminRowActions(
    list: EntityListController<MandateAdminRow>,
  ): EntityRowActionsResult<MandateAdminRow> {
  const [peekId, setPeekId] = useState<string | null>(null);
  const hrefFor = (row: MandateAdminRow) => mandateAdminRowHref(lane, row);

  const menuFor = (row: MandateAdminRow) => (): ItemMenuConfig => {
    const href = hrefFor(row);
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
        {
          id: "danger",
          items: [
            {
              id: "remove",
              label: "Remove",
              icon: Trash2,
              tone: "destructive",
              onSelect: () => void removeMandate(row),
            },
          ],
        },
      ],
    };
  };

  return {
    actions: { menuFor, onOpenRow: (row) => setPeekId(row.id) },
    modals: peekId ? (
      <MandatePeek
        rowId={peekId}
        rows={list.rows}
        onClose={() => setPeekId(null)}
        hrefFor={hrefFor}
      />
    ) : null,
  };
  };

const managementRowActions = rowActionsFor("system");
const supportRowActions = rowActionsFor("support");

export const adminMandateListConfig: EntityListConfig<MandateAdminRow> = {
  surfaceKey: "admin-mandates-list-preview",
  entityLabel: { singular: "mandate", plural: "mandates" },
  sourceFeature: "agents-other",
  getRowEntity: (row) => ({ type: "mandate", id: row.id, title: row.name }),
  // THE MANAGEMENT PAGE (Arman, 2026-09-26): the platform's own mandates and
  // nothing else — one scope, and the page renders no scope tabs for it.
  scopes: ["system"],
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
  door: { column: "name", hrefFor: (row) => mandateAdminRowHref("system", row) },
  urlState: true,
  supportsArchived: false,
  tableToolbar: { tableId: "admin-mandates-list-preview" },
  searchPlaceholder: "Search mandates, keys, agents…",
  useRowActions: managementRowActions,
  facetSections: [
    {
      // THE STATUS facet — the same values the Status column filters by.
      facet: "status",
      filterId: "status",
      label: "Status",
      noneLabel: "Unknown",
      formatValue: mandateStatusLabel,
    },
  ],
  copy: {
    label: "Mandate",
    listLabel: "Mandates",
    location: ADMIN_MANDATES_HOME,
    rowKind: "mandate",
    listKind: "mandate-list",
    humanRow: (row) =>
      `${row.name} (${row.mandateKey}) — ${row.featureLabel}; Mandate Holder ${row.agentName}, ${row.pinText}`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No mandates here",
    description: "Nothing in this scope.",
  },
};

/**
 * MANDATE SUPPORT LOOKUP — the same list over organizations' and people's
 * mandates, for tech support. Never the management page (Arman, 2026-09-26).
 */
export const supportMandateListConfig: EntityListConfig<MandateAdminRow> = {
  ...adminMandateListConfig,
  surfaceKey: "admin-mandates-support-lookup",
  scopes: ADMIN_SUPPORT_LIST_SCOPES, // admin-support-only: /administration/intelligence/mandates/support
  columns: SUPPORT_MANDATE_COLUMNS,
  door: { column: "name", hrefFor: (row) => mandateAdminRowHref("support", row) },
  tableToolbar: { tableId: "admin-mandates-support-lookup" },
  searchPlaceholder: "Search organizations' and people's mandates…",
  useRowActions: supportRowActions,
  copy: {
    ...adminMandateListConfig.copy!,
    listLabel: "Mandates (support lookup)",
    location: ADMIN_MANDATES_SUPPORT,
  },
  emptyState: {
    title: "No mandates here",
    description: "No organization or person in this view owns a mandate that matches.",
  },
};

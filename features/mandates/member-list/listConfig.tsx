"use client";

// features/mandates/member-list/listConfig.tsx
//
// The non-admin mandate list as an entity-list config, built per LEVEL from the
// admin list's shape (../admin-list/listConfig.tsx): the name is a real link to
// the record, a row click opens the quick look, and the row menu carries Quick
// look / Open / new tab / copy — plus Remove, only on a mandate this seat owns
// (my own soft mandate, or this organization's when I manage it).

import { useState } from "react";
import { Copy, ExternalLink, Eye, Trash2 } from "lucide-react";
import { dismissRecordToasts, recordToast, toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { softDeleteMandate } from "@/features/mandates/admin/service";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { EMPTY_FACETS, EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { memberMandateColumns } from "./columns";
import { MandateMemberPeek } from "./MandateMemberPeek";
import { memberMandateListHref, memberMandateRecordHref } from "./routes";
import type { MandateListLevel, MandateMemberRow } from "./types";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
}

export interface MemberListConfigOptions {
  level: MandateListLevel;
  /** Organization level: the route's organization. */
  orgId?: string | null;
  /** Organization level: the viewer is an owner/admin of `orgId`. */
  canManageOrg?: boolean;
  /** Re-ask the list after a write. */
  onChanged: () => void;
}

/** May this seat remove the row? Pure — exported for tests. */
export function canRemoveMemberRow(row: MandateMemberRow, options: MemberListConfigOptions): boolean {
  if (row.origin !== "soft" || row.isSystem) return false;
  if (options.level === "person") return row.createdByMe;
  return Boolean(options.canManageOrg) && row.organizationId === options.orgId;
}

async function removeMandate(row: MandateMemberRow, onChanged: () => void): Promise<void> {
  const ok = await confirm({
    title: `Remove "${row.name}"?`,
    description:
      "It disappears from every list and picker, and anything that runs it by name will report it missing. " +
      "This is a soft removal: the record and its history are kept and can be restored.",
    confirmLabel: "Remove it",
    cancelLabel: "Keep it",
    variant: "destructive",
  });
  if (!ok) return;
  const ref = { type: "mandate", id: row.id, title: row.mandateKey };
  try {
    await softDeleteMandate(row.id);
    dismissRecordToasts(ref);
    recordToast.success(ref, `Removed "${row.name}".`);
    onChanged();
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : "That mandate was not removed.");
  }
}

export function memberMandateListConfig(
  options: MemberListConfigOptions,
): EntityListConfig<MandateMemberRow> {
  const hrefFor = (row: MandateMemberRow) =>
    memberMandateRecordHref(options.level, row.mandateKey, options.orgId);

  function useRowActions(
    list: EntityListController<MandateMemberRow>,
  ): EntityRowActionsResult<MandateMemberRow> {
    const [peekId, setPeekId] = useState<string | null>(null);
    const menuFor = (row: MandateMemberRow) => (): ItemMenuConfig => {
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
            ],
          },
          ...(canRemoveMemberRow(row, options)
            ? [
                {
                  id: "danger",
                  items: [
                    {
                      id: "remove",
                      label: "Remove",
                      icon: Trash2,
                      tone: "destructive" as const,
                      onSelect: () => void removeMandate(row, options.onChanged),
                    },
                  ],
                },
              ]
            : []),
        ],
      };
    };
    return {
      actions: { menuFor, onOpenRow: (row) => setPeekId(row.id) },
      modals: peekId ? (
        <MandateMemberPeek
          rowId={peekId}
          rows={list.rows}
          level={options.level}
          hrefFor={hrefFor}
          onClose={() => setPeekId(null)}
        />
      ) : null,
    };
  }

  const scopes: ListScopeKind[] =
    // The four lanes (mine · organization · community · world) in the platform scope
    // vocabulary, plus what I was handed and the platform's own. `public` is the published
    // lane — a mandate someone outside my organizations shared with everyone.
    options.level === "organization"
      ? ["orgs", "public", "system"]
      : ["mine", "shared", "orgs", "public", "system"];
  const surfaceKey =
    options.level === "organization" ? "org-mandates-list-preview" : "user-mandates-list-preview";

  return {
    surfaceKey,
    entityLabel: { singular: "mandate", plural: "mandates" },
    sourceFeature: "agents-other",
    getRowEntity: (row) => ({ type: "mandate", id: row.id, title: row.name }),
    scopes,
    service: {
      fetchPage: async () => ({ rows: [], total: 0 }),
      fetchCounts: async () => EMPTY_SCOPE_COUNTS,
      fetchFacets: async () => EMPTY_FACETS,
    },
    columns: memberMandateColumns(),
    prefsVersion: 1,
    prefsDefaults: { sort: "name", direction: "asc", pageSize: 50 },
    getRowId: (row) => row.id,
    getRowName: (row) => row.name,
    door: { column: "name", hrefFor },
    urlState: true,
    supportsArchived: false,
    tableToolbar: { tableId: surfaceKey },
    searchPlaceholder: "Search mandates, keys, agents…",
    useRowActions,
    facetSections: [],
    copy: {
      label: "Mandate",
      listLabel: "Mandates",
      location: memberMandateListHref(options.level, options.orgId),
      rowKind: "mandate",
      listKind: "mandate-list",
      humanRow: (row) =>
        `${row.name} (${row.mandateKey}) — ${row.featureLabel}; runs ${row.holderName} (${row.pinText}), decided by ${row.decidedBy}`,
      showRow: false,
      showToolbar: false,
    },
    emptyState: {
      title: "No mandates here",
      description: "Nothing in this scope.",
    },
  };
}

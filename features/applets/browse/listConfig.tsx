"use client";

// features/applets/browse/listConfig.tsx — /applets on the canonical
// entity-list shell (lib/entity-list). One create button (the page's
// headerActions), one copy control (the shell's), one row menu per Applet.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { APPLET_COLUMNS } from "./columns";
import { APPLET_LIST_SCOPES, appletRowHref, createAppletListService, type AppletListRow } from "./service";
import { useAppletRowActions } from "./useAppletRowActions";

export const appletListConfig: EntityListConfig<AppletListRow> = {
  surfaceKey: "applets-browse",
  registryToken: "app",
  entityLabel: { singular: "Applet", plural: "Applets" },
  sourceFeature: "agent-app",
  scopes: [...APPLET_LIST_SCOPES],
  lanes: { team: false },
  service: createAppletListService(),
  columns: APPLET_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: { sort: "updated_at", direction: "desc" },
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  getRowEntity: (row) => ({ type: "app", id: row.id, title: row.name }),
  door: { hrefFor: (row) => (row.archived ? undefined : appletRowHref(row)) },
  useRowActions: useAppletRowActions,
  supportsArchived: true,
  facetSections: [],
  searchPlaceholder: "Search Applets…",
  copy: {
    label: "Applet",
    listLabel: "Applets",
    location: "/applets",
    rowKind: "agent_app",
    listKind: "agent-app-list",
    humanRow: (row) =>
      `${row.name} — ${row.state.label}, ${row.total_executions} runs, edited ${formatRelativeTime(row.updated_at)}`,
    showToolbar: true,
  },
  // FIRST RUN (audit L1): a new person's All lane is empty — never strangers' public items — so the
  // shell says so and offers the two ways in (AppletsListPage's emptyAction); Public stays one click away.
  emptyState: {
    title: "No Applets yet",
    description: "Describe what you need, or start from a template.",
  },
};

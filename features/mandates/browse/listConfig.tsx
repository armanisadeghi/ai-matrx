"use client";

// features/agents/mandates/browse/listConfig.tsx
//
// /agents/mandates expressed as an entity-list config — the mandates browse
// surface of the 2026-08-26 rework (Arman's vision: canonical list template,
// real preset filters, three layouts; the detail work lives in the mandate
// workspace, reached via the window panel (row click) or the dedicated route
// (name anchor)). Vision + doctrine: features/agents/mandates/FEATURE.md.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { MANDATE_COLUMNS } from "./columns";
import { MandateBrowseCards } from "./MandateBrowseCards";
import { MandateBrowseRows } from "./MandateBrowseRows";
import {
  fetchMandateFacets,
  fetchMandateListPage,
  fetchMandateScopeCounts,
} from "./service";
import { useMandateRowActions } from "./useMandateRowActions";
import {
  MANDATE_LIST_SCOPES,
  mandateRoute,
  type MandateListRow,
} from "./types";

export const mandateListConfig: EntityListConfig<MandateListRow> = {
  surfaceKey: "agent-mandates",
  entityLabel: { singular: "mandate", plural: "mandates" },
  sourceFeature: "agents-other",
  // `mandate` is a registered entity token (agent.mandate) — Attach To rides
  // free; no resourceType (mandates are platform rows, never shared as
  // resources).
  getRowEntity: (row) => ({
    type: "mandate",
    id: row.id,
    title: row.label,
  }),
  // Platform rows: every caller sees the registry — ONE scope, tabs collapse.
  scopes: MANDATE_LIST_SCOPES,
  service: {
    fetchPage: fetchMandateListPage,
    fetchCounts: fetchMandateScopeCounts,
    fetchFacets: fetchMandateFacets,
  },
  columns: MANDATE_COLUMNS,
  prefsVersion: 1,
  getRowId: (row) => row.id,
  getRowName: (row) => row.label,
  // THE DOOR LAW: the Job cell is a real anchor onto the dedicated route.
  // Row CLICK opens the window panel instead (useMandateRowActions).
  door: { hrefFor: mandateRoute },
  useRowActions: useMandateRowActions,
  // No archived/favorite axes on agent.mandate; labels/contracts are
  // CODE-OWNED (sync rewrites them every aidream boot) so inline edit would
  // be a lie — none offered.
  supportsArchived: false,
  urlState: true,
  facetSections: [
    {
      facet: "feature",
      filterId: "feature",
      label: "Feature",
      noneLabel: "No feature",
      formatValue: (raw) => raw.replace(/_/g, " "),
    },
    {
      facet: "layer",
      filterId: "layer",
      label: "Decided by",
      noneLabel: "System",
      countInLabel: false,
      formatValue: (raw) =>
        raw === "user" ? "Yours" : raw === "org" ? "Organization" : "System",
    },
    {
      facet: "output_kind",
      filterId: "output_kind",
      label: "Output kind",
      noneLabel: "Unspecified",
    },
    {
      facet: "health",
      filterId: "health",
      label: "Status",
      noneLabel: "OK",
      countInLabel: false,
    },
  ],
  noneLabels: {
    output_kind: "Unspecified",
  },
  copy: {
    label: "Mandate",
    listLabel: "Mandates",
    location: "/agents/mandates",
    rowKind: "mandate-browse-row",
    listKind: "mandate-browse-list",
    rowDescription:
      "One mandate — a named job fulfilled by an interchangeable agent. Registry metadata plus the caller's own resolution.",
    listDescription:
      "The mandate registry as currently filtered and sorted, with per-caller resolution (who decides each job).",
    humanRow: (row) =>
      `${row.label} (${row.mandate_key}) — ${row.resolved_layer} · ` +
      `${row.resolved_agent_name ?? "no holder"}${row.drift ? ` · ${row.drift}` : ""}`,
    agentRow: (row) => ({
      id: row.id,
      mandate_key: row.mandate_key,
      label: row.label,
      description: row.description,
      feature: row.feature,
      provision_key: row.provision_key,
      offered_count: row.offered_count,
      output_kind: row.output_kind,
      resolved_layer: row.resolved_layer,
      resolved_agent_name: row.resolved_agent_name,
      drift: row.drift,
      health: row.health,
      href: mandateRoute(row),
    }),
    rowAttributes: (row) => ({
      id: row.id,
      key: row.mandate_key,
      label: row.label,
      layer: row.resolved_layer,
      health: row.health,
    }),
    listAttributes: (visible, all) => ({
      rows: visible.length,
      rows_total: all[0]?.total_count ?? visible.length,
    }),
  },
  views: {
    cards: (p) => <MandateBrowseCards {...p} />,
    rows: (p) => <MandateBrowseRows {...p} />,
  },
  emptyState: {
    title: "No mandates match",
    description:
      "Every named job the platform delegates to an agent appears here. Clear the filters to see the full registry.",
  },
};

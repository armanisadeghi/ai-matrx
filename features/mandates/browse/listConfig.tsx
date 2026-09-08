"use client";

// features/mandates/browse/listConfig.tsx
//
// /mandates expressed as an entity-list config — the mandates browse
// surface of the 2026-08-26 rework (Arman's vision: canonical list template,
// real preset filters, three layouts; the detail work lives in the mandate
// workspace, reached via the window panel (row click) or the dedicated route
// (name anchor)). Vision + doctrine: features/mandates/FEATURE.md.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { MANDATE_COLUMNS } from "./columns";
import { MandateBrowseCards } from "./MandateBrowseCards";
import { MandateBrowseRows } from "./MandateBrowseRows";
import { mandateListService } from "./service";
import { useMandateRowActions } from "./useMandateRowActions";
import {
  MANDATE_LIST_SCOPES,
  layerMeta,
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
  // OWNERSHIP tabs: the organizations the caller belongs to. `/mandates` adds
  // the platform's own corpus for an admin — a module constant cannot read who
  // is looking, so that subset is passed by the page.
  scopes: MANDATE_LIST_SCOPES,
  // Every host passes its own `service` (which home, whose ladder). This
  // default is the honest fallback: the blended corpus, resolved for the
  // caller with no active organization and therefore no org rung.
  service: mandateListService({
    kind: "homes",
    activeOrganizationId: null,
    organizations: [],
    canListSystemHome: false,
  }),
  columns: MANDATE_COLUMNS,
  // 2 — the Home column (FIX-R3/W1). Bumped so existing users get the new
  // default column set instead of silently never seeing it.
  prefsVersion: 2,
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
  // 🚨 THE ORGANIZATION SECTION IS THE OWNERSHIP AXIS, IN THE PANEL
  // (one-resolution FIX-R3/W1). It narrows `p_home` — the SAME state the
  // ownership tab's dropdown writes — so choosing an organization here re-asks
  // `mnd_list_scoped(p_home => 'org:<id>')`. Nothing is filtered in the
  // browser: a home is the door's decision and only the door's.
  //
  // It is NOT in `facetSections`, deliberately: a facet writes `p_filters`, and
  // a second way to say "whose mandates" would be a second answer to the one
  // question `p_home` owns.
  scopeSections: [
    {
      scope: "orgs",
      label: "Organization",
      allLabel: "All homes",
      hint: "Whose job it is. Choosing one organization shows only the jobs that organization added; All homes also includes the jobs the platform ships, so an organization's count never sums to it.",
    },
  ],
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
      // ONE naming of a rung, shared with every badge that renders one.
      formatValue: (raw) => layerMeta(raw).label,
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
    location: "/mandates",
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
      home_organization_id: row.home_organization_id,
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
      home: row.home_organization_id,
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

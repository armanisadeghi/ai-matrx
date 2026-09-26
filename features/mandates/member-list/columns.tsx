"use client";

// features/mandates/member-list/columns.tsx
//
// The non-admin mandate list's column registry. Default columns (owner's
// brief): Mandate · Feature · Key · Mandate Holder (the one that runs it for
// ME / for this org's members) · Customized by · Health · Updated. Everything
// else is `defaultHidden` and one click away in the column picker. No admin
// fact (code declarations, coverage, grades) has a column here.

import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  DATE_FILTER_OPTIONS,
  DATE_SORT_WORDS,
  Muted,
  TextCell,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { agentHref } from "@/features/mandates/admin/mandate-health";
import { cn } from "@/lib/utils";
import type { MandateMemberRow } from "./types";
import { MandateStatusControl } from "@/features/mandates/status/MandateStatusControl";
import { mandateStatusLabel } from "@/features/mandates/status/mandate-status";

type Spec = EntityColumnSpec<MandateMemberRow>;

/** Health words the database writes, and how loud each one is. */
const HEALTH_TONE: Record<string, string> = {
  OK: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  "Newer version available": "border-sky-500/40 text-sky-700 dark:text-sky-300",
  "Turned off": "border-border text-muted-foreground",
  "Nothing bound": "border-amber-500/40 text-amber-700 dark:text-amber-300",
  "Override set aside": "border-amber-500/40 text-amber-700 dark:text-amber-300",
  "Agent archived": "border-amber-500/40 text-amber-700 dark:text-amber-300",
  "Agent unavailable": "border-red-500/40 text-red-700 dark:text-red-300",
  "Output does not match": "border-red-500/40 text-red-700 dark:text-red-300",
};

/** What a person reads for the stored visibility (the four visibility lanes). */
export const VISIBILITY_WORDS: Record<string, string> = {
  personal: "Only me",
  internal: "My organization",
  link: "Anyone with the link",
  public: "Everyone",
};

const ORIGIN_WORDS: Record<string, string> = { code: "Built in", soft: "Custom" };

function facetColumn(
  id: string,
  label: string,
  width: number,
  cell: (row: MandateMemberRow) => React.ReactNode,
  extra: Partial<Spec> = {},
): Spec {
  return {
    id,
    label,
    facet: id,
    ...extra,
    column: {
      id,
      header: label,
      filter: "select",
      width,
      cell,
      ...(extra.column ?? {}),
    },
  };
}

function HolderCell({ row }: { row: MandateMemberRow }) {
  if (!row.holderId || row.holderName === "None") return <Muted>None</Muted>;
  if (row.holderType === "agent") {
    return (
      <EntityRef
        token="agent"
        id={row.holderId}
        name={row.holderName}
        href={agentHref(row.holderId, null)}
        showIcon={false}
      />
    );
  }
  if (row.holderType === "workflow") {
    // Workflow parity: a workflow holder is a record too — it opens.
    return (
      <EntityRef
        token="workflow"
        id={row.holderId}
        name={row.holderName}
        showIcon={false}
      />
    );
  }
  return <TextCell value={row.holderName} />;
}

export function MemberHealthBadge({ health }: { health: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", HEALTH_TONE[health] ?? "text-muted-foreground")}
    >
      {health}
    </Badge>
  );
}

export interface MemberColumnOptions {
  /** May this seat change the row's status? Absent = badge only. */
  canManage?: (row: MandateMemberRow) => boolean;
  /** Re-ask the list after a status change. */
  onChanged?: () => void;
}

export function memberMandateColumns(options: MemberColumnOptions = {}): Spec[] {
  return [
    {
      id: "name",
      label: "Mandate",
      locked: true,
      phone: "title",
      column: {
        id: "name",
        accessorKey: "name",
        header: "Mandate",
        filter: "text",
        width: 220,
        cell: (row) => (
          <span className="block truncate font-medium" title={row.name}>
            {row.name}
          </span>
        ),
      },
    },
    // THE STATUS, beside the name — draft vs active can never be missed.
    facetColumn(
      "status",
      "Status",
      120,
      (row) => (
        <MandateStatusControl
          mandateId={row.id}
          name={row.name}
          status={row.status}
          canManage={options.canManage?.(row) ?? false}
          onChanged={options.onChanged}
          size="sm"
        />
      ),
      {
        formatFacetValue: mandateStatusLabel,
        sortWords: { asc: "drafts first", desc: "active first" },
      },
    ),
    facetColumn("featureLabel", "Feature", 150, (row) => <TextCell value={row.featureLabel} />),
    // No Key column here: a member reads the Mandate's name, never its key
    // (owner ruling — the admin list's Key column is the one place a key shows).
    facetColumn("holderName", "Mandate Holder", 210, (row) => <HolderCell row={row} />),
    facetColumn("customizedBy", "Customized by", 160, (row) => (
      <span className="block truncate text-xs" title={row.customizedBy.join(", ")}>
        {row.customizedBy.join(", ")}
      </span>
    )),
    facetColumn("health", "Health", 170, (row) => <MemberHealthBadge health={row.health} />),
    {
      id: "updatedAt",
      label: "Updated",
      sortWords: DATE_SORT_WORDS,
      column: {
        id: "updatedAt",
        header: "Updated",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        width: 100,
        cell: (row) => timeCell(row.updatedAt),
      },
    },
    // ── Available, off by default ─────────────────────────────────────────
    facetColumn("decidedBy", "Decided by", 140, (row) => <TextCell value={row.decidedBy} />, {
      defaultHidden: true,
    }),
    facetColumn(
      "pinText",
      "Version",
      90,
      (row) => (
        <Badge variant={row.pinText === "Latest" ? "secondary" : "outline"}>{row.pinText}</Badge>
      ),
      { defaultHidden: true },
    ),
    facetColumn("homeLabel", "Owner", 140, (row) => <TextCell value={row.homeLabel} />, {
      defaultHidden: true,
    }),
    facetColumn(
      "origin",
      "Type",
      90,
      (row) => <span className="text-xs">{ORIGIN_WORDS[row.origin] ?? row.origin}</span>,
      { defaultHidden: true, formatFacetValue: (v: string) => ORIGIN_WORDS[v] ?? v },
    ),
    facetColumn(
      "visibility",
      "Visible to",
      130,
      (row) => <span className="text-xs">{VISIBILITY_WORDS[row.visibility] ?? row.visibility}</span>,
      { defaultHidden: true, formatFacetValue: (v: string) => VISIBILITY_WORDS[v] ?? v },
    ),
    {
      id: "isEnabled",
      label: "Enabled",
      defaultHidden: true,
      column: {
        id: "isEnabled",
        header: "Enabled",
        filter: "boolean",
        align: "center",
        width: 80,
        cell: (row) => (row.isEnabled ? <span className="text-xs">Yes</span> : <Muted>Off</Muted>),
      },
    },
    {
      id: "goal",
      label: "Goal",
      defaultHidden: true,
      column: {
        id: "goal",
        header: "Goal",
        filter: "text",
        width: 280,
        cell: (row) => <TextCell value={row.goal} />,
      },
    },
    {
      id: "createdAt",
      label: "Created",
      defaultHidden: true,
      sortWords: DATE_SORT_WORDS,
      column: {
        id: "createdAt",
        header: "Created",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        width: 100,
        cell: (row) => timeCell(row.createdAt),
      },
    },
  ];
}

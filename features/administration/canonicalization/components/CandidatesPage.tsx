"use client";

/**
 * features/administration/canonicalization/components/CandidatesPage.tsx
 *
 * Migration backlog: `audit.m2m_candidates`, `audit.unregistered_candidates`,
 * `audit.stale_registry`. Rendered as a single full-height table at a time
 * behind a button-group switcher (not a shadcn <Tabs>) so mobile keeps one
 * scroll area per view while desktop still gets full vertical space per table.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AdminAuditTable, type AuditColumnDef } from "./AdminAuditTable";
import { CanonicalizationToolbar } from "./CanonicalizationToolbar";
import { BoolBadge } from "./StatusBadge";
import { useAuditDataset } from "../hooks/useAuditDataset";
import type {
  M2mCandidateRow,
  StaleRegistryRow,
  UnregisteredCandidateRow,
} from "../types";

type CandidateView = "m2m" | "unregistered" | "stale";

export function CandidatesPage() {
  const [view, setView] = useState<CandidateView>("m2m");

  const m2m = useAuditDataset<M2mCandidateRow>("m2m-candidates");
  const unregistered = useAuditDataset<UnregisteredCandidateRow>(
    "unregistered-candidates",
  );
  const stale = useAuditDataset<StaleRegistryRow>("stale-registry");

  const m2mColumns: AuditColumnDef<M2mCandidateRow>[] = useMemo(
    () => [
      {
        key: "schema_name",
        label: "Schema",
        type: "text",
        getValue: (r) => r.schema_name,
        width: "140px",
      },
      {
        key: "table_name",
        label: "Table",
        type: "text",
        getValue: (r) => r.table_name,
        width: "220px",
        copyable: true,
      },
      {
        key: "registered",
        label: "Registered",
        type: "enum",
        getValue: (r) => String(r.registered),
        width: "120px",
        render: (r) => (
          <BoolBadge value={r.registered} trueLabel="Yes" falseLabel="No" />
        ),
      },
      {
        key: "entity_fk_count",
        label: "Entity FKs",
        type: "number",
        getValue: (r) => r.entity_fk_count,
        width: "100px",
        align: "right",
      },
      {
        key: "fk_targets",
        label: "FK targets",
        type: "text",
        getValue: (r) => r.fk_targets,
        width: "minmax(240px, 1fr)",
        noValueList: true,
      },
      {
        key: "payload_cols",
        label: "Payload cols",
        type: "number",
        getValue: (r) => r.payload_cols,
        width: "110px",
        align: "right",
      },
    ],
    [],
  );

  const unregisteredColumns: AuditColumnDef<UnregisteredCandidateRow>[] =
    useMemo(
      () => [
        {
          key: "schema_name",
          label: "Schema",
          type: "text",
          getValue: (r) => r.schema_name,
          width: "160px",
        },
        {
          key: "table_name",
          label: "Table",
          type: "text",
          getValue: (r) => r.table_name,
          width: "260px",
          copyable: true,
        },
        {
          key: "base_col_score",
          label: "Base col score",
          type: "number",
          getValue: (r) => r.base_col_score,
          width: "130px",
          align: "right",
        },
        {
          key: "has_id_uuid",
          label: "id uuid?",
          type: "enum",
          getValue: (r) => String(r.has_id_uuid),
          width: "110px",
          render: (r) => <BoolBadge value={r.has_id_uuid} />,
        },
        {
          key: "has_created_at",
          label: "created_at?",
          type: "enum",
          getValue: (r) => String(r.has_created_at),
          width: "120px",
          render: (r) => <BoolBadge value={r.has_created_at} />,
        },
      ],
      [],
    );

  const staleColumns: AuditColumnDef<StaleRegistryRow>[] = useMemo(
    () => [
      {
        key: "token",
        label: "Token",
        type: "text",
        getValue: (r) => r.token,
        width: "220px",
        monospace: true,
        copyable: true,
      },
      {
        key: "schema_name",
        label: "Registered schema",
        type: "text",
        getValue: (r) => r.schema_name,
        width: "200px",
      },
      {
        key: "table_name",
        label: "Registered table",
        type: "text",
        getValue: (r) => r.table_name,
        width: "220px",
      },
    ],
    [],
  );

  const views: { id: CandidateView; label: string; count: number }[] = [
    { id: "m2m", label: "M2M candidates", count: m2m.rows.length },
    {
      id: "unregistered",
      label: "Unregistered",
      count: unregistered.rows.length,
    },
    { id: "stale", label: "Stale registry", count: stale.rows.length },
  ];

  const active =
    view === "m2m" ? m2m : view === "unregistered" ? unregistered : stale;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CanonicalizationToolbar onReload={active.reload} reloading={active.loading} />

      <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3">
        {views.map((v) => (
          <Button
            key={v.id}
            size="sm"
            variant={view === v.id ? "default" : "outline"}
            onClick={() => setView(v.id)}
            className={cn("h-8")}
          >
            {v.label}
            <span className="ml-1.5 tabular-nums opacity-70">{v.count}</span>
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        {view === "m2m" ? (
          <AdminAuditTable
            rows={m2m.rows}
            columns={m2mColumns}
            loading={m2m.loading}
            csvFilename="canonicalization-m2m-candidates.csv"
            defaultSort={{ key: "payload_cols", dir: "asc" }}
            emptyMessage="No M2M candidates found."
          />
        ) : view === "unregistered" ? (
          <AdminAuditTable
            rows={unregistered.rows}
            columns={unregisteredColumns}
            loading={unregistered.loading}
            csvFilename="canonicalization-unregistered-candidates.csv"
            defaultSort={{ key: "base_col_score", dir: "desc" }}
            emptyMessage="No unregistered candidates found."
          />
        ) : (
          <AdminAuditTable
            rows={stale.rows}
            columns={staleColumns}
            loading={stale.loading}
            csvFilename="canonicalization-stale-registry.csv"
            defaultSort={{ key: "token", dir: "asc" }}
            emptyMessage="No stale registry rows found."
          />
        )}
      </div>
    </div>
  );
}

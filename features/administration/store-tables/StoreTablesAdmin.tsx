"use client";

// features/administration/store-tables/StoreTablesAdmin.tsx — THE ADMIN LIST OF STORE TABLES.
//
// /administration/database/store-tables (lane ONE-HOME, wave 6). Every table in the organizations the
// admin lane reaches — the admin's memberships plus the system organizations the store's wall admits a
// super admin to ON THE ADMIN LANE ONLY (iam.has_org_access_for) — with one bulk action, Archive.
//
// READS, through @ai-matrx/records as the signed-in person (the browser client stamps
// `x-matrx-admin-lane: 1` on /administration/**; no service role):
//   · member organizations → `dataHomeTables(org | null)` (`custom.data_home_tables`) — one call;
//   · system organizations → `tableList()` in that organization (the Table kernel, every page),
//     since data_home_tables walks memberships only and a system organization has no members.
// WRITES: `archiveTables` → the package's `tableArchive`, per table (see archiveTables.ts).
// This file never calls a store door itself (Guard 7, `pnpm check:no-custom-store-code`).
//
// Filters live in the address: `?org_filter=` (the platform organization filter, default All — never
// the active organization) and `?name=` (name contains). "Select all" takes every selectable row the
// filters leave, so a filtered set is archived in one action.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, ListChecks, X } from "lucide-react";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { stringUrlCodec, useUrlState } from "@ai-matrx/kit/url-state";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import {
  archiveTables,
  documentIsKept,
  nameMatches,
  protectionOf,
  type ArchiveOutcome,
  type DoorAnswer,
  type ProtectionReason,
  type StoreTableRow,
  type TableArchiveDoor,
} from "./archiveTables";

const PROTECTION_LABEL: Record<Exclude<ProtectionReason, null>, string> = {
  kept: "Kept by the app",
  "named-in-code": "Named in code",
  "platform-example": "Platform example",
};

/** The records client for one organization, or for every organization the person reaches (null). */
function recordsIn(organizationId: string | null): RecordsClient {
  return createRecordsClient({
    dataSource: recordsDataSource(createClient()),
    actor: personActor(null),
    organizationId,
  });
}

async function readMemberTables(orgId: string | null): Promise<StoreTableRow[]> {
  // An admin list sees every table, the app's own for agents' outputs included (CHAIR-DOORS-2).
  const answer = await recordsIn(null).dataHomeTables({ organization_id: orgId, include_app_tables: true });
  if (!answer.ok) throw new Error(answer.error.message);
  return answer.data.map((r) => ({
    id: r.table_id,
    name: r.table_name,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    updatedAt: r.updated_at,
    system: r.system === true,
    keptByTheApp: r.kept_by_the_app,
  }));
}

async function readSystemTables(org: { id: string; name: string }): Promise<StoreTableRow[]> {
  const answer = await recordsIn(org.id).tableList();
  if (!answer.ok) throw new Error(`${org.name}: ${answer.error.message}`);
  return answer.data.map((table) => ({
    id: table.id,
    name: typeof table.name === "string" && table.name.trim() ? table.name : "Untitled table",
    organizationId: org.id,
    organizationName: org.name,
    updatedAt: null,
    system: true,
    keptByTheApp: documentIsKept(table as unknown as Record<string, unknown>),
  }));
}

const tableArchiveDoor: TableArchiveDoor = async (args) => {
  const answer = await recordsIn(args.p_organization_id).tableArchive({
    table_id: args.p_table_id,
    chunk: args.p_chunk,
    includeTable: args.p_include_table,
  });
  if (!answer.ok) return { ok: false, error: { message: answer.error.message, code: answer.error.code } };
  return { ok: true, data: answer.data } as DoorAnswer;
};

export function StoreTablesAdmin() {
  const [orgId, setOrgId] = useOrgFilterParam([]);
  const [name, setName] = useUrlState("name", stringUrlCodec());
  const { organizations: memberships, loading: membershipsLoading } = useUserOrganizations();
  const [systemOrgs, setSystemOrgs] = useState<{ id: string; name: string }[] | null>(null);
  const [rows, setRows] = useState<StoreTableRow[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [refusals, setRefusals] = useState<Extract<ArchiveOutcome, { status: "refused" }>[]>([]);

  // The system organizations the store's wall admits a super admin to on this lane.
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await (createClient() as unknown as SupabaseClient)
        .schema("iam")
        .from("organizations")
        .select("id, name")
        .eq("is_system", true)
        .is("archived_at", null);
      if (!live) return;
      if (error) {
        setReadError(error.message);
        setSystemOrgs([]);
        return;
      }
      setSystemOrgs(((data ?? []) as { id: string; name: string | null }[]).map((o) => ({ id: o.id, name: o.name ?? "System" })));
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (systemOrgs === null || membershipsLoading) return;
    let live = true;
    void (async () => {
      await Promise.resolve();
      if (!live) return;
      setFetching(true);
      setReadError(null);
      try {
        const memberIds = new Set(memberships.map((m) => m.id));
        const systemTargets = systemOrgs.filter((o) => !memberIds.has(o.id) && (!orgId || o.id === orgId));
        const wantMembers = !orgId || memberIds.has(orgId);
        const parts = await Promise.all([
          wantMembers ? readMemberTables(orgId) : Promise.resolve([]),
          ...systemTargets.map((o) => readSystemTables(o)),
        ]);
        if (live) setRows(parts.flat().sort((a, b) => a.organizationName.localeCompare(b.organizationName) || a.name.localeCompare(b.name)));
      } catch (e) {
        if (live) {
          setRows([]);
          setReadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (live) setFetching(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [orgId, systemOrgs, memberships, membershipsLoading, nonce]);

  const shown = useMemo(() => (rows ?? []).filter((r) => nameMatches(r, name ?? "")), [rows, name]);
  const selectable = useMemo(() => shown.filter((r) => protectionOf(r) === null), [shown]);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r] as const)), [rows]);
  const selectedRows = selectedIds.map((id) => byId.get(id)).filter((r): r is StoreTableRow => Boolean(r));

  const runArchive = useCallback(async () => {
    const targets = selectedRows.map((r) => ({ tableId: r.id, organizationId: r.organizationId, name: r.name }));
    setRunning({ done: 0, total: targets.length });
    const outcomes = await archiveTables(targets, tableArchiveDoor, (done, total) => setRunning({ done, total }));
    const refused = outcomes.filter((o): o is Extract<ArchiveOutcome, { status: "refused" }> => o.status === "refused");
    const archived = outcomes.length - refused.length;
    setRunning(null);
    setConfirming(false);
    setRefusals(refused);
    setSelectedIds(refused.map((o) => o.target.tableId));
    if (archived > 0) toast.success(`${archived} ${archived === 1 ? "table" : "tables"} moved to Trash`);
    if (refused.length > 0) toast.error(`${refused.length} ${refused.length === 1 ? "table was" : "tables were"} not archived`);
    setNonce((n) => n + 1);
  }, [selectedRows]);

  const columns: MatrxColumnDef<StoreTableRow>[] = [
    { id: "name", header: "Table", width: 320, accessorFn: (r) => r.name, cell: (r) => <span className="block truncate">{r.name}</span> },
    { id: "organization", header: "Organization", width: 240, accessorFn: (r) => r.organizationName, cell: (r) => <span className="block truncate">{r.organizationName}</span> },
    {
      id: "kept",
      header: "Kept",
      width: 150,
      accessorFn: (r) => {
        const reason = protectionOf(r);
        return reason ? PROTECTION_LABEL[reason] : "";
      },
      cell: (r) => {
        const reason = protectionOf(r);
        return reason ? <Badge variant="outline" className="text-muted-foreground">{PROTECTION_LABEL[reason]}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
    { id: "updated", header: "Updated", width: 170, accessorFn: (r) => r.updatedAt ?? "", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}</span> },
  ];

  const count = selectedRows.length;
  const tablesWord = count === 1 ? "table" : "tables";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      {refusals.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-2 font-medium">
              <span>
                {refusals.length} {refusals.length === 1 ? "table was" : "tables were"} not archived
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Dismiss" onClick={() => setRefusals([])}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ul className="space-y-0.5" data-store-tables-refusals="">
              {refusals.map((o) => (
                <li key={o.target.tableId}>
                  <span className="font-medium">{o.target.name}</span>: {o.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <MatrxDataTable
        tableId="admin-store-tables"
        data={shown}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={rows === null}
        isFetching={fetching}
        read={{ status: rows === null ? "loading" : readError ? "error" : "ready", error: readError, onRetry: () => setNonce((n) => n + 1), what: "tables" }}
        emptyState={{ title: "No tables match" }}
        detail={{ enabled: false }}
        coverage={{ noun: "table", total: shown.length, answeredBy: "client" }}
        toolbar={{
          title: "Store tables",
          customSearch: (
            <input
              value={name ?? ""}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name contains…"
              aria-label="Name contains"
              className="h-8 w-48 rounded-md border border-border bg-background px-2 text-base lg:text-xs"
            />
          ),
          refresh: { onRefresh: () => setNonce((n) => n + 1) },
          actions: (
            <>
              <EntityOrgFilter orgId={orgId} onChange={setOrgId} extraOrganizations={systemOrgs ?? []} />
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={selectable.length === 0 || readError !== null}
                onClick={() => setSelectedIds(selectable.map((r) => r.id))}
              >
                <ListChecks className="mr-1 h-3.5 w-3.5" />
                Select all{readError === null ? ` ${selectable.length}` : ""}
              </Button>
            </>
          ),
        }}
        selection={{
          selectedIds,
          onSelectedIdsChange: setSelectedIds,
          isRowSelectable: (r) => protectionOf(r) === null,
          noun: "table",
          actions: () => (
            <Button variant="destructive" size="sm" className="h-8" onClick={() => setConfirming(true)}>
              <Archive className="mr-1 h-3.5 w-3.5" />
              Archive
            </Button>
          ),
        }}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!running) setConfirming(open);
        }}
        title={`Archive ${count} ${tablesWord}?`}
        description={`${count} ${tablesWord} and every record in them go to Trash, where each can be restored.`}
        confirmLabel={running ? `Archiving ${running.done} of ${running.total}…` : `Archive ${count} ${tablesWord}`}
        variant="destructive"
        busy={running !== null}
        onConfirm={() => void runArchive()}
      />
    </div>
  );
}

"use client";

// features/administration/custom-tables/CustomTablesAdmin.tsx — THE ADMIN LIST OF CUSTOM TABLES.
//
// /administration/database/custom-tables (lane ONE-HOME, wave 6). Every table in the organizations the
// admin lane reaches — the admin's memberships plus the system organizations the store's wall admits a
// super admin to ON THE ADMIN LANE ONLY (iam.has_org_access_for) — with one bulk action, Archive, and a
// "Test orgs" menu that marks organizations as test fixtures (TestOrgsMenu.tsx).
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
// the active organization) and `?name=` (name contains). "Select all" takes every row these
// filters leave for copy; Archive narrows that selection to the existing eligible targets.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, ListChecks, Lock, X } from "lucide-react";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { stringUrlCodec, useUrlState } from "@ai-matrx/kit/url-state";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  filterRows,
  keepVisibleSelection,
  protectionOf,
  type ArchiveOutcome,
  type DoorAnswer,
  type ProtectionReason,
  type CustomTableRow,
  type TableArchiveDoor,
} from "./archiveTables";
import { TestOrgsMenu } from "./TestOrgsMenu";

// A short state label per reason, the reason itself in the tooltip (interface-text: honesty is state).
const PROTECTION: Record<Exclude<ProtectionReason, null>, { label: string; tip: string }> = {
  kept: { label: "Kept", tip: "The app keeps this table" },
  "named-in-code": { label: "In use", tip: "Used by the app" },
  "platform-example": { label: "Example", tip: "A platform example table" },
};

/** The records client for one organization, or for every organization the person reaches (null). */
function recordsIn(organizationId: string | null): RecordsClient {
  return createRecordsClient({
    dataSource: recordsDataSource(createClient()),
    actor: personActor(null),
    organizationId,
  });
}

async function readMemberTables(orgId: string | null): Promise<CustomTableRow[]> {
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
    platformOwned: r.kept_by_the_app,
  }));
}

async function readSystemTables(org: { id: string; name: string }): Promise<CustomTableRow[]> {
  const answer = await recordsIn(org.id).tableList();
  if (!answer.ok) throw new Error(`${org.name}: ${answer.error.message}`);
  return answer.data.map((table) => ({
    id: table.id,
    name: typeof table.name === "string" && table.name.trim() ? table.name : "Untitled table",
    organizationId: org.id,
    organizationName: org.name,
    updatedAt: null,
    system: true,
    platformOwned: documentIsKept(table as unknown as Record<string, unknown>),
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

export function CustomTablesAdmin() {
  const [orgId, setOrgId] = useOrgFilterParam([]);
  const [name, setName] = useUrlState("name", stringUrlCodec());
  const { organizations: memberships, loading: membershipsLoading } = useUserOrganizations();
  const [systemOrgs, setSystemOrgs] = useState<{ id: string; name: string }[] | null>(null);
  const [rows, setRows] = useState<CustomTableRow[] | null>(null);
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

  // The organization filter applies to the rows on screen at once, so rows of the previous
  // organization never linger (and stay selectable) while the new read is in flight.
  const shown = useMemo(() => filterRows(rows ?? [], orgId, name ?? ""), [rows, orgId, name]);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r] as const)), [rows]);
  // A filter change drops selected rows it now hides (the setters below); this second wall keeps the
  // confirm and the archive to visible rows even when the address changes another way (back button).
  const visibleSelectedIds = useMemo(() => keepVisibleSelection(selectedIds, shown), [selectedIds, shown]);
  const selectedRows = visibleSelectedIds.map((id) => byId.get(id)).filter((r): r is CustomTableRow => Boolean(r));
  // Copy selection includes every visible table; only archive targets use keeper rules.
  const archiveRows = selectedRows.filter((row) => protectionOf(row) === null);

  const changeOrg = useCallback(
    (next: string | null) => {
      setOrgId(next);
      setSelectedIds((prev) => keepVisibleSelection(prev, filterRows(rows ?? [], next, name ?? "")));
    },
    [setOrgId, rows, name],
  );
  const changeName = useCallback(
    (next: string) => {
      setName(next);
      setSelectedIds((prev) => keepVisibleSelection(prev, filterRows(rows ?? [], orgId, next)));
    },
    [setName, rows, orgId],
  );

  const runArchive = useCallback(async () => {
    const targets = archiveRows.map((r) => ({ tableId: r.id, organizationId: r.organizationId, name: r.name }));
    if (targets.length === 0) return;
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
  }, [archiveRows]);

  const columns: MatrxColumnDef<CustomTableRow>[] = [
    { id: "name", header: "Table", width: 320, accessorFn: (r) => r.name, cell: (r) => <span className="block truncate">{r.name}</span> },
    { id: "organization", header: "Organization", width: 240, accessorFn: (r) => r.organizationName, cell: (r) => <span className="block truncate">{r.organizationName}</span> },
    {
      id: "kept",
      header: "Kept",
      width: 150,
      accessorFn: (r) => {
        const reason = protectionOf(r);
        return reason ? PROTECTION[reason].label : "";
      },
      cell: (r) => {
        const reason = protectionOf(r);
        if (!reason) return <span className="text-muted-foreground">—</span>;
        const { label, tip } = PROTECTION[reason];
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-custom-tables-kept={reason}>
                  <Lock aria-hidden className="h-3.5 w-3.5" />
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent>{tip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    { id: "updated", header: "Updated", width: 170, accessorFn: (r) => r.updatedAt ?? "", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}</span> },
  ];

  const count = archiveRows.length;
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
              <Button icon={<X />} variant="quiet" aria-label="Dismiss" onClick={() => setRefusals([])} />
            </div>
            <ul className="space-y-0.5" data-custom-tables-refusals="">
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
        tableId="admin-custom-tables"
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
          title: "Custom tables",
          customSearch: (
            <input
              value={name ?? ""}
              onChange={(e) => changeName(e.target.value)}
              placeholder="Name contains…"
              aria-label="Name contains"
              className="h-8 w-48 rounded-md border border-border bg-background px-2 text-base lg:text-xs"
            />
          ),
          refresh: { onRefresh: () => setNonce((n) => n + 1) },
          actions: (
            <>
              <EntityOrgFilter orgId={orgId} onChange={changeOrg} extraOrganizations={systemOrgs ?? []} />
              <TestOrgsMenu />
              <Button
                icon={<ListChecks />}
                variant="outline"
                disabled={shown.length === 0 || readError !== null}
                onClick={() => setSelectedIds(shown.map((r) => r.id))}
              >
                Select all{readError === null ? ` ${shown.length}` : ""}
              </Button>
            </>
          ),
        }}
        selection={{
          selectedIds: visibleSelectedIds,
          onSelectedIdsChange: setSelectedIds,
          noun: "table",
          actions: () => (
            <Button icon={<Archive />} variant="danger" disabled={count === 0 || running !== null || readError !== null} onClick={() => setConfirming(true)}>
              Archive {count}
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

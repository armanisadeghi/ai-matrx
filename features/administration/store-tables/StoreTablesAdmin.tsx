"use client";

// features/administration/store-tables/StoreTablesAdmin.tsx — THE ADMIN LIST OF STORE TABLES.
//
// /administration/database/store-tables (lane ONE-HOME, wave 6). Every table in the organizations the
// admin lane reaches — the admin's memberships plus the system organizations the store's wall admits a
// super admin to ON THE ADMIN LANE ONLY (iam.has_org_access_for) — with one bulk action, Archive.
//
// READS, through the store's own doors as the signed-in person (the browser client stamps
// `x-matrx-admin-lane: 1` on /administration/**; no service role):
//   · member organizations → `custom.data_home_tables(org | null)` — one call for all of them;
//   · system organizations → `custom.read_records(org, <Table kernel>)`, since data_home_tables walks
//     memberships only and a system organization has no members.
// WRITES: `archiveTables` → `custom.table_archive`, per table (see archiveTables.ts).
//
// Filters live in the address: `?org_filter=` (the platform organization filter, default All — never
// the active organization) and `?name=` (name contains). "Select all" takes every selectable row the
// filters leave, so a filtered set is archived in one action.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, ListChecks, X } from "lucide-react";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { stringUrlCodec, useUrlState } from "@ai-matrx/kit/url-state";
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

const READ_PAGE = 1000;

const PROTECTION_LABEL: Record<Exclude<ProtectionReason, null>, string> = {
  kept: "Kept by the app",
  "named-in-code": "Named in code",
  "platform-example": "Platform example",
};

function customSchema() {
  return (createClient() as unknown as SupabaseClient).schema("custom");
}

interface HomeRow {
  table_id: string;
  table_name: string;
  organization_id: string;
  organization_name: string;
  updated_at: string | null;
  kept_by_the_app: boolean;
  system: boolean;
}

async function readMemberTables(orgId: string | null): Promise<StoreTableRow[]> {
  const { data, error } = await customSchema().rpc(
    "data_home_tables",
    orgId ? { p_organization_id: orgId } : {},
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as HomeRow[]).map((r) => ({
    id: r.table_id,
    name: r.table_name,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    updatedAt: r.updated_at,
    system: r.system,
    keptByTheApp: r.kept_by_the_app,
  }));
}

async function readSystemTables(org: { id: string; name: string }, kernelId: string): Promise<StoreTableRow[]> {
  const rows: StoreTableRow[] = [];
  for (let offset = 0; ; offset += READ_PAGE) {
    const { data, error } = await customSchema().rpc("read_records", {
      p_organization_id: org.id,
      p_table_id: kernelId,
      p_by_id: false,
      p_limit: READ_PAGE,
      p_offset: offset,
    });
    if (error) throw new Error(`${org.name}: ${error.message}`);
    const page = (data ?? []) as { id: string; document: Record<string, unknown> | null }[];
    for (const r of page) {
      const doc = r.document ?? {};
      rows.push({
        id: r.id,
        name: typeof doc.name === "string" && doc.name.trim() ? doc.name : "Untitled table",
        organizationId: org.id,
        organizationName: org.name,
        updatedAt: null,
        system: true,
        keptByTheApp: documentIsKept(doc),
      });
    }
    if (page.length < READ_PAGE) return rows;
  }
}

const tableArchiveDoor: TableArchiveDoor = async (args) => {
  const { data, error } = await customSchema().rpc("table_archive", args);
  if (error) return { ok: false, error: { message: error.message, code: error.code } };
  return { ok: true, data } as DoorAnswer;
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
        const kernel = systemTargets.length
          ? await customSchema().rpc("table_kernel_id")
          : { data: null, error: null };
        if (kernel.error) throw new Error(kernel.error.message);
        const parts = await Promise.all([
          wantMembers ? readMemberTables(orgId) : Promise.resolve([]),
          ...systemTargets.map((o) => readSystemTables(o, kernel.data as string)),
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

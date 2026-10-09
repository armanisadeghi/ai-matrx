"use client";

// features/data-tables/pick-lists/components/PickListsIndex.tsx — THE PICK LISTS PAGE (lane HANDOVER, 2026-09-27).
//
// Every pick list the person can open, across ALL their organizations, read through THE LIST INDEX
// (`pick-list-index.ts`, one store door), with New pick list first, a search box, the organization
// filter (All organizations by default, `?org_filter=`), and the archive under the list when one
// organization is filtered. The active organization never narrows the list — it is only where a
// NEW pick list is saved (active-org-is-never-a-list-filter law). A row opens the list at its one address,
// `/pick-lists/<id>`, which decides where the list lives and edits it there. This page edits nothing
// itself and reads nothing from the older tables.
//
// Champion: Linear's project list — the list is the page, one create control above it, the filter
// on the same row as the scope, the archive one click away under the list.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { ArchivedDisclosure, RecordsMount } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource, RecordsError } from "@ai-matrx/records";
import { BasicInput, Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";

import { supabase } from "@/utils/supabase/client";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { withOrganizationRefusalShown } from "@ai-matrx/chat/host/org";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";
import { ArchivedTablesList, type ArchivedTable } from "@/features/unified-data/hub/ArchivedTablesList";
import { restoreTableIn, tableKernelId } from "@/features/unified-data/hub/doors";
import { createList } from "../service";
import { listAddress } from "../where-lists-live";
import { readPickListIndex, type PickListEntry } from "../pick-list-index";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

type IndexState =
  | { phase: "reading" }
  | { phase: "read"; lists: PickListEntry[]; archivedIds: string[] }
  | { phase: "failed"; why: string };

/** "27 Sep, 09:16" — the way a person says it. */
function when(at: string | null): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export interface PickListsIndexProps {
  /** The ACTIVE organization's name — only for the "Made in …" hint beside New pick list. */
  organizationName: string | null;
  userId: string;
  /** The page's one data seam (the archive's records client binds to it). */
  dataSource: RecordsDataSource;
}

export function PickListsIndex({ organizationName, userId, dataSource }: PickListsIndexProps) {
  const router = useRouter();
  // The organization FILTER: a visible control, URL-backed, All organizations by default. It is
  // never the active organization (that one is only where a new pick list is saved).
  const [orgFilter, setOrgFilter] = useOrgFilterParam();
  const recordsConfig = useAppRecordsConfig(orgFilter ?? null);
  const [state, setState] = useState<IndexState>({ phase: "reading" });
  const [filter, setFilter] = useState("");
  const [reread, setReread] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ phase: "reading" });
    void (async () => {
      const answered = await readPickListIndex(
        supabase,
        orgFilter ? { organizationId: orgFilter } : { everywhere: true },
      );
      if (!alive) return;
      if (!answered.ok) {
        setState({ phase: "failed", why: answered.why });
        return;
      }
      setState({ phase: "read", lists: answered.lists, archivedIds: answered.archivedIds });
    })();
    return () => {
      alive = false;
    };
  }, [orgFilter, reread]);

  // ── New pick list ──────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setCreateError(null);
    try {
      // A NEW pick list is saved in the active organization (held and asked when none is set).
      const made = (await createList({
        p_list_name: trimmed,
        p_user_id: userId,
        // org-filter: write-target writes into the organization the person is working in; no list reads it
        p_organization_id: await withOrganizationRefusalShown("created", () => ensureOrgId(null)),
        p_items: [],
      })) as { list_id?: string; id?: string } | null;
      const id = made?.list_id ?? made?.id;
      if (!id) throw new Error("The list was made but its address did not come back — it is on this page after a refresh.");
      router.push(listAddress(id));
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const needle = filter.trim().toLowerCase();
  const shown =
    state.phase !== "read"
      ? []
      : needle
        ? state.lists.filter((l) => `${l.listName} ${l.description ?? ""}`.toLowerCase().includes(needle))
        : state.lists;

  return (
    <div className="space-y-4" data-pick-lists-index>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <BasicInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a pick list"
          aria-label="Find a pick list"
          className="h-7 w-56 max-w-full text-base sm:text-xs"
        />
        <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} />
      </div>

      {/* MAKING ONE, FIRST (the data home's own rule): one create control, above the list. */}
      <div className="flex flex-wrap items-center gap-2">
          {creating ? (
            <>
              <BasicInput
                autoFocus
                value={name}
                placeholder="Pick list name"
                aria-label="Pick list name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") setCreating(false);
                }}
                className="h-8 max-w-xs text-base sm:text-sm"
              />
              <Button variant="primary" disabled={busy || name.trim().length === 0} onClick={() => void create()}>
                {busy ? "Making it…" : "Create"}
              </Button>
              <Button variant="quiet" onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={() => setCreating(true)}>
                New pick list
              </Button>
              {organizationName ? (
                <span className="text-xs text-muted-foreground">Made in {organizationName}</span>
              ) : null}
            </>
          )}
          {createError ? (
            <p className="basis-full text-xs text-destructive">
              The pick list was not made: {createError} <ErrorAlchemyMenu error={createError} />
            </p>
          ) : null}
        </div>

      <section className="rounded-lg border border-border bg-card" aria-label="Pick lists">
        {state.phase === "reading" ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : state.phase === "failed" ? (
          <div className="flex flex-col items-start gap-2 p-3 text-xs">
            <p className="text-destructive">
              The pick lists could not be read, so nothing is listed — this is not an empty list. {state.why}{" "}
              <ErrorAlchemyMenu error={state.why} />
            </p>
            <Button variant="outline" onClick={() => setReread((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {filter.trim()
              ? `No pick list matches "${filter.trim()}".`
              : orgFilter
                ? "No pick lists in this organization yet. Press New pick list above."
                : "You have no pick lists in any organization yet."}
          </p>
        ) : (
          <ul>
            {shown.map((list) => (
              <li key={list.id} className="border-t border-border first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                  <ListChecks className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                  <Link
                    href={listAddress(list.id)}
                    className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {list.listName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                  </span>
                  {list.description ? (
                    <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{list.description}</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    {list.organizationName ? <span className="truncate">{list.organizationName}</span> : null}
                    {when(list.updatedAt) ? <span>{when(list.updatedAt)}</span> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The archive is one organization's (the store's archive door is bound to an
          organization), so it appears when the organization filter names one. */}
      {orgFilter && state.phase === "read" ? (
        <RecordsMount
          key={orgFilter}
          letTheStoreDecideRights
          config={recordsConfig}
          host={{ Link, density: "condensed", notify: RECORDS_NOTIFY }}
        >
          <PicklistsArchive
            dataSource={dataSource}
            archivedIds={state.archivedIds}
            reread={reread}
            onRestored={() => setReread((n) => n + 1)}
          />
        </RecordsMount>
      ) : null}
    </div>
  );
}

/** The archive under the list: names from the store's own archive door, narrowed to the ids the
 *  index says are archived pick lists of the filtered organization. */
function PicklistsArchive({
  dataSource,
  archivedIds,
  reread,
  onRestored,
}: {
  dataSource: RecordsDataSource;
  archivedIds: string[];
  reread: number;
  onRestored: () => void;
}) {
  const client = useRecordsClient();
  const [archived, setArchived] = useState<ArchivedTable[] | null>(null);
  const [archiveTrouble, setArchiveTrouble] = useState<string | null>(null);
  const idsKey = archivedIds.join(",");
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (archivedIds.length === 0) {
        setArchived([]);
        setArchiveTrouble(null);
        return;
      }
      const kernel = await tableKernelId(dataSource);
      if (!alive) return;
      if (!kernel.ok) {
        setArchiveTrouble(kernel.error.message);
        return;
      }
      const wanted = new Set(archivedIds);
      const rows: ArchivedTable[] = [];
      for (let page = 0; page < 50; page += 1) {
        const got = await client.listArchived({ table_id: kernel.data, lane: "org", limit: 100, offset: page * 100 });
        if (!alive) return;
        if (!got.ok) {
          setArchiveTrouble(got.error.message);
          return;
        }
        for (const row of got.data.rows) {
          if (!wanted.has(row.id)) continue;
          rows.push({
            id: row.id,
            name: (row.document as { name?: string } | null)?.name?.trim() || "Untitled list",
            archivedAt: row.archivedAt,
            archivedByName: row.archivedByName,
          });
        }
        if (got.data.total !== null) break;
      }
      setArchiveTrouble(null);
      setArchived(rows);
    })();
    return () => {
      alive = false;
    };
    // client and dataSource are the page's one seam, stable for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, dataSource, idsKey, reread]);

  const bringBack = async (listId: string): Promise<RecordsError | null> => {
    // A pick list is a Table: it comes back pass by pass (custom.table_restore, TABLE-ACTIONS).
    const org = client.config.organizationId;
    if (!org) {
      const unknownHome: RecordsError = { code: "internal", message: "Pick the list's organization to bring it back." };
      return unknownHome;
    }
    const answered = await restoreTableIn(client.config.dataSource, org, listId);
    if (!answered.ok) {
      const refused: RecordsError = {
        code: "internal",
        message: answered.error.message,
        ...(answered.error.hint ? { hint: answered.error.hint } : {}),
      };
      return refused;
    }
    onRestored();
    return null;
  };

  return (
    <section className="rounded-lg border border-border bg-card p-3" data-pick-lists-archive>
      {/* read-gate-exempt: count stays absent (ArchivedDisclosure then draws no number) until the archive read succeeds, and while it is in trouble */}
      <ArchivedDisclosure noun="pick lists" count={archiveTrouble ? undefined : archived?.length}>
        <ArchivedTablesList tables={archived} readTrouble={archiveTrouble} note={null} onBringBack={bringBack} />
      </ArchivedDisclosure>
    </section>
  );
}

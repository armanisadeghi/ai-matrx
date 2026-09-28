"use client";

// features/user-lists/components/PicklistsIndex.tsx — THE PICKLISTS PAGE (lane HANDOVER, 2026-09-27).
//
// Every picklist of the organization the person is working in, read through THE LIST INDEX
// (`pick-list-index.ts`, one store door), with New picklist first, a filter, the way to every
// organization's lists, and the archive under the list. A row opens the list at its one address,
// `/lists/<id>`, which decides where the list lives and edits it there. This page edits nothing
// itself and reads nothing from the older tables.
//
// Champion: Linear's project list — the list is the page, one create control above it, the filter
// on the same row as the scope, the archive one click away under the list.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { ArchivedDisclosure } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource, RecordsError } from "@ai-matrx/records";
import { BasicInput, Button, Skeleton } from "@ai-matrx/design-system";

import { supabase } from "@/utils/supabase/client";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { OrganizationScopeStrip } from "@/features/unified-data/hub/OrganizationScope";
import { ArchivedTablesList, type ArchivedTable } from "@/features/unified-data/hub/ArchivedTablesList";
import { tableKernelId } from "@/features/unified-data/hub/doors";
import { createList } from "../service";
import { listAddress } from "../where-lists-live";
import { readPickListIndex, type PickListEntry } from "../pick-list-index";

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

export interface PicklistsIndexProps {
  organizationId: string;
  organizationName: string | null;
  userId: string;
  /** The page's one data seam (the same one its RecordsMount is bound to). */
  dataSource: RecordsDataSource;
}

export function PicklistsIndex({ organizationId, organizationName, userId, dataSource }: PicklistsIndexProps) {
  const router = useRouter();
  const client = useRecordsClient();
  const [everywhere, setEverywhere] = useState(false);
  const [state, setState] = useState<IndexState>({ phase: "reading" });
  const [filter, setFilter] = useState("");
  const [reread, setReread] = useState(0);

  // ── the index, then the archive (names from the store's own archive door, narrowed to the
  //    ids the index says are archived picklists). One read per scope change, never per render. ──
  const [archived, setArchived] = useState<ArchivedTable[] | null>(null);
  const [archiveTrouble, setArchiveTrouble] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setState({ phase: "reading" });
    void (async () => {
      const answered = await readPickListIndex(supabase, everywhere ? { everywhere: true } : { organizationId });
      if (!alive) return;
      if (!answered.ok) {
        setState({ phase: "failed", why: answered.why });
        return;
      }
      setState({ phase: "read", lists: answered.lists, archivedIds: answered.archivedIds });
      if (everywhere) return;
      if (answered.archivedIds.length === 0) {
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
      const wanted = new Set(answered.archivedIds);
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
  }, [client, dataSource, organizationId, everywhere, reread]);

  const bringBack = async (listId: string): Promise<RecordsError | null> => {
    const answered = await client.recordRestore({ record_id: listId });
    if (!answered.ok) return answered.error;
    setReread((n) => n + 1);
    return null;
  };

  // ── New picklist ──────────────────────────────────────────────────────
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
      const made = (await createList({
        p_list_name: trimmed,
        p_user_id: userId,
        p_organization_id: organizationId,
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
    <div className="space-y-4" data-picklists-index>
      <OrganizationScopeStrip
        organizationName={organizationName}
        showingAll={everywhere}
        onShowAll={() => setEverywhere(true)}
        onShowOne={() => setEverywhere(false)}
        trailing={
          <BasicInput
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a picklist"
            aria-label="Find a picklist"
            className="h-7 w-56 max-w-full text-base sm:text-xs"
          />
        }
      />

      {/* MAKING ONE, FIRST (the data home's own rule): one create control, above the list. */}
      {everywhere ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {creating ? (
            <>
              <BasicInput
                autoFocus
                value={name}
                placeholder="Picklist name"
                aria-label="Picklist name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") setCreating(false);
                }}
                className="h-8 max-w-xs text-base sm:text-sm"
              />
              <Button size="sm" disabled={busy || name.trim().length === 0} onClick={() => void create()}>
                {busy ? "Making it…" : "Create"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setCreating(true)}>
              New picklist
            </Button>
          )}
          {createError ? (
            <p className="basis-full text-xs text-destructive">
              The picklist was not made: {createError} <ErrorAlchemyMenu error={createError} />
            </p>
          ) : null}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Picklists">
        {state.phase === "reading" ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : state.phase === "failed" ? (
          <div className="flex flex-col items-start gap-2 p-3 text-xs">
            <p className="text-destructive">
              The picklists could not be read, so nothing is listed — this is not an empty list. {state.why}{" "}
              <ErrorAlchemyMenu error={state.why} />
            </p>
            <Button size="sm" variant="outline" onClick={() => setReread((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {filter.trim()
              ? `No picklist matches "${filter.trim()}".`
              : everywhere
                ? "You have no picklists in any organization yet."
                : "No picklists here yet. Press New picklist above."}
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
                    {everywhere && list.organizationName ? <span className="truncate">{list.organizationName}</span> : null}
                    {when(list.updatedAt) ? <span>{when(list.updatedAt)}</span> : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {everywhere ? null : (
        <section className="rounded-lg border border-border bg-card p-3" data-picklists-archive>
          {/* read-gate-exempt: count stays absent (ArchivedDisclosure then draws no number) until the archive read succeeds, and while it is in trouble */}
          <ArchivedDisclosure noun="picklists" count={archiveTrouble ? undefined : archived?.length}>
            <ArchivedTablesList tables={archived} readTrouble={archiveTrouble} note={null} onBringBack={bringBack} />
          </ArchivedDisclosure>
        </section>
      )}
    </div>
  );
}

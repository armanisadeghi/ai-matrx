"use client";

/**
 * features/sources/hooks/useSources.ts
 *
 * The Sources list read (SOURCE-CONVERGENCE §8.1). Direct Supabase under RLS —
 * never a server list endpoint — with its scope DECLARED (THE VIEW LAW,
 * `lib/list-scope/types.ts`): RLS is the ceiling, the scope is the view.
 *
 *   mine → Sources I captured (`created_by = me`).
 *   orgs → every Source in the selected organization (a Source is organization
 *          data — Arman 2026-09-26; there is no per-Source privacy filter).
 *
 * PAGED: 100 rows at a time, newest first, with the Saved filter and the
 * search applied by the server (reading the whole list — 6,258 rows for admin
 * — took 7 requests and 10 s). Per-row stage and attached-to come from ONE
 * invoker RPC, `docproc.source_list_facts`, read for each page as it lists,
 * also under the caller's RLS. Organization names are read directly too.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  SOURCES_PAGE_SIZE,
  SOURCE_LIST_COLUMNS,
  appendSourcePage,
  applySourcesScope,
  SOURCE_LIST_ORDER_COLUMN,
  sourcesListFilter,
  listedSource,
  sourceFactsFromRow,
  factsPollDelayMs,
  indexingIds,
  type SourceFacts,
  type SourceFactsRow,
  type SourceListRow,
} from "@/features/sources/sourceRows";

export type SourcesScope =
  { kind: "mine" } | { kind: "orgs"; organizationId: string };

export interface UseSourcesResult {
  rows: SourceListRow[];
  /** Keyed by processed document id; absent = not read (yet, or failed). */
  facts: Map<string, SourceFacts>;
  orgNames: Map<string, string>;
  /** The organization-name read failed: labels say so instead of a vague stand-in. */
  orgNamesFailed: boolean;
  /** Organization ids whose names could not be read; only their rows carry the failure label. */
  orgNameFailedIds: Set<string>;
  loading: boolean;
  /** A sentence for the person when the list itself could not be read. */
  error: string | null;
  /** Set when some rows' facts could not be read (those rows offer a retry). */
  factsError: string | null;
  /** Rows whose facts read failed — they say "Couldn't read status — retry". */
  factsFailed: Set<string>;
  /** True while a retry for these ids is in flight. */
  factsRetrying: Set<string>;
  /** Re-read the facts of these rows only. */
  retryFacts: (ids: string[]) => void;
  /** True while the per-row facts are being read (cells say "Checking…"). */
  factsLoading: boolean;
  /** How many Sources match the current narrowing (the server's count). */
  total: number | null;
  /** The toggle's two numbers: Saved, and All captures (server counts). */
  savedTotal: number | null;
  allTotal: number | null;
  /** More pages exist beyond what is listed. */
  hasMore: boolean;
  loadingMore: boolean;
  /** List the next page (SOURCES_PAGE_SIZE more). */
  loadMore: () => void;
}

/**
 * FEW LARGE BATCHES, ONE AT A TIME. `docproc.source_list_facts` costs ~6 s
 * PER CALL whatever its batch size (its row-level security materializes every
 * processed_document the caller can see, once per call); the per-id cost is
 * small. Measured 2026-09-26, admin, 548 Sources after the library grew to
 * ~10,000: 25-id batches x 8 parallel -> 22 of 22 hit the 8 s statement timeout
 * (57014) and every row read "Couldn't read status"; 200-id batches one at a
 * time -> 0 failures at ~6.2 s each, and two at a time failed minutes later
 * under a busier DB. This only lowers the load: the per-call cost is the DB
 * lane's to fix, and until then a busy DB can still time a batch out (the rows
 * then say so and offer Retry).
 */
const FACTS_BATCH = 200;
const FACTS_PARALLEL = 1;

export interface SourceFactsRead {
  facts: Map<string, SourceFacts>;
  /** Ids whose batch failed — only these rows lack facts because of an error. */
  failedIds: Set<string>;
}

/**
 * Parallel batches, each settling on its own: a batch that fails marks ONLY its
 * ids as failed (the rows then offer a retry) and never discards the facts the
 * other batches read. A row the server answered without the current-version
 * columns counts as failed too — its stage would have to be guessed.
 */
export async function readSourceFacts(
  ids: string[],
  onBatch?: (partial: SourceFactsRead) => void,
): Promise<SourceFactsRead> {
  const facts = new Map<string, SourceFacts>();
  const failedIds = new Set<string>();
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += FACTS_BATCH)
    batches.push(ids.slice(i, i + FACTS_BATCH));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      let rows: SourceFactsRow[] | null = null;
      try {
        const { data, error } = await supabase
          .schema("docproc")
          .rpc("source_list_facts", { p_ids: batch });
        if (!error) rows = (data ?? []) as SourceFactsRow[];
      } catch {
        rows = null;
      }
      if (!rows) {
        batch.forEach((id) => failedIds.add(id));
      } else {
        const answered = new Set<string>();
        for (const r of rows) {
          const f = sourceFactsFromRow(r);
          if (!f) continue;
          facts.set(r.processed_document_id, f);
          answered.add(r.processed_document_id);
        }
        batch.forEach((id) => {
          if (!answered.has(id)) failedIds.add(id);
        });
      }
      onBatch?.({ facts: new Map(facts), failedIds: new Set(failedIds) });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FACTS_PARALLEL, batches.length) }, worker),
  );
  return { facts, failedIds };
}

export interface SourcesListOptions {
  /** Saved only (the page's default) or every capture. */
  saved: boolean;
  /** Name-or-address search, applied by the server. */
  search: string;
}

/** Preserve failures from earlier pages until those same organization ids succeed. */
export function mergeOrganizationNameFailures(
  previous: ReadonlySet<string>,
  organizationIds: readonly string[],
  succeeded: boolean,
): Set<string> {
  const next = new Set(previous);
  organizationIds.forEach((id) => (succeeded ? next.delete(id) : next.add(id)));
  return next;
}

export function useSources(
  scope: SourcesScope | null,
  userId: string | null,
  refreshKey: number,
  options: SourcesListOptions = { saved: false, search: "" },
): UseSourcesResult {
  type OwnState = Omit<UseSourcesResult, "retryFacts" | "loadMore">;
  const [state, setState] = useState<OwnState>({
    rows: [],
    facts: new Map(),
    orgNames: new Map(),
    orgNamesFailed: false,
    orgNameFailedIds: new Set(),
    loading: true,
    error: null,
    factsError: null,
    factsLoading: true,
    factsFailed: new Set(),
    factsRetrying: new Set(),
    total: null,
    savedTotal: null,
    allTotal: null,
    hasMore: false,
    loadingMore: false,
  });
  const scopeKey = scope
    ? scope.kind === "mine"
      ? "mine"
      : `orgs:${scope.organizationId}`
    : "none";
  const listKey = `${scopeKey}|${userId}|${refreshKey}|${options.saved}|${options.search.trim()}`;
  const generation = useRef(0);
  const fetched = useRef(0);

  /** One page (SOURCES_PAGE_SIZE rows, newest first) under the current narrowing. */
  const readPage = useCallback(
    async (offset: number) => {
      if (!scope || !userId) return null;
      let q = supabase
        .schema("docproc")
        .from("processed_documents")
        .select(SOURCE_LIST_COLUMNS, { count: "exact" })
        .is("deleted_at", null)
        .or(sourcesListFilter({ saved: options.saved, search: options.search }));
      q = applySourcesScope(q, scope, userId);
      const { data, error, count } = await q
        .order(SOURCE_LIST_ORDER_COLUMN, { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + SOURCES_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as unknown as SourceListRow[], count: count ?? null };
    },
    [scope, userId, options.saved, options.search],
  );

  /** Stage facts and organization names for newly listed rows only. */
  const readExtras = useCallback(
    async (gen: number, newRows: SourceListRow[]) => {
      const orgIds = [...new Set(newRows.map((r) => r.organization_id))];
      const [factsResult, orgResult] = await Promise.allSettled([
        readSourceFacts(
          newRows.map((r) => r.id),
          (partial) => {
            if (gen !== generation.current) return;
            setState((st) => {
              const facts = new Map(st.facts);
              partial.facts.forEach((f, id) => facts.set(id, f));
              const failed = new Set(st.factsFailed);
              partial.failedIds.forEach((id) => failed.add(id));
              return { ...st, facts, factsFailed: failed };
            });
          },
        ),
        orgIds.length
          ? supabase.schema("iam").from("organizations").select("id,name").in("id", orgIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (gen !== generation.current) return;
      setState((st) => {
        const orgNames = new Map(st.orgNames);
        const orgNamesOk = orgResult.status === "fulfilled" && !orgResult.value.error;
        const orgNameFailedIds = mergeOrganizationNameFailures(st.orgNameFailedIds, orgIds, orgNamesOk);
        if (orgNamesOk) {
          for (const o of (orgResult.value.data ?? []) as { id: string; name: string }[])
            orgNames.set(o.id, o.name);
        }
        const facts = new Map(st.facts);
        const failed = new Set(st.factsFailed);
        if (factsResult.status === "fulfilled") {
          factsResult.value.facts.forEach((f, id) => facts.set(id, f));
          factsResult.value.failedIds.forEach((id) => failed.add(id));
        } else {
          newRows.forEach((r) => failed.add(r.id));
        }
        return {
          ...st,
          facts,
          factsFailed: failed,
          factsError: factsErrorFor(failed.size),
          orgNames,
          orgNamesFailed: orgNameFailedIds.size > 0,
          orgNameFailedIds,
          factsLoading: false,
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!scope || !userId) return undefined;
    const gen = ++generation.current;
    fetched.current = 0;
    setState((st) => ({
      ...st,
      rows: [],
      loading: true,
      error: null,
      factsLoading: true,
      facts: new Map(),
      orgNames: new Map(),
      orgNamesFailed: false,
      orgNameFailedIds: new Set(),
      factsFailed: new Set(),
      factsRetrying: new Set(),
      factsError: null,
      total: null,
      hasMore: false,
    }));
    void (async () => {
      let page: Awaited<ReturnType<typeof readPage>>;
      try {
        page = await readPage(0);
      } catch {
        if (gen === generation.current)
          setState((st) => ({
            ...st,
            loading: false,
            factsLoading: false,
            error: "Your Sources could not be loaded. Refresh to try again.",
          }));
        return;
      }
      if (!page || gen !== generation.current) return;
      fetched.current = page.rows.length;
      const rows = appendSourcePage([], page.rows).map(listedSource);
      setState((st) => ({
        ...st,
        rows,
        loading: false,
        total: page.count,
        hasMore: page.count !== null && fetched.current < page.count,
      }));
      void readExtras(gen, rows);
      // The two numbers on the Saved / All captures toggle — head counts only.
      const counts = await Promise.allSettled(
        [true, false].map(async (saved) => {
          let q = supabase
            .schema("docproc")
            .from("processed_documents")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .or(sourcesListFilter({ saved, search: options.search }));
          q = applySourcesScope(q, scope, userId);
          const { count, error } = await q;
          return error ? null : count;
        }),
      );
      if (gen !== generation.current) return;
      setState((st) => ({
        ...st,
        savedTotal: counts[0].status === "fulfilled" ? counts[0].value : null,
        allTotal: counts[1].status === "fulfilled" ? counts[1].value : null,
      }));
    })();
    return undefined;
    // listKey carries every input; the scope object itself changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  const loadMore = useCallback(() => {
    const gen = generation.current;
    setState((st) => (st.loadingMore || !st.hasMore ? st : { ...st, loadingMore: true }));
    void (async () => {
      let page: Awaited<ReturnType<typeof readPage>>;
      try {
        page = await readPage(fetched.current);
      } catch {
        if (gen === generation.current)
          setState((st) => ({
            ...st,
            loadingMore: false,
            error: "More Sources could not be loaded. Try again.",
          }));
        return;
      }
      if (!page || gen !== generation.current) return;
      fetched.current += page.rows.length;
      const added = page.rows.map(listedSource);
      setState((st) => ({
        ...st,
        rows: appendSourcePage(st.rows, added),
        loadingMore: false,
        total: page.count ?? st.total,
        hasMore: page.count !== null && fetched.current < page.count && page.rows.length > 0,
      }));
      void readExtras(gen, added);
    })();
  }, [readPage, readExtras]);

  const retryFacts = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setState((s) => ({
      ...s,
      factsRetrying: new Set([...s.factsRetrying, ...ids]),
    }));
    void readSourceFacts(ids).then(({ facts, failedIds }) => {
      setState((s) => {
        const merged = new Map(s.facts);
        facts.forEach((f, id) => merged.set(id, f));
        const failed = new Set(s.factsFailed);
        ids.forEach((id) =>
          failedIds.has(id) ? failed.add(id) : failed.delete(id),
        );
        const retrying = new Set(s.factsRetrying);
        ids.forEach((id) => retrying.delete(id));
        return {
          ...s,
          facts: merged,
          factsFailed: failed,
          factsRetrying: retrying,
          factsError: factsErrorFor(failed.size),
        };
      });
    });
  }, []);

  // THE STAGE RE-READ RULE (sourceRows `factsPollDelayMs`): a row that says
  // "Indexing…" is re-read until its job ends, so the list never shows a job
  // that finished long ago. Only the indexing rows are asked again, silently.
  const pollingKey = indexingIds(state.facts).join(",");
  const pollStart = useRef<number | null>(null);
  useEffect(() => {
    if (!pollingKey) {
      pollStart.current = null;
      return undefined;
    }
    const now = Date.now();
    if (pollStart.current === null) pollStart.current = now;
    const delay = factsPollDelayMs(true, now - pollStart.current);
    if (delay === null) return undefined;
    const gen = generation.current;
    let cancelled = false;
    const timer = setTimeout(() => {
      void readSourceFacts(pollingKey.split(",")).then(({ facts }) => {
        if (cancelled || gen !== generation.current) return;
        setState((s) => {
          const merged = new Map(s.facts);
          facts.forEach((f, id) => merged.set(id, f));
          return { ...s, facts: merged };
        });
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `state.facts` identity changes on every merge, so an unchanged set of
    // indexing rows schedules the next re-read after each answer.
  }, [pollingKey, state.facts]);

  return { ...state, retryFacts, loadMore };
}

function factsErrorFor(failed: number): string | null {
  if (!failed) return null;
  return `The status of ${failed === 1 ? "1 Source" : `${failed} Sources`} couldn't be read. Retry on those rows.`;
}

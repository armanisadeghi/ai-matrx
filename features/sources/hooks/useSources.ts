"use client";

/**
 * features/sources/hooks/useSources.ts
 *
 * The Sources list read (SOURCE-CONVERGENCE §8.1). Direct Supabase under RLS —
 * never a server list endpoint — with its scope DECLARED (THE VIEW LAW,
 * `lib/list-scope/types.ts`): RLS is the ceiling, the scope is the view.
 *
 *   mine → Sources I created (`created_by = me`), any visibility.
 *   orgs → the selected organization's shared Sources (`visibility <> personal`).
 *
 * The complete list is read with `readAllRows` (PostgREST caps a bare select
 * at 1000 and the facets/counts treat this list as complete). Per-row stage
 * and attached-to come from ONE invoker RPC, `docproc.source_list_facts`,
 * batched, also under the caller's RLS. Organization names for the
 * organization column are read directly too.
 */

import { useCallback, useEffect, useState } from "react";
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import {
  SOURCE_LIST_COLUMNS,
  currentVersionsOnly,
  sourceFactsFromRow,
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
}

/**
 * Small batches read in parallel: each id costs a few RLS-checked counts, so
 * one 200-id call took ~5s while 25-id batches in parallel finish in ~2s and
 * fill the newest rows first (measured 2026-09-26, admin, 200 Sources).
 */
const FACTS_BATCH = 25;
const FACTS_PARALLEL = 8;

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

export function useSources(
  scope: SourcesScope | null,
  userId: string | null,
  refreshKey: number,
): UseSourcesResult {
  type OwnState = Omit<UseSourcesResult, "retryFacts">;
  const [state, setState] = useState<OwnState>({
    rows: [],
    facts: new Map(),
    orgNames: new Map(),
    loading: true,
    error: null,
    factsError: null,
    factsLoading: true,
    factsFailed: new Set(),
    factsRetrying: new Set(),
  });
  const scopeKey = scope
    ? scope.kind === "mine"
      ? "mine"
      : `orgs:${scope.organizationId}`
    : "none";

  useEffect(() => {
    if (!scope || !userId) return undefined;
    let cancelled = false;
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      factsLoading: true,
      facts: new Map(),
      factsFailed: new Set(),
      factsRetrying: new Set(),
    }));
    void (async () => {
      let rows: SourceListRow[];
      try {
        rows = await readAllRows<SourceListRow>(
          ({ from, to }) => {
            let q = supabase
              .schema("docproc")
              .from("processed_documents")
              .select(SOURCE_LIST_COLUMNS, { count: "exact" })
              .is("deleted_at", null)
              // One row per Source: originals and recaptures, never derived copies.
              .or("parent_processed_id.is.null,derivation_kind.eq.recapture");
            q =
              scope.kind === "mine"
                ? q.eq("created_by", userId)
                : q
                    .eq("organization_id", scope.organizationId)
                    .neq("visibility", "personal");
            return q
              .order("created_at", { ascending: false })
              .order("id", { ascending: true })
              .range(from, to) as unknown as PromiseLike<{
              data: SourceListRow[] | null;
              error: { message: string } | null;
              count?: number | null;
            }>;
          },
          { label: "docproc.processed_documents (Sources)" },
        );
      } catch {
        if (!cancelled)
          setState((s) => ({
            ...s,
            loading: false,
            error: "Your Sources could not be loaded. Refresh to try again.",
            factsLoading: false,
          }));
        return;
      }
      rows = currentVersionsOnly(rows);
      if (cancelled) return;
      setState((s) => ({ ...s, rows, loading: false, error: null }));

      const orgIds = [...new Set(rows.map((r) => r.organization_id))];
      const [factsResult, orgResult] = await Promise.allSettled([
        readSourceFacts(
          rows.map((r) => r.id),
          (partial) => {
            if (!cancelled)
              setState((s) => ({
                ...s,
                facts: partial.facts,
                factsFailed: partial.failedIds,
              }));
          },
        ),
        orgIds.length
          ? supabase
              .schema("iam")
              .from("organizations")
              .select("id,name")
              .in("id", orgIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      const orgNames = new Map<string, string>();
      if (orgResult.status === "fulfilled" && !orgResult.value.error) {
        for (const o of (orgResult.value.data ?? []) as {
          id: string;
          name: string;
        }[])
          orgNames.set(o.id, o.name);
      }
      const read =
        factsResult.status === "fulfilled"
          ? factsResult.value
          : {
              facts: new Map<string, SourceFacts>(),
              failedIds: new Set(rows.map((r) => r.id)),
            };
      setState((s) => ({
        ...s,
        facts: read.facts,
        factsFailed: read.failedIds,
        factsError: factsErrorFor(read.failedIds.size),
        orgNames,
        factsLoading: false,
      }));
    })();
    return () => {
      cancelled = true;
    };
    // scopeKey carries the scope's identity; the object itself changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, userId, refreshKey]);

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

  return { ...state, retryFacts };
}

function factsErrorFor(failed: number): string | null {
  if (!failed) return null;
  return `The status of ${failed === 1 ? "1 Source" : `${failed} Sources`} couldn't be read. Retry on those rows.`;
}

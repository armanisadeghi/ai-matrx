"use client";

/**
 * features/sources/hooks/useSources.ts
 *
 * The Sources list read (SOURCE-CONVERGENCE §8.1). Direct Supabase under RLS —
 * never a server list endpoint — with its scope DECLARED (THE VIEW LAW,
 * `lib/list-scope/types.ts`): RLS is the ceiling, the scope is the view.
 *
 *   mine → Sources I own (`owner_id = me`), any visibility.
 *   orgs → the selected organization's shared Sources (`visibility <> personal`).
 *
 * The complete list is read with `readAllRows` (PostgREST caps a bare select
 * at 1000 and the facets/counts treat this list as complete). Per-row stage
 * and attached-to come from ONE invoker RPC, `docproc.source_list_facts`,
 * batched, also under the caller's RLS. Organization names for the
 * organization column are read directly too.
 */

import { useEffect, useState } from "react";
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import {
  SOURCE_LIST_COLUMNS,
  currentVersionsOnly,
  type SourceAttachment,
  type SourceFacts,
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
  /** Set when the per-row facts failed (stage/attached-to then read as unknown). */
  factsError: string | null;
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

interface FactsRow {
  processed_document_id: string;
  chunk_count: number;
  entity_count: number;
  attachments: unknown;
}

function asAttachments(value: unknown): SourceAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): SourceAttachment[] => {
    if (!v || typeof v !== "object") return [];
    const r = v as Record<string, unknown>;
    if (typeof r.target_type !== "string" || typeof r.target_id !== "string")
      return [];
    return [
      {
        target_type: r.target_type,
        target_id: r.target_id,
        label: typeof r.label === "string" ? r.label : null,
      },
    ];
  });
}

export async function readSourceFacts(
  ids: string[],
  onBatch?: (partial: Map<string, SourceFacts>) => void,
): Promise<Map<string, SourceFacts>> {
  const out = new Map<string, SourceFacts>();
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += FACTS_BATCH)
    batches.push(ids.slice(i, i + FACTS_BATCH));
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (next < batches.length && !failed) {
      const batch = batches[next++];
      const { data, error } = await supabase
        .schema("docproc")
        .rpc("source_list_facts", { p_ids: batch });
      if (error) {
        failed = true;
        throw new Error(
          "The stage and attachments of these Sources could not be read.",
        );
      }
      for (const r of (data ?? []) as FactsRow[]) {
        out.set(r.processed_document_id, {
          chunkCount: r.chunk_count ?? 0,
          entityCount: r.entity_count ?? 0,
          attachments: asAttachments(r.attachments),
        });
      }
      onBatch?.(new Map(out));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FACTS_PARALLEL, batches.length) }, worker),
  );
  return out;
}

export function useSources(
  scope: SourcesScope | null,
  userId: string | null,
  refreshKey: number,
): UseSourcesResult {
  const [state, setState] = useState<UseSourcesResult>({
    rows: [],
    facts: new Map(),
    orgNames: new Map(),
    loading: true,
    error: null,
    factsError: null,
    factsLoading: true,
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
                ? q.eq("owner_id", userId)
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
            if (!cancelled) setState((s) => ({ ...s, facts: partial }));
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
      setState((s) => ({
        ...s,
        facts:
          factsResult.status === "fulfilled" ? factsResult.value : new Map(),
        factsError:
          factsResult.status === "rejected"
            ? "Stage and attachments could not be read, so they show as unknown."
            : null,
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

  return state;
}

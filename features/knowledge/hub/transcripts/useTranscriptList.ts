"use client";

/**
 * useTranscriptList — the hub's Transcripts view, served by the transcripts
 * list's own server functions (browser → Supabase, the person's own access):
 *
 *   public.trx_list_scoped        the rows — transcripts, recording sessions,
 *                                 cleanups, unsorted recordings — filtered,
 *                                 searched (titles, folders, tags AND the
 *                                 transcript text) and paged on the server,
 *                                 with the true total on every row;
 *   public.trx_list_facets        each facet's values with whole-set counts — and,
 *                                 for the facets a recording session carries (Type,
 *                                 Status, Visibility) and every Scope, the list's own
 *                                 total for that value, so a count always equals
 *                                 what choosing it returns.
 *
 * Nothing is filtered or counted over the rows that happen to be loaded: every
 * filter, count and total is the server's, over the whole set. The rows are
 * handed to the hub as one section, so the list, table, board and gallery
 * draw them exactly as they draw any other view.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";
import {
  STUDIO_SESSION_TOKEN,
  TRANSCRIPT_RECORD_TOKEN,
  UNSORTED_TOKEN,
  type TranscriptFacet,
  type TranscriptFacetSelection,
} from "./transcriptRows";

export const TRANSCRIPT_PAGE = 40;

/** The list's scopes (single choice). "orgs" with no organization = every organization I belong to. */
export type TranscriptScope = "orgs" | "mine" | "shared" | "public";

/** Hub facet → the server's filter key and facet kind. Scope is not a filter: it is the RPC's scope. */
const FILTER_KEY: Partial<Record<TranscriptFacet, { filter: string; facet: string }>> = {
  kind: { filter: "kind", facet: "kind" },
  status: { filter: "status", facet: "status" },
  folder: { filter: "folder_name", facet: "folder_name" },
  visibility: { filter: "visibility", facet: "visibility" },
  tag: { filter: "tags", facet: "tag" },
};

export function transcriptServerFilters(sel: TranscriptFacetSelection): Record<string, { values: string[] }> {
  const out: Record<string, { values: string[] }> = {};
  for (const [facet, key] of Object.entries(FILTER_KEY) as [TranscriptFacet, { filter: string }][]) {
    const values = sel[facet];
    if (values?.length) out[key.filter] = { values };
  }
  return out;
}

/** The facets a recording session row carries — counted by the list itself (see the facets read). */
const SESSION_FACETS: TranscriptFacet[] = ["kind", "status", "visibility"];

export function transcriptScopeOf(sel: TranscriptFacetSelection): TranscriptScope {
  const s = sel.scope?.[0];
  return s === "mine" || s === "shared" || s === "public" ? s : "orgs";
}

/** A list row → the hub's hit (its kind's own registry token). */
export function hitFromTranscriptRow(r: TranscriptListRow): KnowledgeHit {
  const entity =
    r.kind === "transcript" ? TRANSCRIPT_RECORD_TOKEN : r.kind === "unsorted" ? UNSORTED_TOKEN : STUDIO_SESSION_TOKEN;
  return {
    entity,
    id: r.id,
    title: r.title,
    source_kind: r.kind === "transcript" ? "transcript" : null,
    organization_id: r.organization_id || null,
    captured_by: r.created_by ? { id: r.created_by, name: r.owner_email || null } : null,
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
    tags: r.tags ?? [],
  } as KnowledgeHit;
}

export interface TranscriptListState {
  /** The rows as the hub's one section (the layouts, paging and failure lines read it). */
  sections: SectionState[];
  hits: KnowledgeHit[];
  /** hitKey → the server's own row (Status, Folder, Visibility, duration, owner…). */
  rowFor: (hit: KnowledgeHit) => TranscriptListRow | undefined;
  /** Every row the filters match, across the whole set; null until the server has answered. */
  total: number | null;
  facets: Partial<Record<TranscriptFacet, { value: string; count: number }[]>> | null;
  facetsError: string | null;
  loading: boolean;
  showMore: () => void;
  retry: () => void;
  refresh: () => void;
  /**
   * Every row the current filters match — the list's "Select all matching this filter"
   * for Export. Pages the same server function to the end; a failure throws its reason.
   */
  readAll: () => Promise<TranscriptListRow[]>;
}

/** Rows per page when reading the whole matching set (Export all). */
export const TRANSCRIPT_READ_ALL_PAGE = 500;

interface Args {
  enabled: boolean;
  text: string;
  selection: TranscriptFacetSelection;
  /** "Only my organization" — the resolved active organization, else every organization. */
  orgId: string | null;
  sort: "updated" | "title";
  /** Rows to load on the first read (a return to the list restores its depth). */
  initialDepth?: number;
}

function message(e: { message?: string } | null | undefined, what: string): string {
  return `${what} could not be read: ${e?.message?.trim() || "the server returned no reason."}`;
}

export function useTranscriptList({ enabled, text, selection, orgId, sort, initialDepth }: Args): TranscriptListState {
  const scope = transcriptScopeOf(selection);
  const filters = transcriptServerFilters(selection);
  const search = text.trim();
  const key = JSON.stringify({ scope, filters, search, orgId, sort });
  const [rows, setRows] = useState<TranscriptListRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [facets, setFacets] = useState<TranscriptListState["facets"]>(null);
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const depthRef = useRef(initialDepth);
  /** The filters the rows on screen answer — a page read for older filters is dropped, never appended. */
  const liveKey = useRef(key);
  liveKey.current = key;

  const call = (offset: number, limit: number) =>
    supabase.rpc("trx_list_scoped", {
      p_scope: scope,
      p_org_id: scope === "orgs" && orgId ? orgId : undefined,
      p_search: search || undefined,
      p_deep: Boolean(search),
      p_sort: sort,
      p_dir: sort === "title" ? "asc" : "desc",
      p_filters: filters,
      p_limit: limit,
      p_offset: offset,
    });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const limit = Math.max(TRANSCRIPT_PAGE, depthRef.current ?? 0);
    depthRef.current = undefined;
    setStatus("loading");
    setError(null);
    setMoreError(null);
    setLoadingMore(false);
    void (async () => {
      const { data, error: e } = await call(0, limit);
      if (cancelled) return;
      if (e) {
        setStatus("error");
        setError(message(e, "Your transcripts"));
        return;
      }
      const list = (data ?? []) as TranscriptListRow[];
      setRows(list);
      setTotal(list.length ? Number(list[0].total_count) : 0);
      setStatus("ready");
    })();
    void (async () => {
      // Facet values over the whole view. While a text search runs, the values stay (every
      // filter stays usable) but carry no numbers: a count over the search inside every
      // transcript's text outruns the server's time budget, and a count of the unsearched
      // view beside searched rows would be the wrong number.
      const { data, error: e } = await supabase.rpc("trx_list_facets", {
        p_scope: scope,
        p_org_id: scope === "orgs" && orgId ? orgId : undefined,
        p_search: undefined,
        p_deep: false,
      });
      if (cancelled) return;
      if (e) {
        setFacets(null);
        setFacetsError(message(e, "The filter counts"));
        return;
      }
      const out: NonNullable<TranscriptListState["facets"]> = {};
      const back = Object.entries(FILTER_KEY) as [TranscriptFacet, { facet: string }][];
      for (const row of (data ?? []) as { kind: string; value: string; total: number }[]) {
        const facet = back.find(([, k]) => k.facet === row.kind)?.[0];
        if (!facet) continue;
        (out[facet] ??= []).push({ value: row.value, count: search ? -1 : Number(row.total ?? 0) });
      }
      // A count must equal what choosing it returns. trx_list_facets counts recording sessions
      // the list itself does not show (measured 2026-09-29: Session 211 vs 53, Idle 227 vs 70,
      // Cleanup 27 vs 22, Stopped 11 vs 5), so every facet a session row carries — Type,
      // Status, Visibility — and every Scope is counted by the list itself: the same
      // function, the same filters, one row asked for, its true total read.
      if (!search) {
        const recount = async (facet: TranscriptFacet, value: string, sc: TranscriptScope = scope) => {
          const f = FILTER_KEY[facet];
          const { data: r, error: re } = await supabase.rpc("trx_list_scoped", {
            p_scope: sc,
            p_org_id: sc === "orgs" && orgId ? orgId : undefined,
            // Like every other facet count here: over the whole view, this value alone.
            p_filters: f ? { [f.filter]: { values: [value] } } : {},
            p_limit: 1,
            p_offset: 0,
          });
          if (re) return -1;
          return (r as TranscriptListRow[] | null)?.length ? Number((r as TranscriptListRow[])[0].total_count) : 0;
        };
        const jobs: Promise<void>[] = [];
        for (const facet of SESSION_FACETS)
          for (const v of out[facet] ?? []) jobs.push(recount(facet, v.value).then((n) => void (v.count = n)));
        const scopes = (["mine", "shared", "public"] as const).map((sc) => ({ value: sc, count: -1 }));
        for (const sc of scopes) jobs.push(recount("scope", sc.value, sc.value).then((n) => void (sc.count = n)));
        await Promise.all(jobs);
        if (cancelled) return;
        for (const facet of SESSION_FACETS) if (out[facet]) out[facet] = out[facet]!.filter((v) => v.count !== 0);
        out.scope = scopes.filter((sc) => sc.count !== 0);
      } else {
        out.scope = (["mine", "shared", "public"] as const).map((sc) => ({ value: sc, count: -1 }));
      }
      for (const [f, values] of Object.entries(out))
        if (f !== "scope") values?.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      setFacets(out);
      setFacetsError(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, nonce]);

  const hasMore = total !== null && rows.length < total;
  const showMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    const askedFor = key;
    void (async () => {
      const { data, error: e } = await call(rows.length, TRANSCRIPT_PAGE);
      if (liveKey.current !== askedFor) return;
      setLoadingMore(false);
      if (e) {
        setMoreError(message(e, "More transcripts"));
        return;
      }
      const next = (data ?? []) as TranscriptListRow[];
      setRows((prev) => {
        const seen = new Set(prev.map((r) => `${r.kind}:${r.id}`));
        return [...prev, ...next.filter((r) => !seen.has(`${r.kind}:${r.id}`))];
      });
      if (next.length) setTotal(Number(next[0].total_count));
    })();
  };

  const hits = rows.map(hitFromTranscriptRow);
  const byKey = new Map(rows.map((r, i) => [`${hits[i].entity}:${hits[i].id}`, r]));
  const sections: SectionState[] = [
    {
      key: "sources",
      status,
      loadingMore,
      moreError,
      section: {
        key: "sources",
        label: "Transcripts",
        count: total,
        items: hits,
        next_cursor: hasMore ? `o:${rows.length}` : null,
        error: error ? { message: error, retryable: true } : null,
      },
    },
  ];
  return {
    sections,
    hits,
    rowFor: (h) => byKey.get(`${h.entity}:${h.id}`),
    total,
    facets,
    facetsError,
    loading: status === "loading",
    showMore,
    retry: () => setNonce((n) => n + 1),
    refresh: () => setNonce((n) => n + 1),
    readAll: async () => {
      const out: TranscriptListRow[] = [];
      const seen = new Set<string>();
      for (let offset = 0; ; offset += TRANSCRIPT_READ_ALL_PAGE) {
        const { data, error: e } = await call(offset, TRANSCRIPT_READ_ALL_PAGE);
        if (e) throw new Error(message(e, "The matching transcripts"));
        const page = (data ?? []) as TranscriptListRow[];
        for (const r of page) {
          const k = `${r.kind}:${r.id}`;
          if (!seen.has(k)) (seen.add(k), out.push(r));
        }
        const whole = page.length ? Number(page[0].total_count) : out.length;
        if (page.length < TRANSCRIPT_READ_ALL_PAGE || out.length >= whole) return out;
      }
    },
  };
}

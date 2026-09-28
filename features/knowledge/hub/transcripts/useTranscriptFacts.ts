"use client";

/**
 * useTranscriptFacts — the visible transcript rows' own fields, read directly
 * (browser → Supabase, RLS decides) for exactly the rows the hub has loaded:
 * transcripts.transcripts by id (and by the Source they became), and
 * transcripts.studio_sessions by id. The search projection carries titles
 * only; Status, Folder, Visibility, duration and session-vs-cleanup live on
 * the records (H6d).
 *
 * A read that fails is said (error + retry), never an empty facet that looks
 * like "no folders".
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserEmail, selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";
import {
  SNIPPET_SEGMENTS,
  STUDIO_SESSION_TOKEN,
  TRANSCRIPT_RECORD_TOKEN,
  buildTranscriptContent,
  buildTranscriptFacts,
  isTranscriptHit,
  isTranscriptSourceHit,
  type StudioSessionFields,
  type TranscriptRecordFields,
  type TranscriptRowContent,
} from "./transcriptRows";

// The leading segments' words ride along (`segments->N->>text`) so a row can show its opening
// lines without reading the whole transcript body.
const SEGMENT_HEADS = Array.from({ length: SNIPPET_SEGMENTS }, (_, i) => `seg${i}:segments->${i}->>text`).join(",");
const TRANSCRIPT_COLUMNS = `id,title,description,is_draft,folder_name,tags,visibility,metadata,organization_id,created_by,created_at,updated_at,processed_document_id,${SEGMENT_HEADS}`;
const SESSION_COLUMNS =
  "id,title,source,status,visibility,total_duration_ms,transcript_id,organization_id,created_by,created_at,updated_at";
const EDIT_OF_COLUMNS: string = "id,edit_of:metadata->>edit_of";
/** PostgREST `in.(…)` stays well under URL limits at this size. */
const CHUNK = 80;

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

export interface TranscriptFactsState {
  factFor: (hit: KnowledgeHit) => TranscriptListRow | undefined;
  facts: Map<string, TranscriptListRow>;
  /** The row's content — opening words, channel, speakers, poster (Granola / Otter rows). */
  contentFor: (hit: KnowledgeHit) => TranscriptRowContent | undefined;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  retry: () => void;
  /** Re-read after a write (rename). */
  refresh: () => void;
}

export function useTranscriptFacts(hits: KnowledgeHit[], enabled: boolean): TranscriptFactsState {
  const userId = useAppSelector(selectUserId);
  const userEmail = useAppSelector(selectUserEmail);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [transcripts, setTranscripts] = useState<Map<string, TranscriptRecordFields>>(new Map());
  const [sessions, setSessions] = useState<Map<string, StudioSessionFields>>(new Map());
  const [sourceAlias, setSourceAlias] = useState<Map<string, string>>(new Map());
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<TranscriptFactsState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const wanted = enabled ? hits.filter(isTranscriptHit) : [];
  const missing = wanted.filter((h) => !asked.has(`${h.entity}:${h.id}`));
  const missingKey = missing.map((h) => `${h.entity}:${h.id}`).sort().join("|");

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const keys = missingKey.split("|");
    const ids = (token: string) => keys.filter((k) => k.startsWith(`${token}:`)).map((k) => k.slice(token.length + 1));
    const transcriptIds = ids(TRANSCRIPT_RECORD_TOKEN);
    const sessionIds = ids(STUDIO_SESSION_TOKEN);
    const sourceIds = missing.filter(isTranscriptSourceHit).map((h) => h.id);
    setStatus("loading");
    void (async () => {
      try {
        const reads: Promise<{ t?: TranscriptRecordFields[]; s?: StudioSessionFields[] }>[] = [];
        for (const c of chunks(transcriptIds))
          reads.push(
            Promise.resolve(
              supabase.schema("transcripts").from("transcripts").select(TRANSCRIPT_COLUMNS).in("id", c).is("deleted_at", null),
            ).then(({ data, error: e }) => {
              if (e) throw new Error(e.message);
              return { t: (data ?? []) as unknown as TranscriptRecordFields[] };
            }),
          );
        for (const c of chunks(sourceIds))
          reads.push(
            Promise.resolve(
              supabase
                .schema("transcripts")
                .from("transcripts")
                .select(TRANSCRIPT_COLUMNS)
                .in("processed_document_id", c)
                .is("deleted_at", null),
            ).then(({ data, error: e }) => {
              if (e) throw new Error(e.message);
              return { t: (data ?? []) as unknown as TranscriptRecordFields[] };
            }),
          );
        for (const c of chunks(sessionIds))
          reads.push(
            Promise.resolve(
              supabase.schema("transcripts").from("studio_sessions").select(SESSION_COLUMNS).in("id", c).is("deleted_at", null),
            ).then(({ data, error: e }) => {
              if (e) throw new Error(e.message);
              return { s: (data ?? []) as unknown as StudioSessionFields[] };
            }),
          );
        const results = await Promise.all(reads);
        if (cancelled) return;
        // A listed Source that is an EDITED version is not the id its transcript links to:
        // follow `metadata.edit_of` once, so its row still gets its transcript's facts.
        const linked = new Set(results.flatMap((r) => (r.t ?? []).map((t) => t.processed_document_id)));
        const unlinked = sourceIds.filter((id) => !linked.has(id));
        const aliases = new Map<string, string>();
        if (unlinked.length) {
          const { data: docs, error: docError } = await supabase
            .schema("docproc")
            .from("processed_documents")
            // A plain string: the typed select parser recurses without end on the JSON arrow alias.
            .select(EDIT_OF_COLUMNS)
            .in("id", unlinked);
          if (docError) throw new Error(`edited Sources: ${docError.message}`);
          for (const d of (docs ?? []) as unknown as { id: string; edit_of: string | null }[]) if (d.edit_of) aliases.set(d.id, d.edit_of);
          const originals = [...new Set(aliases.values())];
          if (originals.length) {
            const { data: more, error: moreError } = await supabase
              .schema("transcripts")
              .from("transcripts")
              .select(TRANSCRIPT_COLUMNS)
              .in("processed_document_id", originals)
              .is("deleted_at", null);
            if (moreError) throw new Error(`edited Sources' transcripts: ${moreError.message}`);
            results.push({ t: (more ?? []) as unknown as TranscriptRecordFields[] });
          }
          if (cancelled) return;
        }
        // Organization names for the Organization column (the list's own join).
        const orgIds = [
          ...new Set(
            results
              .flatMap((r) => [...(r.t ?? []), ...(r.s ?? [])].map((x) => x.organization_id))
              .concat(missing.map((h) => h.organization_id ?? null))
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        if (orgIds.length) {
          const { data: orgs, error: orgError } = await supabase
            .schema("iam")
            .from("organizations")
            .select("id,name")
            .in("id", orgIds);
          if (orgError) throw new Error(`organization names: ${orgError.message}`);
          if (cancelled) return;
          setOrgNames((prev) => {
            const next = new Map(prev);
            for (const o of (orgs ?? []) as { id: string; name: string }[]) next.set(o.id, o.name);
            return next;
          });
        }
        setTranscripts((prev) => {
          const next = new Map(prev);
          for (const r of results) for (const t of r.t ?? []) next.set(t.id, t);
          return next;
        });
        setSessions((prev) => {
          const next = new Map(prev);
          for (const r of results) for (const s of r.s ?? []) next.set(s.id, s);
          return next;
        });
        if (aliases.size)
          setSourceAlias((prev) => {
            const next = new Map(prev);
            for (const [k, v] of aliases) next.set(k, v);
            return next;
          });
        setAsked((prev) => new Set([...prev, ...keys]));
        setStatus("ready");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(
          `The Status, Folder and Visibility of ${keys.length === 1 ? "1 transcript row" : `${keys.length} transcript rows`} could not be read: ${err instanceof Error ? err.message : "the server refused."}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, nonce]);

  const facts = buildTranscriptFacts(wanted, {
    transcripts: [...transcripts.values()],
    sessions: [...sessions.values()],
    userId,
    userEmail,
    orgNames,
    sourceAlias,
  });
  const content = buildTranscriptContent(wanted, [...transcripts.values()], sourceAlias);

  return {
    facts,
    factFor: (hit) => facts.get(`${hit.entity}:${hit.id}`),
    contentFor: (hit) => content.get(`${hit.entity}:${hit.id}`),
    status: wanted.length ? status : "idle",
    error,
    retry: () => setNonce((n) => n + 1),
    refresh: () => {
      setAsked(new Set());
      setNonce((n) => n + 1);
    },
  };
}

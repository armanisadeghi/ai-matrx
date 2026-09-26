"use client";

/**
 * features/source-studio/hooks/useSourceData.ts
 *
 * The Source screen's reads. Everything a person can read comes straight from
 * Supabase under RLS (the Source row, its portions, the media a transcript was
 * made from, the entities found in its chunks); chunks come from the existing
 * library chunk route, which already answers "can this person read it". No
 * writes here — writes go through the door (`features/sources/api`).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  fetchProcessedDocumentPages,
  invalidateProcessedDocumentPages,
  type PdfPageRow,
} from "@/features/pdf-extractor/hooks/useProcessedDocumentPages";
import { usePortionLocators } from "@/features/sources/hooks/usePortionLocators";
import type {
  SourceMediaFacts,
  SourceOriginalFacts,
  StudioPortion,
} from "@/features/source-studio/sourceStudioModel";

// ── The Source row ────────────────────────────────────────────────────────

export const SOURCE_STUDIO_COLUMNS = [
  "id",
  "name",
  "source_kind",
  "source_id",
  "mime_type",
  "original_file_id",
  "canonical_identity",
  "metadata",
  "organization_id",
  "kept_at",
  "derivation_kind",
  "parent_processed_id",
  "total_pages",
  "origin_client",
  "capture_method",
  "created_at",
].join(",");

export interface SourceStudioDoc extends SourceOriginalFacts {
  id: string;
  name: string;
  organization_id: string;
  kept_at: string | null;
  derivation_kind: string;
  parent_processed_id: string | null;
  total_pages: number | null;
  origin_client: string | null;
  capture_method: string | null;
  created_at: string;
}

export interface UseSourceDoc {
  doc: SourceStudioDoc | null;
  /** True until the read for THIS id settles. */
  loading: boolean;
  /** The failed read (a fault, never a denial) — the access gate says which. */
  error: Error | null;
  reload: () => void;
}

export function useSourceDoc(id: string | null): UseSourceDoc {
  const [state, setState] = useState<{
    forKey: string | null;
    doc: SourceStudioDoc | null;
    error: Error | null;
  }>({ forKey: null, doc: null, error: null });
  const [tick, setTick] = useState(0);
  const key = id ? `${id}:${tick}` : null;

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .schema("docproc")
        .from("processed_documents")
        .select(SOURCE_STUDIO_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      setState({
        forKey: `${id}:${tick}`,
        doc: (data as unknown as SourceStudioDoc | null) ?? null,
        error: error ? new Error(error.message) : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const settled = key !== null && state.forKey === key;
  return {
    doc: settled ? state.doc : null,
    loading: !settled,
    error: settled ? state.error : null,
    reload,
  };
}

// ── Media a transcript was made from ──────────────────────────────────────

export interface UseSourceMedia {
  media: SourceMediaFacts | null;
  loading: boolean;
  /** A sentence when the media lookup failed (the segments still show). */
  error: string | null;
}

/**
 * The audio / video file behind a transcript Source (`transcripts.transcripts`
 * `audio_file_path` / `video_file_path`, both file ids). Other kinds have no
 * separate media and resolve immediately.
 */
export function useSourceMedia(doc: SourceStudioDoc | null): UseSourceMedia {
  const isTranscript = doc?.source_kind === "transcript";
  const docId = doc?.id ?? null;
  const sourceId = doc?.source_id ?? null;
  const [state, setState] = useState<{
    forId: string | null;
    media: SourceMediaFacts | null;
    error: string | null;
  }>({ forId: null, media: null, error: null });

  useEffect(() => {
    if (!isTranscript || !docId || !sourceId) return undefined;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .schema("transcripts")
        .from("transcripts")
        .select("audio_file_path,video_file_path")
        .or(`id.eq.${sourceId},processed_document_id.eq.${docId}`)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setState({
          forId: docId,
          media: null,
          error:
            "The recording behind this transcript could not be looked up, so the segments are shown without a player.",
        });
        return;
      }
      const row = data as {
        audio_file_path: string | null;
        video_file_path: string | null;
      } | null;
      setState({
        forId: docId,
        media: {
          audioFileId: row?.audio_file_path ?? null,
          videoFileId: row?.video_file_path ?? null,
        },
        error: null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isTranscript, docId, sourceId]);

  if (!doc) return { media: null, loading: true, error: null };
  if (!isTranscript) return { media: null, loading: false, error: null };
  if (state.forId !== docId) return { media: null, loading: true, error: null };
  return { media: state.media, loading: false, error: state.error };
}

// ── Chunks ────────────────────────────────────────────────────────────────

export type SourceChunk = components["schemas"]["LibraryChunkRow"];

/** The chunk route's own ceiling (aidream `list_library_chunks`). */
export const SOURCE_CHUNK_LIMIT = 500;

export interface UseSourceChunks {
  chunks: SourceChunk[];
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSourceChunks(documentId: string | null): UseSourceChunks {
  const [state, setState] = useState<{
    forKey: string | null;
    chunks: SourceChunk[];
    total: number;
    error: string | null;
  }>({ forKey: null, chunks: [], total: 0, error: null });
  const [tick, setTick] = useState(0);
  const key = documentId ? `${documentId}:${tick}` : null;

  useEffect(() => {
    if (!documentId) return undefined;
    let cancelled = false;
    const k = `${documentId}:${tick}`;
    apiGet(
      buildPath("/rag/library/{processed_document_id}/chunks", {
        processed_document_id: documentId,
      }),
      { query: { limit: SOURCE_CHUNK_LIMIT } },
    )
      .then(({ data }) => {
        if (cancelled) return;
        setState({
          forKey: k,
          chunks: Array.isArray(data?.chunks) ? data.chunks : [],
          total: typeof data?.total === "number" ? data.total : 0,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          forKey: k,
          chunks: [],
          total: 0,
          error:
            err instanceof Error && err.message
              ? `The searchable pieces could not be read: ${err.message}`
              : "The searchable pieces could not be read.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const settled = key !== null && state.forKey === key;
  return {
    chunks: settled ? state.chunks : [],
    total: settled ? state.total : 0,
    loading: !settled,
    error: settled ? state.error : null,
    reload,
  };
}

// ── Entities ──────────────────────────────────────────────────────────────

export interface SourceEntity {
  id: string;
  name: string;
  kind: string;
  /** Mentions in THIS Source. */
  mentions: number;
  /** Chunk ids that mention it (first mention first). */
  chunkIds: string[];
}

interface EntityMentionRow {
  chunk_id: string;
  entity_id: string;
  kg_entities: { name: string; kind: string } | null;
}

/** Chunk ids per mention read (keeps each request URL short and each query indexed). */
const ENTITY_CHUNK_BATCH = 80;

/**
 * The entities mentioned in the chunks on screen, read by chunk id (the
 * `kg_chunk_entities.chunk_id` index) — a join-filter on the chunk's document
 * timed out under RLS on a 17k-mention PDF. `truncated` when the Source has
 * more chunks than the screen holds.
 */
export function useSourceEntities(
  chunkIds: string[] | null,
  totalChunks: number,
): {
  entities: SourceEntity[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
} {
  const idsKey = chunkIds ? chunkIds.join(",") : null;
  const [state, setState] = useState<{
    forKey: string | null;
    entities: SourceEntity[];
    error: string | null;
  }>({ forKey: null, entities: [], error: null });

  useEffect(() => {
    if (idsKey === null) return undefined;
    const ids = idsKey ? idsKey.split(",") : [];
    let cancelled = false;
    void (async () => {
      const rows: EntityMentionRow[] = [];
      for (let i = 0; i < ids.length; i += ENTITY_CHUNK_BATCH) {
        const { data, error } = await ragDb(supabase)
          .from("kg_chunk_entities")
          .select("chunk_id,entity_id,kg_entities(name,kind)")
          .in("chunk_id", ids.slice(i, i + ENTITY_CHUNK_BATCH))
          .limit(5000);
        if (cancelled) return;
        if (error) {
          setState({
            forKey: idsKey,
            entities: [],
            error: `The people, places and things found in this Source could not be read: ${error.message}`,
          });
          return;
        }
        rows.push(...((data ?? []) as unknown as EntityMentionRow[]));
      }
      const byId = new Map<string, SourceEntity>();
      for (const r of rows) {
        const cur = byId.get(r.entity_id) ?? {
          id: r.entity_id,
          name: r.kg_entities?.name ?? "Unnamed",
          kind: r.kg_entities?.kind ?? "thing",
          mentions: 0,
          chunkIds: [],
        };
        cur.mentions += 1;
        if (!cur.chunkIds.includes(r.chunk_id)) cur.chunkIds.push(r.chunk_id);
        byId.set(r.entity_id, cur);
      }
      if (!cancelled)
        setState({
          forKey: idsKey,
          entities: [...byId.values()].sort(
            (a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name),
          ),
          error: null,
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  if (idsKey === null || state.forKey !== idsKey)
    return { entities: [], loading: true, error: null, truncated: false };
  return {
    entities: state.entities,
    loading: false,
    error: state.error,
    truncated: !!chunkIds && totalChunks > chunkIds.length,
  };
}

// ── Portions (text + locator) ─────────────────────────────────────────────

/**
 * Every portion of the viewed version with its text and its locator, read
 * with the PDF studio's own page fetcher (one fetcher, cached and deduped) and
 * the Sources locator read. `loading` stays true until the read for THIS id
 * settled — "no portions" is never said before that.
 */
export function useSourcePortions(documentId: string | null): {
  portions: StudioPortion[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const userId = useAppSelector(selectUserId);
  const { byIndex } = usePortionLocators(documentId);
  const [state, setState] = useState<{
    forKey: string | null;
    pages: PdfPageRow[];
    error: string | null;
  }>({ forKey: null, pages: [], error: null });
  const [tick, setTick] = useState(0);
  const key = documentId ? `${documentId}:${tick}` : null;

  useEffect(() => {
    if (!documentId || !userId) return undefined;
    let cancelled = false;
    const k = `${documentId}:${tick}`;
    fetchProcessedDocumentPages(documentId, userId)
      .then((pages) => {
        if (!cancelled) setState({ forKey: k, pages, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            forKey: k,
            pages: [],
            error:
              e instanceof Error && e.message
                ? `This Source's text could not be read: ${e.message}`
                : "This Source's text could not be read.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, userId, tick]);

  const reload = useCallback(() => {
    if (documentId) invalidateProcessedDocumentPages(documentId);
    setTick((t) => t + 1);
  }, [documentId]);

  const settled = key !== null && state.forKey === key;
  const portions: StudioPortion[] = settled
    ? state.pages
        .map((p) => ({
          pageIndex: p.pageIndex,
          pageNumber: p.pageNumber,
          rawText: p.rawText,
          cleanedText: p.cleanedText,
          locator: byIndex.get(p.pageIndex) ?? null,
        }))
        .sort((a, b) => a.pageIndex - b.pageIndex)
    : [];
  return {
    portions,
    loading: !settled,
    error: settled ? state.error : null,
    reload,
  };
}

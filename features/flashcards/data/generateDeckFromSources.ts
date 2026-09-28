// features/flashcards/data/generateDeckFromSources.ts
//
// Sources → a grounded flashcard deck. The one generation path behind the
// "Create deck" page when the person picked Sources (common-docs
// projects/unified-source-input/DESIGN.md § "Flashcards first").
//
//   1. The text comes from the ONE server step (`POST /sources/resolve`, via
//      `useSourceSet().resolve()`): every Source, in the form the person chose,
//      narrowed to the parts they ticked, as `### Chunk <real id> (page N)`
//      blocks. Nothing is stitched in the browser.
//   2. It is fed to THE segmented generator (`convert/segmentedGenerate.ts`)
//      with the existing from-source mandate and its existing variables, so
//      every part of a big Source gets its own call and a missed section is
//      reported, never silently cut.
//   3. Every card's citations are backfilled with the durable ids of the
//      Source that chunk came from (`attachRefsToCitation`), so a citation
//      opens the right file / document / page — per Source, not one id for all.
//   4. The deck links a `source` lineage edge to EVERY Source through the one
//      writer (`convert/recordSourceLineage.ts`).
//
// Plain async function (not a hook) so it is testable and callable anywhere.

import type {
  ResolvedSource,
  ResolvedSourceSet,
} from "@ai-matrx/agents/sources";
import type { Depth } from "@/features/education/assessment/data/types";
import { attachRefsToCitation } from "@/features/education/trust/grounding";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import {
  looseKey,
  segmentedGenerate,
} from "@/features/education/convert/segmentedGenerate";
import type {
  ConvertContext,
  ConvertResult,
  ConvertSource,
} from "@/features/education/convert/types";
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";
import { peekHref } from "@/features/organizations/peek/peekHref";
import { coerceCards, setTitleOf } from "./coerce-card";
import { foldDepthIntoRequest } from "./enhanceCard";
import { fcService } from "./fcService";
import { FC_MANDATES } from "./mandates";
import type { NewCardInput } from "./types";

const CHUNK_HEADER_RE = /^### Chunk (\S+)(?: \(page (\d+)\))?[ \t]*$/gm;

/** What one grounded chunk id belongs to. */
export interface ChunkOwner {
  source: ResolvedSource;
  page?: number;
}

/** chunk id → the Source (and page) it came from. */
export function chunkOwners(resolved: ResolvedSourceSet): Map<string, ChunkOwner> {
  const owners = new Map<string, ChunkOwner>();
  for (const source of resolved.sources) {
    for (const seg of source.segments) {
      owners.set(seg.id, { source, page: seg.page });
    }
    // The text is the truth the agent sees; read its headers too so an id the
    // segment list did not name still resolves to its Source.
    for (const m of source.text.matchAll(CHUNK_HEADER_RE)) {
      if (!owners.has(m[1])) {
        owners.set(m[1], {
          source,
          page: m[2] ? Number.parseInt(m[2], 10) : undefined,
        });
      }
    }
  }
  return owners;
}

/** The first chunk id a grounded text names, if any. */
function firstChunkId(text: string): string | null {
  CHUNK_HEADER_RE.lastIndex = 0;
  const m = CHUNK_HEADER_RE.exec(text);
  CHUNK_HEADER_RE.lastIndex = 0;
  return m ? m[1] : null;
}

/** The id the from-source agent echoes back as `document_id`. */
function documentIdOf(source: ResolvedSource): string {
  return source.processed_document_id ?? source.file_id ?? source.ref.resource_id;
}

/** The in-app page of a Source that has no file behind it (a note, pasted text, a record). */
function openHrefOf(source: ResolvedSource): string | null {
  const type = source.ref.resource_type;
  if (type === "file" || type === "cld_file") return null;
  return peekHref(type, source.ref.resource_id) ?? null;
}

/**
 * A stored document picked as a Source resolves with its document id but not
 * the file behind it, and a citation opens the real PDF only through that
 * file id. Read it once per document (the document detail names its origin).
 * A failure is announced on the Source's notes, never silent.
 */
export async function backfillFileIds(
  resolved: ResolvedSourceSet,
): Promise<ResolvedSourceSet> {
  const docIds = resolved.sources
    .filter((s) => !s.file_id && s.processed_document_id)
    .map((s) => s.processed_document_id as string);
  if (docIds.length === 0) return resolved;
  // A direct read (RLS decides): the document row names the file it came from.
  const { data, error } = await docprocDb(supabase)
    .from("processed_documents")
    .select("id, source_kind, source_id")
    .in("id", docIds);
  const fileOf = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.source_kind === "cld_file" && row.source_id) {
      fileOf.set(row.id as string, row.source_id as string);
    }
  }
  return {
    ...resolved,
    sources: resolved.sources.map((s) => {
      if (s.file_id || !s.processed_document_id) return s;
      const fileId = fileOf.get(s.processed_document_id);
      if (fileId) return { ...s, file_id: fileId };
      return error
        ? {
            ...s,
            notes: [
              ...s.notes,
              `Its citations show the passage but cannot open the file (${error.message}).`,
            ],
          }
        : s;
    }),
  };
}

/** Backfill every citation with the durable ids of ITS OWN Source. */
export function groundCitations(
  trust: TrustEnvelope | undefined,
  owners: Map<string, ChunkOwner>,
  fallback: ResolvedSource | null,
): TrustEnvelope | undefined {
  if (!trust || trust.citations.length === 0) return trust;
  return {
    ...trust,
    citations: trust.citations.map((c) => {
      const owner = owners.get(c.sourceId);
      const source = owner?.source ?? fallback;
      if (!source) return c;
      return attachRefsToCitation(c, {
        fileId: source.file_id ?? null,
        documentId: source.processed_document_id ?? null,
        // A Source with no file behind it (a note, a record) still opens: its
        // own page in the app.
        url: source.file_id ? null : openHrefOf(source),
        title: source.label,
        pageForCitation: () => owner?.page,
      });
    }),
  };
}

/** Point a card's own lineage at the Source its chunk came from. */
export function groundCard(
  card: NewCardInput,
  owners: Map<string, ChunkOwner>,
  fallback: ResolvedSource | null,
): NewCardInput {
  const chunkId =
    card.source?.chunk_id ??
    card.trust?.citations.find((c) => owners.has(c.sourceId))?.sourceId;
  const owner = chunkId ? owners.get(chunkId) : undefined;
  const source = owner?.source ?? fallback;
  return {
    ...card,
    source: source
      ? {
          file_id: source.file_id ?? "",
          processed_document_id: source.processed_document_id ?? undefined,
          chunk_id: chunkId,
          page: card.source?.page ?? owner?.page,
        }
      : card.source,
    trust: groundCitations(card.trust, owners, fallback),
  };
}

/** The lineage anchor of one resolved Source (file wins, else the record itself). */
export function lineageSourceOf(source: ResolvedSource): ConvertSource {
  const type = source.ref.resource_type === "cld_file" ? "file" : source.ref.resource_type;
  if (type === "file" || (source.file_id && type !== "processed_document")) {
    return {
      text: "",
      title: source.label,
      ref: { kind: "file", fileId: source.file_id ?? source.ref.resource_id },
    };
  }
  return {
    text: "",
    title: source.label,
    ref: {
      kind: type === "processed_document" ? "processed_document" : "note",
      processedDocumentId: source.processed_document_id,
      entityType: type,
      entityId: source.ref.resource_id,
    },
  };
}

export interface DeckFromSourcesInput {
  resolved: ResolvedSourceSet;
  /** Total cards the person asked for — spread across every Source. */
  count: number;
  difficulty: string;
  depth: Depth;
  gradeLevel?: string;
  /** The person's focus, plus a "Just a topic" line when they gave one. */
  focus?: string;
  /** The deck name the person typed, if any. */
  name?: string;
  ctx: ConvertContext;
}

export interface DeckFromSourcesOutcome {
  setId: string;
  name: string;
  cardCount: number;
  /** One honest sentence when sections were missed, else null. */
  gapNote: string | null;
  /** How many sections the plan ran (1 = one live pass). */
  sections: number;
}

/** A name for the deck when the person gave none. */
export function defaultDeckName(sources: ResolvedSource[]): string {
  const first =
    sources[0]?.label?.trim().replace(/\.(pdf|docx?|pptx?|txt|md|csv|xlsx?)$/i, "") ||
    "Study deck";
  return sources.length > 1
    ? `${first} and ${sources.length - 1} more`
    : first;
}

export async function generateDeckFromSources({
  resolved,
  count,
  difficulty,
  depth,
  gradeLevel,
  focus,
  name,
  ctx,
}: DeckFromSourcesInput): Promise<DeckFromSourcesOutcome> {
  const sources = resolved.sources.filter((s) => s.text.trim().length > 0);
  if (sources.length === 0) {
    throw new Error(
      "None of the Sources had any text to make cards from. Check each Source, or add another.",
    );
  }
  const owners = chunkOwners(resolved);
  const fallback = sources.length === 1 ? sources[0] : null;
  const baseTitle = name?.trim() || defaultDeckName(sources);
  const focusText = [
    gradeLevel?.trim() ? `Write for this level: ${gradeLevel.trim()}.` : "",
    focus?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const covered = await segmentedGenerate<NewCardInput>({
    ctx,
    source: {
      text: sources.map((s) => s.text).join("\n\n"),
      title: baseTitle,
    },
    targetKind: "deck",
    options: { count, difficulty },
    mandateKey: FC_MANDATES.generateFromSource,
    surfaceKey: "flashcards-create-from-source",
    sourceFeature: "education-flashcards",
    // The provision's existing offer (flashcards.generate_from_source) — no
    // new variables. Each section names the Source its first chunk came from.
    variables: (segment, plan) => {
      const chunk = firstChunkId(segment.text);
      const owner = (chunk ? owners.get(chunk)?.source : undefined) ?? sources[0];
      return {
        source_content: segment.text,
        document_id: documentIdOf(owner),
        title:
          plan.segments.length > 1
            ? `${baseTitle} - section ${segment.index} of ${segment.total}: ${segment.label}`
            : baseTitle,
        count: String(segment.items),
        difficulty,
        focus: foldDepthIntoRequest(depth, focusText) ?? "",
      };
    },
    extract: (value) => coerceCards(value),
    identity: (card) => looseKey(card.front),
  });

  const cards = covered.items.map((c) => groundCard(c, owners, fallback));
  if (cards.length === 0) {
    throw new Error(
      covered.gapNote ??
        "The flashcard job finished but returned no usable cards. Try again, or pick different parts.",
    );
  }

  const setName = name?.trim()
    ? name.trim()
    : covered.plan.singlePass
      ? setTitleOf(covered.firstValue) || baseTitle
      : baseTitle;

  // Single-writer contract (D-WP3): a single-pass live run's render block may
  // already have materialized a set — adopt it; a segmented run creates one.
  const created = await fcService.createGeneratedSetForConversation(
    covered.conversationId,
    {
      name: setName,
      topic: baseTitle,
      difficulty,
      description:
        sources.length === 1
          ? `Made from ${sources[0].label}`
          : `Made from ${sources.length} of your sources`,
      orgId: ctx.orgId,
    },
    cards,
  );
  if (created.error || !created.data) {
    throw new Error(
      typeof created.error === "string"
        ? created.error
        : "The cards were made but the deck could not be saved. Try again.",
    );
  }
  const setId = created.data.set.id;
  const detail = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  const result: ConvertResult = {
    targetKind: "deck",
    artifactId: setId,
    resourceType: "fc_set",
    href: `/education/flashcards/${setId}`,
    title: setName,
    detail: covered.gapNote ? `${detail} - ${covered.gapNote}` : detail,
  };

  // Lineage for EVERY Source — not only stored files.
  await Promise.all(
    sources.map((s) => recordSourceLineage(result, lineageSourceOf(s), ctx.orgId)),
  );

  return {
    setId,
    name: setName,
    cardCount: created.data.cards.length,
    gapNote: covered.gapNote,
    sections: covered.plan.segments.length,
  };
}

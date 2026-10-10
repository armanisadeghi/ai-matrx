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
import { attachRefsToCitation, recordKindOfResourceType } from "@/features/education/trust/grounding";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { recordLineageForSources } from "@/features/education/convert/recordSourceLineage";
import { announceLineage } from "@/features/education/convert/announceLineage";
import {
  isNearDuplicateQA,
  looseKey,
  segmentedGenerate,
  emptyRunMessage,
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
import { resolveKitTitle, NAMER_SAMPLE_CHARS } from "@/features/education/onboard/kitTitle";
import { sectionRunTitle } from "@/features/education/convert/coverage";
import { foldSteer, type GenerationSteer } from "@/features/education/convert/steering";
import type { OutlineGroups } from "@/features/education/kits/outline/outlineService";
import {
  BATCH_KEY,
  OUTLINE_SECTION_KEY,
  type OutlineSection,
} from "@/features/education/kits/outline/types";

/**
 * How flashcards can use a Source: its TEXT, handed over up front. The
 * segmented generator reads the resolved text and nothing else — it cannot
 * open a Source while it works — so "Let the AI look it up" would reach it as
 * nothing at all (V2 verifier shots 06/26: "None of the Sources had any text"
 * for a Source that had plenty). Passed to the Source input as `deliveries`.
 */
export const FLASHCARD_SOURCE_DELIVERIES = ["direct"] as const;

/** Source types held in the record store (no association token reaches them). */
const RECORD_STORE_TYPES = new Set(["dataset", "pick_list", "structured_list"]);

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
        recordKind: recordKindOfResourceType(source.ref.resource_type),
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
  /**
   * Awaited immediately before the deck is saved — a tab-bound run stamps
   * "saving" here so a reload after it is never redone blind (useTabBoundRun).
   */
  beforeSave?: () => Promise<void>;
  /**
   * A retry of a run that stopped with its page: that run's conversations.
   * The save continues a deck already made for them instead of adding a
   * second one (`fcService.createGeneratedSetForConversation`).
   */
  continues?: readonly string[];
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
  // Several Sources are named from the material (`nameFromSources`); this is the floor.
  return first;
}

export interface CardsFromSourcesInput
  extends Omit<DeckFromSourcesInput, "name" | "beforeSave"> {
  /** What the sections are titled after (the deck's name). */
  title: string;
  /** Cards the deck already has — never made again (the top-up). */
  existingCards?: { front: string; back: string }[];
  /**
   * How the person steers this run (living-kit W2): their words, the card types
   * wanted, the outline sections to cover. `steer.existing` is ignored — the
   * fronts of `existingCards` are folded in instead.
   */
  steer?: Omit<GenerationSteer, "sections"> & {
    sections?: Pick<OutlineSection, "id" | "title" | "facts">[];
  };
  /** Groups the cards this run makes, so "Undo last add" can find exactly them. */
  batchId?: string;
  /**
   * A kit's outline as generation groups (living-kit decision 4): when set,
   * the run covers these sections — each section's cited text + key facts —
   * instead of the Sources' raw text, and every card carries its section
   * (`topic` + `metadata.outline_section_id`). Citations still name the
   * Sources' chunks (`### Chunk <id>`), so grounding resolves as before.
   */
  outline?: OutlineGroups | null;
}

/**
 * Stamp what a run knows onto every card it made: its batch id, and — when the
 * run covered exactly one outline section — that section's title as `topic` and
 * its id as `metadata.outline_section_id` (coverage counts by id).
 */
export function stampRunCards(
  cards: NewCardInput[],
  run: {
    batchId?: string;
    sections?: Pick<OutlineSection, "id" | "title">[];
  },
): NewCardInput[] {
  const only = run.sections?.length === 1 ? run.sections[0] : null;
  if (!run.batchId && !only) return cards;
  return cards.map((c) => ({
    ...c,
    ...(only ? { topic: only.title } : {}),
    metadata: {
      ...(c.metadata ?? {}),
      ...(run.batchId ? { [BATCH_KEY]: run.batchId } : {}),
      ...(only ? { [OUTLINE_SECTION_KEY]: only.id } : {}),
    },
  }));
}

/** The free-text `focus` the from-source agent reads: level, focus, steering, what exists. */
export function cardsFocusText(
  gradeLevel: string | undefined,
  focus: string | undefined,
  steer: CardsFromSourcesInput["steer"],
  existingCards: { front: string }[],
): string {
  const base = [gradeLevel?.trim() ? `Write for this level: ${gradeLevel.trim()}.` : "", focus?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
  return foldSteer({ ...steer, existing: existingCards.map((c) => c.front) }, "cards", base);
}

export interface CardsFromSourcesOutcome {
  cards: NewCardInput[];
  sources: ResolvedSource[];
  /** Sources with text that no kept card came from (named in `gapNote`). */
  unusedSources: ResolvedSource[];
  gapNote: string | null;
  sections: number;
  /** Sections that produced nothing (stalled or failed, after their retry). */
  missed: number;
  /** Why sections failed, in the failure's own words (see `emptyRunMessage`). */
  failureReason: string | null;
  singlePass: boolean;
  conversationId: string | null;
  firstValue: unknown;
}

/** Up to three names, then "and N more". */
function namesOf(sources: ResolvedSource[]): string {
  const shown = sources.slice(0, 3).map((s) => `"${s.label}"`);
  const more = sources.length > 3 ? ` and ${sources.length - 3} more` : "";
  return `${shown.join(", ")}${more}`;
}

/**
 * THE EVERY-SOURCE RULE's count: the plan makes at least one card per Source
 * (see `planByGroup`), so 4 cards over 5 Sources is 5. Every count shown
 * before and during a run comes from here so it matches the plan.
 */
export function plannedCardCount(asked: number, sourceCount: number): number {
  return sourceCount > 1 ? Math.max(asked, sourceCount) : asked;
}

/**
 * The one honest note on what the deck covers: sections missed, Sources no
 * card came from, and a count raised to one card per Source.
 */
export function coverageNote(
  gapNote: string | null,
  unused: ResolvedSource[],
  asked: number,
  sourceCount: number,
): string | null {
  const parts = [
    sourceCount > 1 && asked < sourceCount ? `One card per source (${sourceCount}).` : null,
    gapNote && unused.length === 0 ? gapNote : null,
    unused.length > 0 ? `No cards from ${namesOf(unused)}. Use "Add more cards" to cover them.` : null,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" ") : null;
}

/**
 * Resolved Sources → grounded cards, nothing saved. The one card generator
 * behind BOTH "Make the deck" and "Add more cards" (the top-up), so a deck and
 * its top-up can never drift apart in grounding, count or de-duplication.
 */
export async function generateCardsFromSources({
  resolved,
  count,
  difficulty,
  depth,
  gradeLevel,
  focus,
  title,
  existingCards = [],
  steer,
  batchId,
  outline,
  ctx,
}: CardsFromSourcesInput): Promise<CardsFromSourcesOutcome> {
  const sources = resolved.sources.filter((s) => s.text.trim().length > 0);
  const lookedUp = resolved.sources.filter((s) => s.ref.delivery === "context" && !s.text.trim());
  if (sources.length === 0 && lookedUp.length > 0) {
    // Never the false "no text": say what actually happened, with the remedy.
    throw new Error(
      `${lookedUp.map((s) => s.label).join(", ")} ${lookedUp.length === 1 ? "is" : "are"} set to "let the AI look it up", which flashcards cannot use — cards are made from the text itself. Open the Source and choose "Include the text".`,
    );
  }
  if (sources.length === 0) {
    throw new Error(
      "None of the Sources had any text to make cards from. Check each Source, or add another.",
    );
  }
  const owners = chunkOwners(resolved);
  const fallback = sources.length === 1 ? sources[0] : null;
  const have = existingCards.map((c) => ({ question: c.front, answer: c.back }));
  const haveKeys = new Set(existingCards.map((c) => looseKey(c.front)));
  const focusText = cardsFocusText(gradeLevel, focus, steer, existingCards);

  const covered = await segmentedGenerate<NewCardInput>({
    ctx,
    source: {
      text: (outline ? outline.groups : sources).map((s) => s.text).join("\n\n"),
      title,
    },
    targetKind: "deck",
    options: { count, difficulty },
    // THE EVERY-SOURCE RULE: each Source is planned on its own and earns at
    // least one card (never folded into a neighbour and skipped). With an
    // outline, each SECTION is a group instead (and earns at least one card).
    groups: outline ? outline.groups : sources.map((s) => ({ label: s.label, text: s.text })),
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
            ? sectionRunTitle(title, segment)
            : title,
        count: String(segment.items),
        difficulty,
        focus: foldDepthIntoRequest(depth, focusText) ?? "",
      };
    },
    // A top-up never re-makes a card the deck already has: those are dropped
    // before the count is filled, so the person still gets the number asked.
    extract: (value) =>
      coerceCards(value).filter(
        (c) =>
          !haveKeys.has(looseKey(c.front)) &&
          !have.some((h) => isNearDuplicateQA(h, { question: c.front, answer: c.back })),
      ),
    identity: (card) => looseKey(card.front),
    // "What is osmosis?" written twice by two sections is one card.
    sameAs: (a, b) =>
      isNearDuplicateQA(
        { question: a.front, answer: a.back },
        { question: b.front, answer: b.back },
      ),
  });

  // Nothing dropped silently: a Source no kept card came from is named.
  const unusedSources = [
    ...resolved.sources.filter((s) => !s.text.trim()),
    ...(sources.length > 1 && !outline
      ? sources.filter((_, g) => !covered.items.some((c) => covered.groupOf(c) === g))
      : []),
  ];
  const grounded = covered.items.map((c) => {
    const card = groundCard(c, owners, fallback);
    if (!outline) return card;
    const g = covered.groupOf(c);
    const section = g === undefined ? undefined : outline.sections[g];
    return section ? stampRunCards([card], { sections: [section] })[0] : card;
  });
  return {
    cards: stampRunCards(grounded, { batchId, sections: outline ? undefined : steer?.sections }),
    sources,
    unusedSources,
    gapNote: coverageNote(covered.gapNote, unusedSources, count, sources.length),
    sections: covered.plan.segments.length,
    missed: covered.missedCount,
    failureReason: covered.failureReason,
    singlePass: covered.plan.singlePass,
    conversationId: covered.conversationId,
    firstValue: covered.firstValue,
  };
}

/** The deck's own row as a lineage result (for `recordSourceLineage`). */
export function deckLineageResult(
  setId: string,
  title: string,
  detail: string,
): ConvertResult {
  return {
    targetKind: "deck",
    artifactId: setId,
    resourceType: "fc_set",
    href: `/education/flashcards/${setId}`,
    title,
    detail,
  };
}

/** A deck of several Sources is titled by THE kit namer, from all of them. */
async function nameFromSources(live: ResolvedSource[], ctx: ConvertContext): Promise<string> {
  const floor = defaultDeckName(live);
  if (live.length < 2) return floor;
  const named = await resolveKitTitle(ctx.dispatch, ctx.store, {
    text: live.map((s) => s.text).join("\n\n"),
    rawTitle: floor,
    sourceTitles: live.map((s) => s.label),
    sourceSamples: live.map((s) => s.text.slice(0, NAMER_SAMPLE_CHARS)),
    orgId: ctx.orgId,
  });
  return named.title;
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
  beforeSave,
  continues,
}: DeckFromSourcesInput): Promise<DeckFromSourcesOutcome> {
  const live = resolved.sources.filter((s) => s.text.trim().length > 0);
  const baseTitle = name?.trim() || (await nameFromSources(live, ctx));
  const covered = await generateCardsFromSources({
    resolved,
    count,
    difficulty,
    depth,
    gradeLevel,
    focus,
    title: baseTitle,
    ctx,
  });
  const { cards, sources } = covered;
  if (cards.length === 0) {
    // No deck exists, so the gap note's "Add more" remedy points at nothing.
    throw new Error(
      emptyRunMessage(
        covered,
        "cards",
        "The flashcard job finished but returned no usable cards. Try again, or pick different parts.",
      ),
    );
  }

  const setName = name?.trim()
    ? name.trim()
    : covered.singlePass
      ? setTitleOf(covered.firstValue) || baseTitle
      : baseTitle;

  await beforeSave?.();
  // Single-writer contract (D-WP3): a single-pass live run's render block may
  // already have materialized a set — adopt it; a segmented run creates one.
  const created = await fcService.createGeneratedSetForConversation(
    covered.conversationId,
    {
      name: setName,
      topic: baseTitle,
      difficulty,
      // No "Made from …" description: the deck page's Made-from strip names and opens every Source.
      orgId: ctx.orgId,
    },
    cards,
    { continues },
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
  const result = deckLineageResult(
    setId,
    setName,
    covered.gapNote ? `${detail} - ${covered.gapNote}` : detail,
  );

  // Lineage for EVERY included Source — not only the ones with text, and
  // not only stored files.
  // A table or pick list lives in the record store, which no lineage edge can
  // point at (its old tokens are retired); the deck's own `source_set` records
  // it, and "Made from" reads that list.
  const linkSources = resolved.sources
    .filter((s) => !RECORD_STORE_TYPES.has(s.ref.resource_type))
    .map(lineageSourceOf);
  announceLineage(
    await recordLineageForSources(result, linkSources, ctx.orgId),
    () => recordLineageForSources(result, linkSources, ctx.orgId),
  );

  return {
    setId,
    name: setName,
    cardCount: created.data.cards.length,
    gapNote: covered.gapNote,
    sections: covered.sections,
  };
}

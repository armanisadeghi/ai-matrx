/**
 * features/knowledge/hub/transcripts/transcriptRows.ts — what the Knowledge
 * hub does with a TRANSCRIPT row (KNOWLEDGE-HUB §6, H6d: the Transcripts list
 * retires into the hub; every processing page stays as a record page).
 *
 * Pure: no React, no network. The page reads the visible rows' own fields
 * (useTranscriptFacts) and hands them here to get:
 *
 *   • the row's transcript kind — transcript · session · cleanup · unsorted ·
 *     source (a transcript Source, `processed_document` with source_kind
 *     transcript);
 *   • its row menu — the same per-kind destinations the list's menu carried
 *     (Open in Processor / Studio / Run Cleanup / Scribe…), Rename, Copy,
 *     Copy for AI, Copy link, Copy reference;
 *   • its facet values (Type, Status, Folders, Visibility, Tags, Scope) and
 *     the narrowing those facets do to the loaded rows;
 *   • the `TranscriptListRow` the list page's export and copy code take, so
 *     the CSV and the clipboard are written by the SAME code as before.
 */

import { formatCount, formatDurationSeconds } from "@ai-matrx/kit/format";
import {
  TRANSCRIPT_MEDIA_LABEL,
  cleanSnippet,
  isPlaceholderTitle,
  type TranscriptMediaKind,
} from "@/features/knowledge/hub/hubPresentation";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import {
  KIND_META,
  primaryRowHref,
  type TranscriptListKind,
  type TranscriptListRow,
} from "@/features/transcripts/browse/types";

export type HubTranscriptKind = TranscriptListKind | "source";

/** A transcript record's own fields (transcripts.transcripts). */
export interface TranscriptRecordFields {
  id: string;
  title: string | null;
  description: string | null;
  is_draft: boolean | null;
  folder_name: string | null;
  tags: string[] | null;
  visibility: string | null;
  metadata: unknown;
  organization_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  processed_document_id: string | null;
  /** audio · video · meeting · other — what the recorder captured. */
  source_type?: string | null;
  /**
   * The first few segments' words (PostgREST `segments->N->>text`) — the row's
   * snippet without reading a whole transcript body. Absent when not selected.
   */
  seg0?: string | null;
  seg1?: string | null;
  seg2?: string | null;
  seg3?: string | null;
  seg4?: string | null;
  seg5?: string | null;
}

/** How many leading segments the facts reader selects for the snippet. */
export const SNIPPET_SEGMENTS = 6;

/** A studio session's own fields (transcripts.studio_sessions). */
export interface StudioSessionFields {
  id: string;
  title: string | null;
  source: string | null;
  status: string | null;
  visibility: string | null;
  total_duration_ms: number | null;
  transcript_id: string | null;
  organization_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const TRANSCRIPT_RECORD_TOKEN = "transcript";
export const STUDIO_SESSION_TOKEN = "studio_session";
export const UNSORTED_TOKEN = "studio_recording_segments";

export function isTranscriptSourceHit(hit: Pick<KnowledgeHit, "entity" | "source_kind">): boolean {
  return hit.entity === "processed_document" && hit.source_kind === "transcript";
}

/** Is this hub row one the Transcripts list listed? (records, sessions, unsorted, transcript Sources) */
export function isTranscriptHit(hit: Pick<KnowledgeHit, "entity" | "source_kind">): boolean {
  return (
    hit.entity === TRANSCRIPT_RECORD_TOKEN ||
    hit.entity === STUDIO_SESSION_TOKEN ||
    hit.entity === UNSORTED_TOKEN ||
    isTranscriptSourceHit(hit)
  );
}

// ─── Facts: one TranscriptListRow per visible row ───────────────────────────

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^[0-9]+\.?[0-9]*$/.test(v)) return Number(v);
  return null;
};

function meta(record: TranscriptRecordFields, key: string): unknown {
  const m = record.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>)[key] : undefined;
}

function baseRow(id: string, kind: string, title: string): TranscriptListRow {
  return {
    id,
    kind,
    title,
    description: "",
    status: "",
    folder_name: "",
    tags: [],
    duration_seconds: 0,
    word_count: 0,
    is_draft: false,
    session_id: "",
    transcript_id: "",
    segment_index: 0,
    visibility: "",
    created_by: "",
    organization_id: "",
    organization_name: "",
    owner_email: "",
    access_level: "",
    created_at: "",
    updated_at: "",
    is_owner: false,
    total_count: 0,
  } as TranscriptListRow;
}

/** A captured video's own facts (`metadata.media`, written by the YouTube lane). */
function mediaOf(record: TranscriptRecordFields): Record<string, unknown> | null {
  const m = meta(record, "media");
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
}

/** Recorded length: the recorder's `duration`, else the captured video's `duration_seconds`. */
function durationOf(record: TranscriptRecordFields): number | null {
  const d = num(meta(record, "duration"));
  if (d && d > 0) return d;
  const m = mediaOf(record);
  const v = m ? num(m.duration_seconds) : null;
  return v && v > 0 ? v : null;
}

/** A transcript record → the list's row shape (same derivations as `trx_list_scoped`). */
export function rowFromTranscript(t: TranscriptRecordFields, userId: string | null): TranscriptListRow {
  const row = baseRow(t.id, "transcript", t.title?.trim() || "Untitled transcript");
  return {
    ...row,
    description: t.description ?? "",
    status: t.is_draft ? "draft" : "final",
    folder_name: t.folder_name?.trim() || "Transcripts",
    tags: t.tags ?? [],
    duration_seconds: durationOf(t) as number,
    word_count: num(meta(t, "wordCount")) as number,
    is_draft: Boolean(t.is_draft),
    visibility: t.visibility ?? "",
    created_by: t.created_by ?? "",
    organization_id: t.organization_id ?? "",
    created_at: t.created_at ?? "",
    updated_at: t.updated_at ?? "",
    is_owner: Boolean(userId) && t.created_by === userId,
  };
}

/** A studio session → `session`, or `cleanup` when its source is cleanup. */
export function rowFromSession(s: StudioSessionFields, userId: string | null): TranscriptListRow {
  const row = baseRow(s.id, s.source === "cleanup" ? "cleanup" : "session", s.title?.trim() || "Untitled session");
  return {
    ...row,
    status: s.status ?? "",
    duration_seconds: (s.total_duration_ms ? s.total_duration_ms / 1000 : null) as number,
    word_count: null as unknown as number,
    folder_name: null as unknown as string,
    transcript_id: s.transcript_id ?? "",
    visibility: s.visibility ?? "",
    created_by: s.created_by ?? "",
    organization_id: s.organization_id ?? "",
    created_at: s.created_at ?? "",
    updated_at: s.updated_at ?? "",
    is_owner: Boolean(userId) && s.created_by === userId,
  };
}

/** A transcript Source — the hub's own row, plus the transcript it came from (when there is one). */
export function rowFromSource(hit: KnowledgeHit, from: TranscriptRecordFields | null, userId: string | null): TranscriptListRow {
  const row = baseRow(hit.id, "source", hit.title);
  return {
    ...row,
    status: "",
    folder_name: (from ? from.folder_name?.trim() || "Transcripts" : null) as string,
    tags: from?.tags ?? [],
    visibility: from?.visibility ?? "",
    transcript_id: from?.id ?? "",
    duration_seconds: (from ? durationOf(from) : null) as number,
    word_count: (from ? num(meta(from, "wordCount")) : null) as number,
    created_by: hit.captured_by?.id ?? from?.created_by ?? "",
    organization_id: hit.organization_id ?? "",
    created_at: hit.created_at ?? "",
    updated_at: hit.updated_at ?? "",
    is_owner: Boolean(userId) && (hit.captured_by?.id ?? from?.created_by) === userId,
  };
}

/** An unsorted recording (when the projection lists them) — no fields beyond the hit. */
export function rowFromUnsorted(hit: KnowledgeHit): TranscriptListRow {
  return {
    ...baseRow(hit.id, "unsorted", hit.title),
    status: "unsorted",
    organization_id: hit.organization_id ?? "",
    created_at: hit.created_at ?? "",
    updated_at: hit.updated_at ?? "",
  };
}

export interface TranscriptFactsInput {
  transcripts: TranscriptRecordFields[];
  sessions: StudioSessionFields[];
  userId: string | null;
  /** The signed-in person's email — the Owner of their own rows. */
  userEmail?: string | null;
  /** organization id → name (the Organization column of Export / Copy). */
  orgNames?: Map<string, string>;
  /** Source id → the id its transcript links to, when the listed Source is an edited version (`metadata.edit_of`). */
  sourceAlias?: Map<string, string>;
}

/** Organization and owner, the way the list named them (org name; the owner's email, else their name). */
function withPeople(row: TranscriptListRow, hit: KnowledgeHit, input: TranscriptFactsInput): TranscriptListRow {
  return {
    ...row,
    organization_name: (row.organization_id && input.orgNames?.get(row.organization_id)) || "",
    owner_email: row.is_owner ? (input.userEmail ?? "") : (hit.captured_by?.name ?? ""),
  };
}

/** hitKey → the row's list-shape facts, for every transcript hit whose own fields were read. */
export function buildTranscriptFacts(hits: KnowledgeHit[], input: TranscriptFactsInput): Map<string, TranscriptListRow> {
  const byId = new Map(input.transcripts.map((t) => [t.id, t]));
  const bySource = new Map(
    input.transcripts.filter((t) => t.processed_document_id).map((t) => [t.processed_document_id as string, t]),
  );
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const out = new Map<string, TranscriptListRow>();
  const put = (h: KnowledgeHit, row: TranscriptListRow) => out.set(`${h.entity}:${h.id}`, withPeople(row, h, input));
  for (const h of hits) {
    if (h.entity === TRANSCRIPT_RECORD_TOKEN) {
      const t = byId.get(h.id);
      if (t) put(h, rowFromTranscript(t, input.userId));
    } else if (h.entity === STUDIO_SESSION_TOKEN) {
      const s = sessions.get(h.id);
      if (s) put(h, rowFromSession(s, input.userId));
    } else if (h.entity === UNSORTED_TOKEN) {
      put(h, rowFromUnsorted(h));
    } else if (isTranscriptSourceHit(h)) {
      const from = bySource.get(h.id) ?? bySource.get(input.sourceAlias?.get(h.id) ?? "") ?? null;
      put(h, rowFromSource(h, from, input.userId));
    }
  }
  return out;
}

// ─── Kind, links, labels ────────────────────────────────────────────────────

export function transcriptKindOf(hit: KnowledgeHit, fact: TranscriptListRow | null | undefined): HubTranscriptKind | null {
  if (fact) return fact.kind as HubTranscriptKind;
  if (hit.entity === TRANSCRIPT_RECORD_TOKEN) return "transcript";
  if (hit.entity === UNSORTED_TOKEN) return "unsorted";
  if (isTranscriptSourceHit(hit)) return "source";
  // A session whose own row has not been read yet: session vs cleanup is unknown.
  return null;
}

export const TRANSCRIPT_KIND_LABEL: Record<HubTranscriptKind, string> = {
  transcript: KIND_META.transcript.label,
  session: KIND_META.session.label,
  cleanup: KIND_META.cleanup.label,
  unsorted: KIND_META.unsorted.label,
  source: "Source",
};

/** The Source's own page (registry address for `processed_document`). */
export type SourceHref = (id: string) => string | null;

/** Where a row opens — the record page for its kind (the list's `primaryRowHref`), a Source its own page. */
export function transcriptRowHref(fact: TranscriptListRow, sourceHref: SourceHref): string {
  if (fact.kind === "source") return sourceHref(fact.id) ?? `/knowledge?peek=processed_document:${encodeURIComponent(fact.id)}`;
  return primaryRowHref(fact);
}

export type TranscriptMenuAction =
  | "rename"
  | "copy"
  | "copy-ai"
  | "copy-link"
  | "copy-reference";

export type TranscriptMenuIcon =
  | "processor"
  | "studio"
  | "cleanup"
  | "scribe"
  | "unsorted"
  | "source"
  | "rename"
  | "copy"
  | "copy-ai"
  | "link"
  | "reference";

export interface TranscriptMenuEntry {
  id: string;
  label: string;
  icon: TranscriptMenuIcon;
  /** A destination (a record page) … */
  href?: string;
  /** … or an action the page runs. */
  action?: TranscriptMenuAction;
  section: "open" | "edit" | "copy";
}

const enc = encodeURIComponent;

/** The processing destinations of one transcript record (by its id). */
function transcriptOpens(id: string): TranscriptMenuEntry[] {
  return [
    { id: "open-processor", label: "Open in Processor", icon: "processor", href: `/transcripts/processor?focus=${enc(id)}`, section: "open" },
    { id: "open-studio", label: "Open in Studio", icon: "studio", href: `/transcripts/studio?import=${enc(id)}`, section: "open" },
    { id: "run-cleanup", label: "Run Cleanup", icon: "cleanup", href: `/transcripts/cleanup?import=${enc(id)}`, section: "open" },
  ];
}

/**
 * The row menu, per kind — the Transcripts list's menu, plus what the list
 * did elsewhere (rename inline, Copy / Copy for AI). A transcript Source opens
 * its own page and, when it came from a transcript record, that record's
 * processing pages too.
 */
export function transcriptMenu(
  hit: KnowledgeHit,
  fact: TranscriptListRow | null | undefined,
  sourceHref: SourceHref,
): TranscriptMenuEntry[] {
  const kind = transcriptKindOf(hit, fact);
  const out: TranscriptMenuEntry[] = [];
  if (kind === "transcript") out.push(...transcriptOpens(hit.id));
  else if (kind === "session")
    out.push(
      { id: "open-studio", label: "Open in Studio", icon: "studio", href: `/transcripts/studio?session=${enc(hit.id)}`, section: "open" },
      { id: "open-scribe", label: "Open in Scribe", icon: "scribe", href: `/transcripts/scribe/${enc(hit.id)}`, section: "open" },
    );
  else if (kind === "cleanup")
    out.push({ id: "open-cleanup", label: "Open cleanup session", icon: "cleanup", href: `/transcripts/cleanup?session=${enc(hit.id)}`, section: "open" });
  else if (kind === "unsorted")
    out.push({ id: "open-unsorted", label: "View unsorted recordings", icon: "unsorted", href: "/transcripts/scribe/unsorted", section: "open" });
  else if (kind === "source") {
    const own = sourceHref(hit.id);
    if (own) out.push({ id: "open-source", label: "Open Source", icon: "source", href: own, section: "open" });
    if (fact?.transcript_id) out.push(...transcriptOpens(fact.transcript_id));
  } else if (hit.entity === STUDIO_SESSION_TOKEN) {
    // Session vs cleanup unknown until its row is read: the registry's address still opens it.
    out.push({ id: "open-studio", label: "Open in Studio", icon: "studio", href: `/transcripts/studio?session=${enc(hit.id)}`, section: "open" });
  } else return out;

  if (kind === "transcript" || kind === "session" || kind === "cleanup")
    out.push({ id: "rename", label: "Rename", icon: "rename", action: "rename", section: "edit" });
  if (fact) {
    out.push({ id: "copy", label: "Copy", icon: "copy", action: "copy", section: "copy" });
    out.push({ id: "copy-ai", label: "Copy for AI", icon: "copy-ai", action: "copy-ai", section: "copy" });
  }
  out.push({ id: "copy-link", label: "Copy link", icon: "link", action: "copy-link", section: "copy" });
  if (kind !== "unsorted")
    out.push({ id: "copy-reference", label: "Copy reference", icon: "reference", action: "copy-reference", section: "copy" });
  return out;
}

/** The record-reference type the list's "Copy reference" used. */
export function transcriptReferenceType(hit: KnowledgeHit): string {
  if (hit.entity === TRANSCRIPT_RECORD_TOKEN) return "transcript";
  if (hit.entity === STUDIO_SESSION_TOKEN) return "transcript_session";
  return hit.entity;
}

/** Can this row be renamed inline (the list's title edit)? */
export function canRenameTranscript(hit: KnowledgeHit, fact: TranscriptListRow | null | undefined): boolean {
  const kind = transcriptKindOf(hit, fact);
  return kind === "transcript" || kind === "session" || kind === "cleanup";
}

// ─── Facets (Type · Status · Folders · Visibility · Tags · Scope) ──────────

export const TRANSCRIPT_FACETS = ["kind", "status", "folder", "visibility", "tag", "scope"] as const;
export type TranscriptFacet = (typeof TRANSCRIPT_FACETS)[number];

export const TRANSCRIPT_FACET_LABEL: Record<TranscriptFacet, string> = {
  kind: "Type",
  status: "Status",
  folder: "Folders",
  visibility: "Visibility",
  tag: "Tags",
  scope: "Scope",
};

export const TRANSCRIPT_SCOPE_LABEL: Record<string, string> = {
  mine: "Mine",
  shared: "Shared with me",
  public: "Public",
};

/** The value(s) a row has for a facet. `__none__` = the list's "No folder" / "No status" / "Untagged". */
export function transcriptFacetValues(fact: TranscriptListRow, facet: TranscriptFacet): string[] {
  switch (facet) {
    case "kind":
      return [fact.kind];
    case "status":
      return [fact.status?.trim() || "__none__"];
    case "folder":
      // The list filters folders on transcripts only; sessions carry none.
      return [fact.folder_name?.trim() || "__none__"];
    case "visibility":
      return [fact.visibility?.trim() || "__none__"];
    case "tag":
      return fact.tags?.length ? fact.tags : ["__none__"];
    case "scope":
      if (fact.is_owner) return ["mine"];
      return [fact.visibility === "public" ? "public" : "shared"];
  }
}

export function facetValueLabel(facet: TranscriptFacet, value: string): string {
  if (value === "__none__")
    return { kind: "Unknown", status: "No status", folder: "No folder", visibility: "None", tag: "Untagged", scope: "Unknown" }[facet];
  if (facet === "kind") return TRANSCRIPT_KIND_LABEL[value as HubTranscriptKind] ?? value;
  if (facet === "scope") return TRANSCRIPT_SCOPE_LABEL[value] ?? value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type TranscriptFacetSelection = Partial<Record<TranscriptFacet, string[]>>;

/** `g.kind=transcript,session` … → the selection (the view's `group` record). */
export function facetSelectionFromGroup(group: Record<string, string>): TranscriptFacetSelection {
  const out: TranscriptFacetSelection = {};
  for (const f of TRANSCRIPT_FACETS) {
    const raw = group[f];
    if (!raw) continue;
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (values.length) out[f] = values;
  }
  return out;
}

export function facetSelectionToGroup(sel: TranscriptFacetSelection, group: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { ...group };
  for (const f of TRANSCRIPT_FACETS) {
    delete out[f];
    const values = sel[f];
    if (values?.length) out[f] = values.join(",");
  }
  return out;
}

export function hasFacetSelection(sel: TranscriptFacetSelection): boolean {
  return TRANSCRIPT_FACETS.some((f) => (sel[f]?.length ?? 0) > 0);
}

/**
 * Narrow the loaded rows by the facets (AND across facets, OR within one — the
 * list's rule). A row whose own fields are not read yet stays (its facts are
 * unknown, never a silent drop) unless a facet is set — then it waits.
 */
export function narrowByTranscriptFacets(
  hits: KnowledgeHit[],
  sel: TranscriptFacetSelection,
  factFor: (hit: KnowledgeHit) => TranscriptListRow | undefined,
): KnowledgeHit[] {
  if (!hasFacetSelection(sel)) return hits;
  return hits.filter((h) => {
    const fact = factFor(h);
    if (!fact) return false;
    return TRANSCRIPT_FACETS.every((f) => {
      const want = sel[f];
      if (!want?.length) return true;
      const have = transcriptFacetValues(fact, f);
      return have.some((v) => want.includes(v));
    });
  });
}

/** Value → count over the loaded rows, per facet (for the facet menus). */
export function transcriptFacetCounts(
  hits: KnowledgeHit[],
  factFor: (hit: KnowledgeHit) => TranscriptListRow | undefined,
): Record<TranscriptFacet, { value: string; count: number }[]> {
  const out = {} as Record<TranscriptFacet, { value: string; count: number }[]>;
  for (const f of TRANSCRIPT_FACETS) {
    const counts = new Map<string, number>();
    for (const h of hits) {
      const fact = factFor(h);
      if (!fact) continue;
      for (const v of transcriptFacetValues(fact, f)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    out[f] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return out;
}

// ─── Row facts (the list row's meta line) ───────────────────────────────────

/**
 * What a transcript row says beside its title (Granola / Otter: who, how long,
 * how much, what state): the channel it came from, named speakers, the kind
 * when it is not a plain transcript (Session, Cleanup, Unsorted), duration,
 * word count, and a draft or live session status.
 * Only facts the record actually carries — an unknown is omitted, never "0 min".
 */
export function transcriptRowFacts(
  fact: TranscriptListRow | null | undefined,
  content?: Pick<TranscriptRowContent, "channel" | "speakers"> | null,
): string[] {
  if (!fact) return [];
  const out: string[] = [];
  if (content?.channel) out.push(content.channel);
  if (content?.speakers.length)
    out.push(content.speakers.length > 2 ? `${content.speakers.length} speakers` : content.speakers.join(", "));
  if (fact.kind === "session" || fact.kind === "cleanup" || fact.kind === "unsorted")
    out.push(TRANSCRIPT_KIND_LABEL[fact.kind as HubTranscriptKind]);
  // THE package formatters (dense voice): "13 min", "1h 2m"; "2,340 words".
  if (typeof fact.duration_seconds === "number" && fact.duration_seconds > 0)
    out.push(formatDurationSeconds(fact.duration_seconds, { style: "coarse" }));
  if (typeof fact.word_count === "number" && fact.word_count > 0)
    out.push(`${formatCount(fact.word_count)} ${fact.word_count === 1 ? "word" : "words"}`);
  // A live session says so; a transcript's draft flag is not shown on the row — it is not a
  // status any other layout carries (the Status facet filters by it).
  if ((fact.kind === "session" || fact.kind === "cleanup") && fact.status && fact.status !== "completed")
    out.push(fact.status.charAt(0).toUpperCase() + fact.status.slice(1).replace(/_/g, " "));
  return out;
}

// ─── Row content (Granola / Otter: what is inside sells the row) ────────────

export interface TranscriptRowContent {
  /** What it came from — decides the row's glyph (hubPresentation TRANSCRIPT_MEDIA_ICON). */
  mediaKind: TranscriptMediaKind;
  /** A name to show when the record's own title is a placeholder ("unlabeled"): its opening words, else "Recording · 12:35 PM". */
  title: string | null;
  /** The opening words, ~160 characters, cut on a word. */
  snippet: string | null;
  /** The YouTube channel it came from. */
  channel: string | null;
  /** Named speakers the recorder captured (never "Unknown"). */
  speakers: string[];
  /** A poster frame for a captured video. */
  thumbnailUrl: string | null;
}

const SNIPPET_CHARS = 160;

/** Join the leading segments, collapse whitespace, drop "[00:00:02] Unknown:" stamps, cut on a word. */
export function snippetFromSegments(parts: (string | null | undefined)[], max = SNIPPET_CHARS): string | null {
  const text = cleanSnippet(
    parts
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .join(" ")
      .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*(?:[^:\n]{1,40}:\s*)?/g, " "),
  );
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

function speakersOf(record: TranscriptRecordFields): string[] {
  const raw = meta(record, "speakers");
  if (!Array.isArray(raw)) return [];
  const names = raw
    .map((s) => (typeof s === "string" ? s : s && typeof s === "object" ? (s as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0 && !/^(unknown|speaker ?\d*)$/i.test(n.trim()))
    .map((n) => n.trim());
  return [...new Set(names)];
}

/** What a transcript came from, by its own record (census in hubPresentation). */
export function transcriptMediaKind(record: TranscriptRecordFields): TranscriptMediaKind {
  const media = mediaOf(record);
  const adapter = media && typeof media.adapter === "string" ? media.adapter : null;
  if (adapter === "youtube") return "youtube";
  if (adapter === "podcast_rss") return "podcast";
  if (record.source_type === "meeting") return "meeting";
  const origin = meta(record, "origin");
  const surface = origin && typeof origin === "object" ? (origin as { surface?: unknown }).surface : null;
  if (typeof surface === "string" && /interview|masterwork/i.test(surface)) return "interview";
  if (record.source_type === "video") return "video";
  if (record.source_type === "audio") return "recording";
  return "text";
}

/** The first words as a name: up to 7 words, no trailing punctuation. */
function titleFromWords(snippet: string | null): string | null {
  if (!snippet) return null;
  const words = snippet.replace(/…$/, "").split(/\s+/).filter(Boolean).slice(0, 7);
  if (words.length < 2) return null;
  const t = words.join(" ").replace(/[\s,.;:!?–—-]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1) + (snippet.split(/\s+/).length > 7 ? "…" : "");
}

/** What a transcript record says about itself for its row. */
export function transcriptRowContent(record: TranscriptRecordFields): TranscriptRowContent {
  const media = mediaOf(record);
  const snippet = snippetFromSegments([record.seg0, record.seg1, record.seg2, record.seg3, record.seg4, record.seg5]);
  const mediaKind = transcriptMediaKind(record);
  const when = record.created_at ? new Date(record.created_at) : null;
  const title = isPlaceholderTitle(record.title)
    ? (titleFromWords(snippet) ??
      `${TRANSCRIPT_MEDIA_LABEL[mediaKind]}${when && Number.isFinite(when.getTime()) ? ` · ${when.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}`)
    : null;
  const channel = media && typeof media.channel_title === "string" && media.channel_title.trim() ? media.channel_title.trim() : null;
  const videoId = media && media.adapter === "youtube" && typeof media.external_id === "string" ? media.external_id : null;
  return {
    mediaKind,
    title,
    snippet,
    channel,
    speakers: speakersOf(record),
    thumbnailUrl: videoId && /^[\w-]{6,20}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
  };
}

/** hitKey → the content of the record behind each transcript row (a Source reads the transcript it came from). */
export function buildTranscriptContent(
  hits: KnowledgeHit[],
  transcripts: TranscriptRecordFields[],
  /** A Source whose own id is not linked (an edited version): the id of the version that is. */
  sourceAlias: Map<string, string> = new Map(),
): Map<string, TranscriptRowContent> {
  const byId = new Map(transcripts.map((t) => [t.id, t]));
  const bySource = new Map(
    transcripts.filter((t) => t.processed_document_id).map((t) => [t.processed_document_id as string, t]),
  );
  const out = new Map<string, TranscriptRowContent>();
  for (const h of hits) {
    const t =
      h.entity === TRANSCRIPT_RECORD_TOKEN
        ? byId.get(h.id)
        : isTranscriptSourceHit(h)
          ? (bySource.get(h.id) ?? bySource.get(sourceAlias.get(h.id) ?? ""))
          : undefined;
    if (t) out.set(`${h.entity}:${h.id}`, transcriptRowContent(t));
  }
  return out;
}

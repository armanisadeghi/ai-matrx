// features/kg-suggestions/service/sourcePreviewService.ts
//
// Resolve a suggestion's SOURCE document (the note / task / transcript / file /
// … a suggestion was derived from) into a readable, previewable shape so the
// user can actually SEE the evidence behind a suggestion before deciding —
// not just an opaque kind + id.
//
// A suggestion row only carries `(source_kind, source_id, context_snippet)`.
// This service turns that into:
//   - a human title (also used by the always-on enrichment line on the card),
//   - the readable body text (so the snippet can be shown IN CONTEXT),
//   - a link-out href to the source's full native surface, and
//   - whether the source can be popped into a floating notes window.
//
// Reads are DIRECT Supabase (RLS-scoped to the user) — same pattern as the
// resource `*Peek` components. The bodies live in each kind's own table; for
// kinds whose table holds no inline text (files, scraped pages, …) we fall back
// to the ingested `processed_documents.clean_content` / `content` for that
// `(source_kind, source_id)`. No Python hop, no heavy cross-feature service
// imports — the feature stays self-contained.

"use client";

import { supabase } from "@/utils/supabase/client";

/** Source kinds we can pop into a floating window panel from the decision UI. */
export type SourceOpenableKind = "note";

export type SourceBodyKind = "text" | "markdown" | "code";

export interface SourcePreviewDoc {
  kind: string;
  id: string;
  /** Readable title, or null when we couldn't resolve one. */
  title: string | null;
  /** The readable body text (already RLS-authorized), or null when none. */
  body: string | null;
  /** How to render the body (plain / markdown-ish / code). */
  bodyKind: SourceBodyKind;
  /** Programming language for code bodies (best-effort). */
  language: string | null;
  /** Small labelled facts shown above the body (type, size, updated, …). */
  meta: { label: string; value: string }[];
  /** Relative href to the source's full native surface (opens in a new tab). */
  href: string | null;
  /** When set, the source can be opened in a floating window of this kind. */
  openableAs: SourceOpenableKind | null;
  /** True when the body was clipped for size. */
  truncated: boolean;
  /** The source row could not be found / read. */
  notFound: boolean;
}

const SOURCE_KIND_LABEL: Record<string, string> = {
  note: "note",
  task: "task",
  project: "project",
  transcript: "transcript",
  scraped: "scraped page",
  cld_file: "file",
  conversation: "conversation",
  cx_message: "conversation",
  code_file: "code file",
};

export function sourceKindLabel(kind: string): string {
  return SOURCE_KIND_LABEL[kind] ?? kind;
}

/** Bodies above this many chars are clipped (generous — preview is read-only). */
const MAX_BODY_CHARS = 100000;

function emptyDoc(kind: string, id: string): SourcePreviewDoc {
  return {
    kind,
    id,
    title: null,
    body: null,
    bodyKind: "text",
    language: null,
    meta: [],
    href: sourceLinkFor(kind, id),
    openableAs: null,
    truncated: false,
    notFound: false,
  };
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

function humanSize(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Link-out routing — where the user lands when opening the source's full native
 * surface in a new tab. Distinct from the inline preview (no chunk anchor); the
 * RAG citation router (`features/rag/api/search.ts#citationHrefFor`) needs a
 * chunk id we don't carry here, so this is the chunk-less sibling for sources.
 */
export function sourceLinkFor(kind: string, id: string): string | null {
  const enc = encodeURIComponent(id);
  switch (kind) {
    case "note":
      return `/notes/${enc}`;
    case "task":
      return `/tasks/${enc}`;
    case "transcript":
      return `/transcripts/${enc}`;
    case "cld_file":
      return `/files/f/${enc}?tab=document`;
    case "code_file":
      return `/code/${enc}`;
    case "conversation":
      return `/chat/${enc}`;
    case "scraped":
      // source_id is the page URL the scraper keys results by.
      return `/scraper?url=${enc}`;
    default:
      // project (org-scoped, no id-only route), cx_message, unknown.
      return null;
  }
}

/**
 * Lightweight title-only resolve. Used by the always-on card enrichment line,
 * which runs for every card — keep it to a single small read per kind.
 */
export async function resolveSourceTitle(
  kind: string,
  id: string,
): Promise<string | null> {
  try {
    switch (kind) {
      case "note": {
        const { data } = await supabase
          .from("notes")
          .select("label")
          .eq("id", id)
          .maybeSingle();
        return data?.label?.trim() || null;
      }
      case "task": {
        const { data } = await supabase
          .from("ctx_tasks")
          .select("title")
          .eq("id", id)
          .maybeSingle();
        return data?.title?.trim() || null;
      }
      case "project": {
        const { data } = await supabase
          .from("ctx_projects")
          .select("name")
          .eq("id", id)
          .maybeSingle();
        return data?.name?.trim() || null;
      }
      case "transcript": {
        const { data } = await supabase
          .from("transcripts")
          .select("title")
          .eq("id", id)
          .maybeSingle();
        return data?.title?.trim() || null;
      }
      case "conversation": {
        const { data } = await supabase
          .from("cx_conversation")
          .select("title")
          .eq("id", id)
          .maybeSingle();
        return data?.title?.trim() || null;
      }
      case "cld_file": {
        const { data } = await supabase
          .from("user_files")
          .select("filename")
          .eq("id", id)
          .maybeSingle();
        return data?.filename?.trim() || null;
      }
      case "code_file": {
        const { data } = await supabase
          .from("code_files")
          .select("name, path")
          .eq("id", id)
          .maybeSingle();
        return data?.name?.trim() || data?.path?.trim() || null;
      }
      default: {
        // Try the ingested doc's name as a last resort.
        const doc = await fetchProcessedDocument(kind, id);
        return doc?.name?.trim() || null;
      }
    }
  } catch {
    return null;
  }
}

interface ProcessedDocLite {
  name: string | null;
  clean_content: string | null;
  content: string | null;
  total_pages: number | null;
  updated_at: string | null;
}

/** Latest non-archived ingested doc for a source, or null. */
async function fetchProcessedDocument(
  kind: string,
  id: string,
): Promise<ProcessedDocLite | null> {
  const { data, error } = await supabase
    .from("processed_documents")
    .select("name, clean_content, content, total_pages, updated_at")
    .eq("source_kind", kind)
    .eq("source_id", id)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProcessedDocLite;
}

function clipBody(body: string): { text: string; truncated: boolean } {
  if (body.length <= MAX_BODY_CHARS) return { text: body, truncated: false };
  return { text: body.slice(0, MAX_BODY_CHARS), truncated: true };
}

// ── Per-kind loaders ─────────────────────────────────────────────────────────

async function loadNote(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("note", id);
  const { data } = await supabase
    .from("notes")
    .select("label, content, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ...doc, notFound: true };
  doc.title = data.label?.trim() || "Untitled note";
  doc.bodyKind = "markdown";
  doc.openableAs = "note";
  const updated = formatDate(data.updated_at);
  if (updated) doc.meta.push({ label: "Updated", value: updated });
  const body = (data.content ?? "").trim();
  if (body) {
    const { text, truncated } = clipBody(body);
    doc.body = text;
    doc.truncated = truncated;
  }
  return doc;
}

async function loadTask(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("task", id);
  const { data } = await supabase
    .from("ctx_tasks")
    .select("title, description, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ...doc, notFound: true };
  doc.title = data.title?.trim() || "Untitled task";
  const created = formatDate(data.created_at);
  if (created) doc.meta.push({ label: "Created", value: created });
  const body = (data.description ?? "").trim();
  if (body) {
    const { text, truncated } = clipBody(body);
    doc.body = text;
    doc.truncated = truncated;
  }
  return doc;
}

async function loadProject(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("project", id);
  const { data } = await supabase
    .from("ctx_projects")
    .select("name, description, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ...doc, notFound: true };
  doc.title = data.name?.trim() || "Untitled project";
  const created = formatDate(data.created_at);
  if (created) doc.meta.push({ label: "Created", value: created });
  const body = (data.description ?? "").trim();
  if (body) {
    const { text, truncated } = clipBody(body);
    doc.body = text;
    doc.truncated = truncated;
  }
  return doc;
}

interface TranscriptSegmentLite {
  text?: unknown;
  speaker?: unknown;
}

function reconstructTranscript(segments: unknown): string | null {
  if (!Array.isArray(segments)) return null;
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg && typeof seg === "object" && "text" in seg) {
      const s = seg as TranscriptSegmentLite;
      const text = typeof s.text === "string" ? s.text.trim() : "";
      if (!text) continue;
      const speaker = typeof s.speaker === "string" ? s.speaker.trim() : "";
      lines.push(speaker ? `${speaker}: ${text}` : text);
    }
  }
  return lines.length ? lines.join("\n") : null;
}

async function loadTranscript(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("transcript", id);
  const { data } = await supabase
    .from("transcripts")
    .select("title, description, segments, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ...doc, notFound: true };
  doc.title = data.title?.trim() || "Untitled transcript";
  const created = formatDate(data.created_at);
  if (created) doc.meta.push({ label: "Recorded", value: created });
  const transcriptText = reconstructTranscript(data.segments);
  const body = (transcriptText ?? data.description ?? "").trim();
  if (body) {
    const { text, truncated } = clipBody(body);
    doc.body = text;
    doc.truncated = truncated;
  }
  return doc;
}

async function loadConversation(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("conversation", id);
  const { data } = await supabase
    .from("cx_conversation")
    .select("title, description, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    // Maybe the ingested transcript of the conversation exists.
    return loadViaProcessedDocument("conversation", id, doc);
  }
  doc.title = data.title?.trim() || "Conversation";
  const created = formatDate(data.created_at);
  if (created) doc.meta.push({ label: "Started", value: created });
  const body = (data.description ?? "").trim();
  if (body) {
    const { text, truncated } = clipBody(body);
    doc.body = text;
    doc.truncated = truncated;
  } else {
    return loadViaProcessedDocument("conversation", id, doc);
  }
  return doc;
}

async function loadFile(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("cld_file", id);
  const { data } = await supabase
    .from("user_files")
    .select("filename, mime_type, size, created_at")
    .eq("id", id)
    .maybeSingle();
  if (data) {
    doc.title = data.filename?.trim() || "File";
    if (data.mime_type) doc.meta.push({ label: "Type", value: data.mime_type });
    const size = humanSize(data.size);
    if (size) doc.meta.push({ label: "Size", value: size });
    const added = formatDate(data.created_at);
    if (added) doc.meta.push({ label: "Added", value: added });
  }
  // Files hold no inline text — read the ingested document body if present.
  return loadViaProcessedDocument("cld_file", id, doc);
}

async function loadCodeFile(id: string): Promise<SourcePreviewDoc> {
  const doc = emptyDoc("code_file", id);
  const { data } = await supabase
    .from("code_files")
    .select("name, path, content, language, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ...doc, notFound: true };
  doc.title = data.name?.trim() || data.path?.trim() || "Code file";
  doc.bodyKind = "code";
  doc.language = data.language?.trim() || null;
  if (data.path) doc.meta.push({ label: "Path", value: data.path });
  if (data.language) doc.meta.push({ label: "Language", value: data.language });
  const updated = formatDate(data.updated_at);
  if (updated) doc.meta.push({ label: "Updated", value: updated });
  const body = (data.content ?? "").trim();
  if (body) {
    const { text, truncated } = clipBody(body);
    doc.body = text;
    doc.truncated = truncated;
  }
  return doc;
}

/**
 * Fill a doc's body from the ingested `processed_documents` row for this source
 * when the source's own table carries no readable text (files, scraped pages,
 * conversations without a description, unknown kinds).
 */
async function loadViaProcessedDocument(
  kind: string,
  id: string,
  base: SourcePreviewDoc,
): Promise<SourcePreviewDoc> {
  const pdoc = await fetchProcessedDocument(kind, id);
  if (!pdoc) {
    // Nothing ingested — keep whatever metadata/title we already have.
    if (!base.title) base.notFound = true;
    return base;
  }
  if (!base.title) base.title = pdoc.name?.trim() || sourceKindLabel(kind);
  if (pdoc.total_pages != null) {
    base.meta.push({ label: "Pages", value: String(pdoc.total_pages) });
  }
  const raw = (pdoc.clean_content ?? pdoc.content ?? "").trim();
  if (raw) {
    base.bodyKind = "markdown";
    const { text, truncated } = clipBody(raw);
    base.body = text;
    base.truncated = truncated;
  }
  return base;
}

/**
 * Load the full previewable source document for a suggestion. Always resolves
 * (never throws) — failures degrade to a `notFound` doc so the UI can still
 * show the snippet + a link-out.
 */
export async function loadSourcePreview(
  kind: string,
  id: string,
): Promise<SourcePreviewDoc> {
  try {
    switch (kind) {
      case "note":
        return await loadNote(id);
      case "task":
        return await loadTask(id);
      case "project":
        return await loadProject(id);
      case "transcript":
        return await loadTranscript(id);
      case "conversation":
      case "cx_message":
        return await loadConversation(id);
      case "cld_file":
        return await loadFile(id);
      case "code_file":
        return await loadCodeFile(id);
      default:
        return await loadViaProcessedDocument(kind, id, emptyDoc(kind, id));
    }
  } catch {
    return { ...emptyDoc(kind, id), notFound: true };
  }
}

// components/markdown-studio/lab/content-sources.ts
//
// READ-ONLY loaders that put REAL platform content into the Markdown Studio
// so every rich-content piece is proven against what people actually store:
// a note, a study guide (a note, read through the Education reader's
// service), a chat assistant message, an agent's system prompt, a flashcard
// front or back, and (super admins) the admin tester's sample corpus.
//
// Every loader delegates to the canonical service for that record — nothing
// here writes. The studio buffer is a COPY: editing it never touches the
// source record.

import type {
  ContentSource,
  RichDocumentActionsProp,
} from "@/features/rich-document/types";
import { buildChatMessageActions } from "@/features/rich-document/chat/chatMessageActions";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import {
  loadStudyGuide,
  loadStudyGuideIndex,
} from "@/features/education/study-guides/service";
import { fetchSavedAgentDefinition } from "@/features/agents/services/agent-definition-snapshot.service";
import { fetchAgentBrowsePage } from "@/features/agents/browse/service";
import { extractAgentSystemInstruction } from "@/features/agents/utils/agent-system-instruction";
import { messageRowToRecord } from "@/features/agents/redux/execution-system/thunks/conversation-bundle";
import { extractInspectableText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { fcService } from "@/features/flashcards/data/fcService";
import {
  getSample,
  listSamples,
} from "@/components/admin/markdown-tester/samples-service";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { supabase } from "@/utils/supabase/client";
import {
  isRecordUnavailableError,
  recordUnavailable,
} from "@/lib/records/recordUnavailable";
import { operationFailed } from "@/utils/errors";
import { requireUserId } from "@/utils/auth/getUserId";
import { loadDocument } from "@/features/rich-document/annotations/documentSource";

export const STUDIO_SOURCE_KINDS = [
  "document",
  "note",
  "study-guide",
  "chat-message",
  "agent-prompt",
  "flashcard-front",
  "flashcard-back",
  "admin-sample",
] as const;

export type StudioSourceKind = (typeof STUDIO_SOURCE_KINDS)[number];

export interface StudioSourceListItem {
  id: string;
  label: string;
  sublabel?: string;
  /**
   * Label/sublabel are rich text (flashcard math like `\\(H_2O\\)`): render
   * them through <RichContent level="inline">, never as raw strings, and
   * never character-truncate them (a cut lands mid-formula). Layout clamps.
   */
  rich?: boolean;
}

export interface LoadedStudioContent {
  kind: StudioSourceKind;
  id: string;
  title: string;
  content: string;
  /** The RichDocument source the action toolkit receives. */
  contentSource: ContentSource;
  /**
   * The source's action configuration — for a chat message, the SAME builder
   * the /chat bars use, so the proving route shows exactly that action set.
   */
  sourceActions?: RichDocumentActionsProp;
  /** The title is rich text — render it through <RichContent level="inline">. */
  titleIsRich?: boolean;
  /** Human note shown beside the title (e.g. "structured payload shown as JSON"). */
  notice?: string;
}

export interface StudioSourceDef {
  kind: StudioSourceKind;
  label: string;
  /** Lucide icon name for the picker (rendered by the picker). */
  icon: string;
  adminOnly?: boolean;
  /** Canonical entity token — an absent record renders <AccessGate token id/>. */
  token: string;
  /** Recent items for the picker (bounded — the picker also takes a pasted id). */
  list: (search: string) => Promise<StudioSourceListItem[]>;
  load: (id: string) => Promise<LoadedStudioContent>;
}

/** How many recent items a picker shows. A picker, never a complete list. */
export const STUDIO_SOURCE_RECENT_LIMIT = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function matches(search: string, ...fields: (string | null | undefined)[]) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function preview(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Whitespace-flattened, NOT truncated — for rich labels the layout clamps. */
function flatten(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function formatWhen(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString();
}

// ─── Notes ───────────────────────────────────────────────────────────────────

async function loadNoteContent(
  kind: "note" | "study-guide",
  id: string,
): Promise<LoadedStudioContent> {
  const note =
    kind === "study-guide"
      ? await loadStudyGuide(id)
      : await NotesAPI.getById(id, { failureMode: "throw" });
  if (!note) throw absent("note", "note", id, "workbench.notes");
  return {
    kind,
    id,
    title: note.label || "Untitled note",
    content: note.content ?? "",
    contentSource: noteIdentityContentSource(id),
  };
}

// ─── Chat assistant messages ─────────────────────────────────────────────────

async function listAssistantMessages(
  search: string,
): Promise<StudioSourceListItem[]> {
  const userId = requireUserId();
  // THE VIEW LAW: my own recent assistant turns, bounded — a picker, not a list.
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("*")
    .eq("created_by", userId)
    .eq("role", "assistant")
    .eq("is_visible_to_user", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(STUDIO_SOURCE_RECENT_LIMIT * 2);
  if (error) throw operationFailed("list your recent chat messages", error);
  return (data ?? [])
    .map((row) => {
      const text = extractInspectableText(messageRowToRecord(row)).text;
      return {
        id: row.id,
        label: preview(text) || "(empty message)",
        sublabel: formatWhen(row.created_at),
      };
    })
    .filter((item) => item.label !== "(empty message)")
    .filter((item) => matches(search, item.label, item.id))
    .slice(0, STUDIO_SOURCE_RECENT_LIMIT);
}

async function loadAssistantMessage(id: string): Promise<LoadedStudioContent> {
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw operationFailed("open this chat message", error);
  if (!data) throw absent("chat message", "message", id, "chat.message");
  const record = messageRowToRecord(data);
  const { text, isStructuredRaw } = extractInspectableText(record);
  // THE ONE chat → registry builder — the same one the /chat bars call.
  const chat = buildChatMessageActions({
    conversationId: data.conversation_id,
    messageId: data.id,
    role: data.role === "user" ? "user" : "assistant",
    messageContent: text,
    contentIsStructuredRaw: isStructuredRaw,
    metadata:
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : null,
  });
  return {
    kind: "chat-message",
    id,
    title: `${data.role === "assistant" ? "Assistant" : data.role} message · ${formatWhen(data.created_at) ?? id}`,
    content: chat.content,
    contentSource: chat.source,
    sourceActions: chat.actions,
    notice: isStructuredRaw
      ? "This message has no text — its stored payload is shown as JSON."
      : undefined,
  };
}

// ─── Agent system prompts ────────────────────────────────────────────────────

async function listAgents(search: string): Promise<StudioSourceListItem[]> {
  const page = await fetchAgentBrowsePage(
    { ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, search },
    {
      sort: "updated",
      direction: "desc",
      favoritesFirst: false,
      pageSize: STUDIO_SOURCE_RECENT_LIMIT,
    },
  );
  return page.rows.map((row) => ({
    id: row.id,
    label: row.name || "Untitled agent",
    sublabel: row.description ? preview(row.description, 70) : undefined,
  }));
}

async function loadAgentPrompt(id: string): Promise<LoadedStudioContent> {
  const agent = await fetchSavedAgentDefinition(id);
  const system = agent.messages.find((m) => m.role === "system");
  const text = extractAgentSystemInstruction(system) ?? "";
  return {
    kind: "agent-prompt",
    id,
    title: `${agent.name || "Agent"} · system prompt`,
    content: text,
    contentSource: { type: "raw" },
    notice: text ? undefined : "This agent has no system prompt text.",
  };
}

// ─── Flashcards ──────────────────────────────────────────────────────────────

async function listCards(search: string): Promise<StudioSourceListItem[]> {
  const userId = requireUserId();
  // THE VIEW LAW: my own recent cards, bounded — a picker, not a list.
  const { data, error } = await supabase
    .schema("education")
    .from("fc_card")
    .select("id,front,back,updated_at")
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(STUDIO_SOURCE_RECENT_LIMIT * 2);
  if (error) throw operationFailed("list your recent flashcards", error);
  return (data ?? [])
    .filter((c) => matches(search, c.front, c.back, c.id))
    .slice(0, STUDIO_SOURCE_RECENT_LIMIT)
    .map((c) => ({
      id: c.id,
      label: flatten(c.front) || "(empty front)",
      sublabel: c.back ? flatten(c.back) : undefined,
      rich: true,
    }));
}

async function loadCardSide(
  side: "front" | "back",
  id: string,
): Promise<LoadedStudioContent> {
  const res = await fcService.getCardsByIds([id]);
  if (res.error) throw operationFailed("open this flashcard", res.error);
  const card = res.data?.[0];
  if (!card) throw absent("flashcard", "fc_card", id, "education.fc_card");
  const text = (side === "front" ? card.front : card.back) ?? "";
  return {
    kind: side === "front" ? "flashcard-front" : "flashcard-back",
    id,
    title: `Flashcard ${side} · ${flatten(card.front ?? "")}`,
    titleIsRich: true,
    content: text,
    contentSource: { type: "raw" },
    notice: text ? undefined : `This card's ${side} is empty.`,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const STUDIO_SOURCES: Record<StudioSourceKind, StudioSourceDef> = {
  document: {
    kind: "document",
    token: "document",
    label: "Document",
    icon: "FileText",
    // THE VIEW LAW: my own recent documents (never annotations — a sidecar type).
    list: async (search) => {
      const userId = requireUserId();
      const { data, error } = await supabase
        .schema("content")
        .from("document")
        .select("id, title, updated_at, document_type_id")
        .eq("created_by", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(STUDIO_SOURCE_RECENT_LIMIT * 2);
      if (error) throw operationFailed("list your recent documents", error);
      const { data: annotationType } = await supabase
        .schema("platform")
        .from("categories")
        .select("id")
        .eq("dimension", "document_type")
        .eq("slug", "annotation")
        .maybeSingle();
      return (data ?? [])
        .filter((d) => d.document_type_id !== annotationType?.id)
        .filter((d) => matches(search, d.title, d.id))
        .slice(0, STUDIO_SOURCE_RECENT_LIMIT)
        .map((d) => ({ id: d.id, label: d.title || "Untitled document", sublabel: formatWhen(d.updated_at) }));
    },
    load: async (id) => {
      const doc = await loadDocument(id);
      if (!doc) throw absent("document", "document", id, "content.document");
      return {
        kind: "document",
        id,
        title: doc.title,
        content: doc.body,
        contentSource: { type: "raw" },
        notice: "Annotate shows the live document; Studio and Editor work on a copy.",
      };
    },
  },
  note: {
    kind: "note",
    token: "note",
    label: "Note",
    icon: "StickyNote",
    list: async (search) =>
      (await NotesAPI.listItems())
        .filter((n) => matches(search, n.label, n.folder_name, n.id))
        .slice(0, STUDIO_SOURCE_RECENT_LIMIT)
        .map((n) => ({
          id: n.id,
          label: n.label || "Untitled note",
          sublabel: [n.folder_name, formatWhen(n.updated_at)]
            .filter(Boolean)
            .join(" · "),
        })),
    load: (id) => loadNoteContent("note", id),
  },
  "study-guide": {
    kind: "study-guide",
    token: "note",
    label: "Study guide",
    icon: "GraduationCap",
    list: async (search) =>
      (await loadStudyGuideIndex())
        .filter((n) => matches(search, n.label, n.folder_name, n.id))
        .slice(0, STUDIO_SOURCE_RECENT_LIMIT)
        .map((n) => ({
          id: n.id,
          label: n.label || "Untitled guide",
          sublabel: formatWhen(n.updated_at),
        })),
    load: (id) => loadNoteContent("study-guide", id),
  },
  "chat-message": {
    kind: "chat-message",
    token: "message",
    label: "Chat message",
    icon: "MessageSquare",
    list: listAssistantMessages,
    load: loadAssistantMessage,
  },
  "agent-prompt": {
    kind: "agent-prompt",
    token: "agent",
    label: "Agent prompt",
    icon: "Webhook",
    list: listAgents,
    load: loadAgentPrompt,
  },
  "flashcard-front": {
    kind: "flashcard-front",
    token: "fc_card",
    label: "Card front",
    icon: "PanelTop",
    list: listCards,
    load: (id) => loadCardSide("front", id),
  },
  "flashcard-back": {
    kind: "flashcard-back",
    token: "fc_card",
    label: "Card back",
    icon: "PanelBottom",
    list: listCards,
    load: (id) => loadCardSide("back", id),
  },
  "admin-sample": {
    kind: "admin-sample",
    token: "admin_markdown_sample",
    label: "Test sample",
    icon: "FlaskConical",
    adminOnly: true,
    list: async (search) =>
      (await listSamples())
        .filter((s) => matches(search, s.name, s.description, s.id))
        .slice(0, STUDIO_SOURCE_RECENT_LIMIT * 3)
        .map((s) => ({
          id: s.id,
          label: s.name,
          sublabel: (s.detected_blocks ?? []).join(", ") || undefined,
        })),
    load: async (id) => {
      const sample = await getSample(id);
      if (!sample)
        throw absent(
          "test sample",
          "admin_markdown_sample",
          id,
          "admin.admin_markdown_samples",
        );
      return {
        kind: "admin-sample",
        id,
        title: sample.name,
        content: sample.content,
        contentSource: { type: "raw" },
      };
    },
  },
};

/** A zero-row single-record read: the platform's honest absent-record error
 *  (never a database string), carrying the token AccessGate resolves. */
function absent(
  entity: string,
  token: string,
  recordId: string,
  relation: string,
): Error {
  return recordUnavailable({ entity, reason: "unknown", recordId, token, relation });
}

/**
 * THE ONE door every studio load goes through. A malformed id is an absent
 * record (never a Postgres cast error); a zero-row read stays a
 * RecordUnavailableError for <AccessGate>; any other failure becomes a plain
 * "We couldn't open this …" with the raw response kept as `cause` for the
 * Error Inspector. No database text ever reaches a person (RC-B1 verify r2).
 */
export async function loadStudioSource(
  kind: StudioSourceKind,
  id: string,
): Promise<LoadedStudioContent> {
  const def = STUDIO_SOURCES[kind];
  const label = def.label.toLowerCase();
  if (!isUuid(id)) throw absent(label, def.token, id, def.token);
  try {
    return await def.load(id);
  } catch (err) {
    if (isRecordUnavailableError(err)) throw err;
    if (err instanceof Error && err.message.startsWith("We couldn't")) throw err;
    throw operationFailed(`open this ${label}`, err);
  }
}

/** The same door for the picker's recent lists. */
export async function listStudioSource(
  kind: StudioSourceKind,
  search: string,
): Promise<StudioSourceListItem[]> {
  const def = STUDIO_SOURCES[kind];
  try {
    return await def.list(search);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("We couldn't")) throw err;
    throw operationFailed(`list your recent ${def.label.toLowerCase()}s`, err);
  }
}

export function isStudioSourceKind(value: string | null): value is StudioSourceKind {
  return !!value && (STUDIO_SOURCE_KINDS as readonly string[]).includes(value);
}

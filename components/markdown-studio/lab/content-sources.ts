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

import type { ContentSource } from "@/features/rich-document/types";
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
import { requireUserId } from "@/utils/auth/getUserId";

export const STUDIO_SOURCE_KINDS = [
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
}

export interface LoadedStudioContent {
  kind: StudioSourceKind;
  id: string;
  title: string;
  content: string;
  /** The RichDocument source the action toolkit receives. */
  contentSource: ContentSource;
  /** Human note shown beside the title (e.g. "structured payload shown as JSON"). */
  notice?: string;
}

export interface StudioSourceDef {
  kind: StudioSourceKind;
  label: string;
  /** Lucide icon name for the picker (rendered by the picker). */
  icon: string;
  adminOnly?: boolean;
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
  if (!note) throw new Error(`No note with id ${id} is visible to you.`);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No chat message with id ${id} is visible to you.`);
  const record = messageRowToRecord(data);
  const { text, isStructuredRaw } = extractInspectableText(record);
  return {
    kind: "chat-message",
    id,
    title: `${data.role === "assistant" ? "Assistant" : data.role} message · ${formatWhen(data.created_at) ?? id}`,
    content: text,
    contentSource: {
      type: "chat-message",
      messageId: data.id,
      conversationId: data.conversation_id,
    },
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
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((c) => matches(search, c.front, c.back, c.id))
    .slice(0, STUDIO_SOURCE_RECENT_LIMIT)
    .map((c) => ({
      id: c.id,
      label: preview(c.front || "(empty front)"),
      sublabel: c.back ? preview(c.back, 70) : undefined,
    }));
}

async function loadCardSide(
  side: "front" | "back",
  id: string,
): Promise<LoadedStudioContent> {
  const res = await fcService.getCardsByIds([id]);
  if (res.error) throw new Error(res.error);
  const card = res.data?.[0];
  if (!card) throw new Error(`No flashcard with id ${id} is visible to you.`);
  const text = (side === "front" ? card.front : card.back) ?? "";
  return {
    kind: side === "front" ? "flashcard-front" : "flashcard-back",
    id,
    title: `Flashcard ${side} · ${preview(card.front ?? "", 40)}`,
    content: text,
    contentSource: { type: "raw" },
    notice: text ? undefined : `This card's ${side} is empty.`,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const STUDIO_SOURCES: Record<StudioSourceKind, StudioSourceDef> = {
  note: {
    kind: "note",
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
    label: "Chat message",
    icon: "MessageSquare",
    list: listAssistantMessages,
    load: loadAssistantMessage,
  },
  "agent-prompt": {
    kind: "agent-prompt",
    label: "Agent prompt",
    icon: "BrainCircuit",
    list: listAgents,
    load: loadAgentPrompt,
  },
  "flashcard-front": {
    kind: "flashcard-front",
    label: "Card front",
    icon: "PanelTop",
    list: listCards,
    load: (id) => loadCardSide("front", id),
  },
  "flashcard-back": {
    kind: "flashcard-back",
    label: "Card back",
    icon: "PanelBottom",
    list: listCards,
    load: (id) => loadCardSide("back", id),
  },
  "admin-sample": {
    kind: "admin-sample",
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
      if (!sample) throw new Error(`No test sample with id ${id}.`);
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

export function isStudioSourceKind(value: string | null): value is StudioSourceKind {
  return !!value && (STUDIO_SOURCE_KINDS as readonly string[]).includes(value);
}

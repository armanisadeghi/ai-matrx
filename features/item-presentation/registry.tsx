"use client";

/**
 * Item Presentation — the registry.
 *
 * THE platform primitive. One entry per item type. Adding a new presentable
 * item = one entry here (icon, accent, how to enrich it from the DB, how to
 * open it). The renderer and the enrichment hook are generic — they read this
 * map and never special-case a type inline.
 *
 * Unknown types intentionally have NO entry; `getItemConfig` returns the
 * neutral fallback so the card still renders beautifully and never errors.
 */

import type { ComponentType } from "react";
import {
  Webhook,
  AppWindow,
  StickyNote,
  CheckSquare,
  FolderKanban,
  Layers,
  Tag,
  Box,
  Image as ImageIcon,
  Video,
  AudioLines,
  File as FileIcon,
  MessagesSquare,
  MonitorPlay,
  Table2,
  ListChecks,
  BookOpen,
  FileText,
  MessageSquare,
  Mail,
  BrainCircuit,
  Contact,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTITY_TYPE_METADATA } from "@ai-matrx/associations";

import type { EnrichedItem, ItemType, KnownItemType } from "./types";
import type { DetailRecordType } from "@/lib/detail/types";
import { GOOGLE_DOCUMENT_ITEM_TYPE } from "@/features/google-workspace/documents/itemType";
import { CALENDAR_EVENT_ITEM_TYPE } from "@/features/google-workspace/calendar/itemType";
import { WEB_SITE_ITEM_TYPE } from "@/features/marketing/site-item-type";
import { formatFileSize } from "@ai-matrx/kit/format";
import { refinePartyDetail } from "@/features/crm/party-detail";
import { partyKindWord } from "@/features/crm/party-words";

export interface ItemTypeConfig {
  /** Stable key — the enum value. */
  type: KnownItemType;
  /** Human, non-technical label shown on the type badge. */
  label: string;
  /** Lucide icon component. */
  icon: ComponentType<{ className?: string }>;
  /**
   * Accent classes for the icon chip. Uses semantic-ish Tailwind tokens so it
   * reads well in light + dark. `text` is the icon color, `bg` the chip bg,
   * `ring` the subtle border/glow.
   */
  accent: { text: string; bg: string; ring: string };
  /**
   * Pull authoritative data from the DB for this id. Returns `notFound: true`
   * when the row is missing. NEVER throws — the hook wraps it, but keep each
   * fetcher defensive anyway. Omit to mark the type "recognized but not
   * enrichable yet" (still gets custom styling, just no DB round-trip).
   */
  enrich?: (supabase: SupabaseClient, id: string) => Promise<EnrichedItem>;
  /**
   * The canonical entity-registry token for this item type, when it DIFFERS
   * from `type`. THE DOOR LAW: doors resolve from the entity registry
   * (`features/scopes/registry/entityRegistry.ts`), and most item types are
   * already spelled the same there — but a few are not, and a mismatch means
   * the record silently gets no route and no peek.
   *
   * Only set this when the two vocabularies genuinely name the SAME table.
   * Every entry below was matched by `schema.table` against
   * `ENTITY_TYPE_METADATA` (`@ai-matrx/associations`), never by name similarity: a
   * token that resolves to a different table would open the WRONG record,
   * which is worse than offering no door at all.
   */
  entityToken?: string;
  /**
   * How this item opens in a window panel. The renderer maps this discriminant
   * to the matching overlay opener hook. Omit when no panel exists yet — the
   * card stays informative and the action button is hidden.
   */
  open?: ItemOpenKind;
  /**
   * Where the Detail primitive (`lib/detail`, via `detail.tsx`) reads the
   * full record from. Types without a bespoke window use this to open a
   * clean, formatted detail view (every scalar column rendered) in the
   * window, docked and page presentations. Omit for a type with no single
   * canonical table (session/message) — the detail still opens, seed-only.
   */
  /**
   * 🚨 THE ONE WAY A TYPE OWNS ITS DETAIL WITHOUT A SECOND REGISTRY.
   *
   * `detail.tsx` composes every registration generically (loader, formatted
   * fields, health producer, frame). A few record types genuinely know more than
   * a column dump can say — a synced Google file's own `sync_status`, a cached
   * body that must not be printed as a field, a composer that writes back to the
   * provider. Such a type refines the generic registration HERE, once, and every
   * presentation (window, docked, page) inherits the refinement, because they all
   * read the same `DetailRecordType`.
   *
   * It is a refinement, never a replacement: it receives the composed base and
   * returns it changed. A type that omits it behaves exactly as before.
   */
  refineDetail?: (base: DetailRecordType) => DetailRecordType;
  detailSource?: {
    /** Table to `select('*')` from, keyed by `id`. */
    table: string;
    /**
     * Non-`public` Postgres schema `table` lives in, if any. Reached via
     * `.schema(schemaName)`. Omitted ⇒ `public`. (Set for the workspace domain
     * after the 2026 restructure moved projects/tasks to the `workspace` schema.)
     */
    schemaName?: string;
    /** Column to use as the window title (falls back to the seed name). */
    titleField?: string;
  };
}

/**
 * Discriminant for "what window does clicking open". Kept as data (not a
 * function) because openers are React hooks and must be called from the
 * component. See `useOpenItemPresentation`.
 */
export type ItemOpenKind =
  | { kind: "agent" }
  | { kind: "note" }
  | { kind: "file" }
  | { kind: "structured_list" }
  // Legacy read-only alias for pre-rename payloads (routes to the same opener).
  | { kind: "picklist" }
  // Wired as openers ship for these types (an agent is building them). Each
  // becomes one branch in `useOpenItemPresentation` + one `open` entry here.
  | { kind: "app" }
  | { kind: "task" }
  | { kind: "project" }
  | { kind: "scope" }
  | { kind: "scope_type" }
  | { kind: "context_item" }
  | { kind: "session" }
  | { kind: "table" }
  | { kind: "workbook" }
  | { kind: "document" }
  | { kind: "conversation" }
  | { kind: "message" }
  | { kind: "email" }
  | { kind: "party" }
  | { kind: "google_document" }
  | { kind: "calendar_event" }
  | { kind: "web_site" }
  | { kind: "web_youtube_video" };

// ---------------------------------------------------------------------------
// Enrichment helpers
// ---------------------------------------------------------------------------

const clip = (v: unknown, max = 160): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const titleCase = (v: unknown): string | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

/**
 * Generic single-row fetcher: select `cols` from `table` where id = id, then
 * map the row into an EnrichedItem. Centralizes the not-found + error shape so
 * each type's enrich() is a one-liner.
 */
async function fetchRow(
  supabase: SupabaseClient,
  table: string,
  id: string,
  cols: string,
  map: (row: Record<string, unknown>) => EnrichedItem,
  schema?: string,
): Promise<EnrichedItem> {
  const db = schema ? supabase.schema(schema) : supabase;
  const { data, error } = await db
    .from(table)
    .select(cols)
    .eq("id", id)
    .maybeSingle();
  if (error) return {}; // soft-fail — keep the agent-provided fields
  if (!data) return { notFound: true };
  return map(data as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * `files.files`, for the Detail primitive (`lib/detail`). The click-through
 * for a file stays the bespoke preview window; the detail primitive reads the
 * row here when a file is opened as a record (window / docked / page).
 */
const FILE_DETAIL_SOURCE: NonNullable<ItemTypeConfig["detailSource"]> = {
  table: "files",
  schemaName: "files",
  titleField: "file_name",
};

const REGISTRY: Record<KnownItemType, ItemTypeConfig> = {
  agent: {
    type: "agent",
    label: "Agent",
    icon: Webhook,
    accent: {
      text: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10",
      ring: "ring-violet-500/20",
    },
    open: { kind: "agent" },
    // 🚨 NEW-9 — the SAME canonical table the enrichment below reads. A type with
    // no `detailSource` took the honest-absent path, so `/detail/agent/<id>` — a
    // URL anyone can build — showed nothing about a record that is fully stored.
    detailSource: { table: "definition", schemaName: "agent", titleField: "name" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "definition",
        id,
        "name, description, category, model_id",
        (r) => ({
          name: clip(r.name, 80),
          about: clip(r.description),
          details: [
            r.category
              ? { label: "Category", value: titleCase(r.category)! }
              : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "agent",
      ),
  },
  app: {
    type: "app",
    label: "App",
    icon: AppWindow,
    accent: {
      text: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
      ring: "ring-sky-500/20",
    },
    open: { kind: "app" },
    detailSource: { table: "definition", schemaName: "app", titleField: "name" },
    enrich: (s, id) =>
      fetchRow(s, "definition", id, "name, description", (r) => ({
        name: clip(r.name, 80),
        about: clip(r.description),
      }), "app"),
  },
  note: {
    type: "note",
    label: "Note",
    icon: StickyNote,
    accent: {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      ring: "ring-amber-500/20",
    },
    open: { kind: "note" },
    // NEW-9 — `workbench.notes`, the table the enrichment below already reads.
    detailSource: { table: "notes", schemaName: "workbench", titleField: "label" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "notes",
        id,
        "label, content, folder_name",
        (r) => ({
          name: clip(r.label, 80),
          about: clip(r.content),
          details: [
            r.folder_name
              ? { label: "Folder", value: String(r.folder_name) }
              : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "workbench",
      ),
  },
  task: {
    type: "task",
    label: "Task",
    icon: CheckSquare,
    accent: {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      ring: "ring-emerald-500/20",
    },
    open: { kind: "task" },
    detailSource: {
      table: "tasks",
      schemaName: "workspace",
      titleField: "title",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "tasks",
        id,
        "title, description, status, priority",
        (r) => ({
          name: clip(r.title, 80),
          about: clip(r.description),
          details: [
            r.status ? { label: "Status", value: titleCase(r.status)! } : null,
            r.priority
              ? { label: "Priority", value: titleCase(r.priority)! }
              : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "workspace",
      ),
  },
  project: {
    type: "project",
    label: "Project",
    icon: FolderKanban,
    accent: {
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      ring: "ring-blue-500/20",
    },
    open: { kind: "project" },
    detailSource: {
      table: "projects",
      schemaName: "workspace",
      titleField: "name",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "projects",
        id,
        "name, description, status, priority",
        (r) => ({
          name: clip(r.name, 80),
          about: clip(r.description),
          details: [
            r.status ? { label: "Status", value: titleCase(r.status)! } : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "workspace",
      ),
  },
  scope_type: {
    type: "scope_type",
    label: "Scope Type",
    icon: Layers,
    accent: {
      text: "text-fuchsia-600 dark:text-fuchsia-400",
      bg: "bg-fuchsia-500/10",
      ring: "ring-fuchsia-500/20",
    },
    open: { kind: "scope_type" },
    detailSource: {
      table: "scope_types",
      schemaName: "context",
      titleField: "label_singular",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "scope_types",
        id,
        "label_singular, label_plural, description",
        (r) => ({
          name: clip(r.label_singular, 80) ?? clip(r.label_plural, 80),
          about: clip(r.description),
        }),
        "context",
      ),
  },
  scope: {
    type: "scope",
    label: "Scope",
    icon: Tag,
    accent: {
      text: "text-pink-600 dark:text-pink-400",
      bg: "bg-pink-500/10",
      ring: "ring-pink-500/20",
    },
    open: { kind: "scope" },
    detailSource: {
      table: "scopes",
      schemaName: "context",
      titleField: "name",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "scopes",
        id,
        "name, description",
        (r) => ({
          name: clip(r.name, 80),
          about: clip(r.description),
        }),
        "context",
      ),
  },
  context_item: {
    type: "context_item",
    label: "Context Item",
    icon: Box,
    accent: {
      text: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-500/10",
      ring: "ring-indigo-500/20",
    },
    open: { kind: "context_item" },
    detailSource: {
      table: "context_items",
      schemaName: "context",
      titleField: "display_name",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "context_items",
        id,
        "display_name, description, value_type",
        (r) => ({
          name: clip(r.display_name, 80),
          about: clip(r.description),
          details: [
            r.value_type
              ? { label: "Value Type", value: titleCase(r.value_type)! }
              : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "context",
      ),
  },
  image: {
    type: "image",
    label: "Image",
    icon: ImageIcon,
    accent: {
      text: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10",
      ring: "ring-rose-500/20",
    },
    open: { kind: "file" },
    detailSource: FILE_DETAIL_SOURCE,
    enrich: (s, id) => enrichFile(s, id),
  },
  video: {
    type: "video",
    label: "Video",
    icon: Video,
    accent: {
      text: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
      ring: "ring-red-500/20",
    },
    open: { kind: "file" },
    detailSource: FILE_DETAIL_SOURCE,
    enrich: (s, id) => enrichFile(s, id),
  },
  audio: {
    type: "audio",
    label: "Audio",
    icon: AudioLines,
    accent: {
      text: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-500/10",
      ring: "ring-orange-500/20",
    },
    open: { kind: "file" },
    detailSource: FILE_DETAIL_SOURCE,
    enrich: (s, id) => enrichFile(s, id),
  },
  file: {
    type: "file",
    label: "File",
    icon: FileIcon,
    accent: {
      text: "text-slate-600 dark:text-slate-300",
      bg: "bg-slate-500/10",
      ring: "ring-slate-500/20",
    },
    open: { kind: "file" },
    detailSource: FILE_DETAIL_SOURCE,
    enrich: (s, id) => enrichFile(s, id),
  },
  session: {
    type: "session",
    label: "Session",
    icon: MessagesSquare,
    accent: {
      text: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-500/10",
      ring: "ring-teal-500/20",
    },
    // 🚨 DELIBERATELY SOURCELESS, and the only one left after NEW-9's census
    // (VERIFY-U-P1-R3): there is no single canonical "session" table — war-room,
    // studio, window and quiz sessions all qualify — so a detail cannot know
    // which to read. The Detail primitive's honest absent state carries it: the
    // record is named from its type and id, one plain sentence says nothing more
    // is stored here, and the doors it has still open. See FOUND_DEFECTS D8; when
    // one table is chosen, this entry gets a `detailSource` and nothing else
    // changes.
    open: { kind: "session" },
  },
  table: {
    type: "table",
    // workbench.udt_datasets — same table as the `dataset` token.
    entityToken: "dataset",
    label: "Table",
    icon: Table2,
    accent: {
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-500/10",
      ring: "ring-cyan-500/20",
    },
    open: { kind: "table" },
    detailSource: { table: "udt_datasets", schemaName: "workbench", titleField: "table_name" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "udt_datasets",
        id,
        "table_name, description",
        (r) => ({
          name: clip(r.table_name, 80),
          about: clip(r.description),
        }),
        "workbench",
      ),
  },
  structured_list: {
    type: "structured_list",
    label: "Structured List",
    icon: ListChecks,
    accent: {
      text: "text-lime-600 dark:text-lime-400",
      bg: "bg-lime-500/10",
      ring: "ring-lime-500/20",
    },
    open: { kind: "structured_list" },
    // NEW-9 — `workbench.udt_structured_lists`, as the enrichment below reads it.
    detailSource: {
      table: "udt_structured_lists",
      schemaName: "workbench",
      titleField: "list_name",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "udt_structured_lists",
        id,
        "list_name, description",
        (r) => ({
          name: clip(r.list_name, 80),
          about: clip(r.description),
        }),
        "workbench",
      ),
  },
  // Legacy read-only alias: pre-rename payloads with type "picklist" still open.
  // New payloads use "structured_list". See common-docs/projects/structured-lists-rename.
  picklist: {
    type: "picklist",
    // workbench.udt_structured_lists — the pre-rename spelling of the
    // `structured_list` token, reading the identical table.
    entityToken: "structured_list",
    label: "Structured List",
    icon: ListChecks,
    accent: {
      text: "text-lime-600 dark:text-lime-400",
      bg: "bg-lime-500/10",
      ring: "ring-lime-500/20",
    },
    open: { kind: "structured_list" },
    // NEW-9 — `workbench.udt_structured_lists`, as the enrichment below reads it.
    detailSource: {
      table: "udt_structured_lists",
      schemaName: "workbench",
      titleField: "list_name",
    },
    enrich: (s, id) =>
      fetchRow(
        s,
        "udt_structured_lists",
        id,
        "list_name, description",
        (r) => ({
          name: clip(r.list_name, 80),
          about: clip(r.description),
        }),
        "workbench",
      ),
  },
  workbook: {
    type: "workbook",
    label: "Workbook",
    icon: BookOpen,
    accent: {
      text: "text-green-600 dark:text-green-400",
      bg: "bg-green-500/10",
      ring: "ring-green-500/20",
    },
    open: { kind: "workbook" },
    detailSource: { table: "udt_workbooks", schemaName: "workbench", titleField: "workbook_name" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "udt_workbooks",
        id,
        "workbook_name, description",
        (r) => ({
          name: clip(r.workbook_name, 80),
          about: clip(r.description),
        }),
        "workbench",
      ),
  },
  document: {
    type: "document",
    // workbench.udt_documents — same table as the `udt_document` token.
    entityToken: "udt_document",
    label: "Document",
    icon: FileText,
    accent: {
      text: "text-stone-600 dark:text-stone-300",
      bg: "bg-stone-500/10",
      ring: "ring-stone-500/20",
    },
    open: { kind: "document" },
    detailSource: { table: "udt_documents", schemaName: "workbench", titleField: "document_name" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "udt_documents",
        id,
        "document_name, description",
        (r) => ({
          name: clip(r.document_name, 80),
          about: clip(r.description),
        }),
        "workbench",
      ),
  },
  conversation: {
    type: "conversation",
    label: "Chat",
    icon: MessagesSquare,
    accent: {
      text: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
      ring: "ring-sky-500/20",
    },
    entityToken: "conversation",
    // Opens the floating Chat window on this conversation (agentRunWindow's
    // initialSelectedConversationId) — the reference chip's "Open conversation"
    // silently no-oped before this entry existed.
    open: { kind: "conversation" },
    detailSource: { table: "conversation", schemaName: "chat", titleField: "title" },
  },
  message: {
    type: "message",
    label: "Message",
    icon: MessageSquare,
    accent: {
      text: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/10",
      ring: "ring-purple-500/20",
    },
    open: { kind: "message" },
    // 'message' = a chat/conversation message; chat.message is canonical
    // (dm_messages/sms_messages are distinct comms entities). See FOUND_DEFECTS D8.
    detailSource: { table: "message", schemaName: "chat", titleField: "role" },
  },
  email: {
    type: "email",
    label: "Email",
    icon: Mail,
    accent: {
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      ring: "ring-blue-500/20",
    },
    open: { kind: "email" },
    detailSource: { table: "emails", schemaName: "communication", titleField: "subject" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "emails",
        id,
        "subject, sender, recipient",
        (r) => ({
          name: clip(r.subject, 80),
          about: r.sender ? `From ${String(r.sender)}` : undefined,
          details: [
            r.recipient ? { label: "To", value: String(r.recipient) } : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "communication",
      ),
  },
  // 🚨 F-40 — AN EXISTING PERSON OPENS IN PLACE. `crm.party` is THE record for
  // an external person (and, by `party_kind`, a company). Every surface that
  // names one — the approvals queue's contact-import card, the outreach dialogs,
  // the PR/backlink prospect tables, the CRM inbox — draws it as an `EntityRef`
  // on the `party` token, and the token had NO in-place presentation: no peek was
  // registered, and the only party window CREATES a record. So the reviewer of a
  // contact-import proposal had to leave the queue to find out who it was about
  // (lane F-36, Bugbot round 20 on PR 228).
  //
  // This entry is the whole fix: it is THE type map the Detail primitive reads,
  // so the Person now shows as a window (the default), a docked panel or
  // `/detail/party/<id>` from ONE registration, with no bespoke Person panel
  // anywhere. The full 360° workspace stays at `/crm/<id>` and the detail's own
  // doors reach it.
  //
  // 🚨 N6 (VERIFY-U-P1-R5) — THE TYPE'S LABEL IS THE HONEST GENERIC WORD.
  // `crm.party` holds 1,892 rows: 460 `person` and 1,432 `organization` (read
  // live 2026-09-18). The label was "Person", and a registration's label is per
  // TYPE, not per row, so three records in four were labelled "Person" — twice
  // on screen, above a field reading `organization`. A label resolved at type
  // time cannot know the kind, so it says what IS true of every row: this is a
  // contact record. "Contact" is the CRM's own existing generic ("Open contact
  // record", `record_class = 'contact'`); nothing is coined here, and the
  // specific word — Person or Company — is the ONE resolver in
  // `features/crm/party-words.ts`, which says it on the card (`enrich` below),
  // in the dossier's own Type field, in the peek title and in the stand-in title
  // of a record that has not loaded (`refineDetail`, below).
  // WHAT IS STILL OWED: the TYPE CHIP in the detail header. `DetailRecordType`
  // carries `label: string` with no per-row form, so the chip reads "Contact"
  // for a Person too. The package change that fixes it is recorded in this
  // feature's FEATURE.md (escalation C) — `labelForRow?: (row) => string | null`,
  // used for the chip and the stand-in titles while `label` keeps answering the
  // type-level settings sentences ("every contact record opens as a window").
  party: {
    type: "party",
    label: "Contact",
    icon: Contact,
    accent: {
      text: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-500/10",
      ring: "ring-teal-500/20",
    },
    open: { kind: "party" },
    detailSource: { table: "party", schemaName: "crm", titleField: "display_name" },
    // 🚨 N5/N6 — the Person/Company DOSSIER, as ONE refinement of the composed
    // registration: the curated, ordered, human-labelled field list instead of
    // `select *` in PostgREST key order; the reads it needs beyond one table
    // (contact points, the employer's name); and a nameless record named by its
    // OWN kind. Nothing here is a second type map or a second renderer.
    refineDetail: refinePartyDetail,
    enrich: (s, id) =>
      fetchRow(
        s,
        "party",
        id,
        "display_name, party_kind, job_title, headline, primary_domain",
        (r) => ({
          name: clip(r.display_name, 80),
          about: clip(r.job_title, 120) ?? clip(r.headline),
          details: [
            r.party_kind
              ? { label: "Type", value: partyKindWord(r.party_kind) }
              : null,
            r.primary_domain
              ? { label: "Domain", value: String(r.primary_domain) }
              : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "crm",
      ),
  },
  // 🚨 U-W1 — A CONNECTED GOOGLE FILE IS A RECORD THAT OPENS. Its registration
  // lives beside its own feature (`features/google-workspace/documents/`); this
  // map is where the platform learns about it.
  google_document: GOOGLE_DOCUMENT_ITEM_TYPE,
  calendar_event: CALENDAR_EVENT_ITEM_TYPE,
  // 🚨 F-87 — A MARKETING SITE OPENS IN PLACE. Its registration lives beside
  // its own feature (`features/marketing/site-item-type.ts`); this map is where
  // the platform learns about it. The key is the canonical entity token
  // (`web_site`), so no `entityToken` alias is needed and no twin exists.
  web_site: WEB_SITE_ITEM_TYPE,
  // 🚨 V-22 NEW-6 — THE THIRD GOOGLE MIRROR TABLE IS A RECORD THAT OPENS.
  // `web.youtube_video` is a live, active, `is_listed` entity
  // (`platform.entity_types.token = 'web_youtube_video'`) and the third mirror
  // beside `communication.calendar_event` and `workbench.google_document`: same
  // shape (`external_id`, `external_url`, `synced_at`, `sync_status`), and its
  // connection side is `channel_resource_id →
  // users.integration_connection_resources` (read live 2026-09-18). It had no
  // entry here and none in the entity registry, so a YouTube video had no door
  // in any form — `/detail/web_youtube_video/<id>`, a URL anyone can build,
  // showed nothing about a fully stored record.
  //
  // It is registered INLINE rather than beside a feature because no feature owns
  // this table in this repo yet: `/marketing/tools/youtube/videos/<id>` is keyed
  // on YouTube's own external id via `/research/youtube/videos/{video_id}`, a
  // different identity. When a YouTube surface lands it takes this entry over,
  // the way `features/marketing/site-item-type.ts` did for a site.
  web_youtube_video: {
    type: "web_youtube_video",
    label: "YouTube video",
    icon: MonitorPlay,
    accent: {
      text: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
      ring: "ring-red-500/20",
    },
    // No bespoke window exists, so it opens the Detail primitive — window by
    // default, docked or page per the person's own setting.
    open: { kind: "web_youtube_video" },
    detailSource: { table: "youtube_video", schemaName: "web", titleField: "title" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "youtube_video",
        id,
        "title, description, external_url, sync_status",
        (r) => ({
          name: clip(r.title, 80),
          about: clip(r.description),
          details: [
            r.sync_status
              ? { label: "Sync", value: titleCase(r.sync_status) ?? String(r.sync_status) }
              : null,
          ].filter(Boolean) as EnrichedItem["details"],
        }),
        "web",
      ),
  },
};

async function enrichFile(
  supabase: SupabaseClient,
  id: string,
): Promise<EnrichedItem> {
  return fetchRow(
    supabase,
    "files",
    id,
    "file_name, mime_type, size_bytes",
    (r) => ({
      name: clip(r.file_name, 80),
      about: clip(r.mime_type, 60),
      details: [
        typeof r.size_bytes === "number"
          ? { label: "Size", value: formatFileSize(r.size_bytes) }
          : null,
      ].filter(Boolean) as EnrichedItem["details"],
    }),
    "files",
  );
}

/** The neutral fallback for an unrecognized / missing type. Never null. */
export const FALLBACK_CONFIG: ItemTypeConfig = {
  type: "file" /* placeholder; not used for routing */,
  label: "Item",
  icon: BrainCircuit,
  accent: {
    text: "text-zinc-500 dark:text-zinc-400",
    bg: "bg-zinc-500/10",
    ring: "ring-zinc-500/20",
  },
};

/**
 * Resolve a type string to its config. Returns the FALLBACK_CONFIG (with the
 * raw type echoed as the label) for anything not in the registry — so a brand
 * new or misspelled enum still renders a clean card.
 */
/**
 * The canonical entity token to resolve doors with for an item type.
 *
 * Most item types ARE their token, so this returns the type itself; the few
 * that diverge declare `entityToken` on their registry entry. Consumers should
 * never hand a raw `ItemType` to `resolveEntityDoors` — that is what silently
 * cost `table` / `document` / `picklist` their route and peek.
 *
 * Unknown types pass through unchanged and simply resolve to no doors.
 */
export function entityTokenForItemType(
  type: ItemType | null | undefined,
): string | null {
  if (typeof type !== "string" || !type) return null;
  const { config, recognized } = getItemConfig(type);
  return recognized ? (config.entityToken ?? type) : type;
}

/**
 * 🚨 THE DOOR'S TYPE COMES FROM THE SERVER'S `record_table`, NEVER FROM A
 * CONSTANT (lane F-93, hostile verifier V-22, finding NEW-9).
 *
 * Our servers stamp `record_id`, **`record_table`** (`"schema.table"`, e.g.
 * `"communication.calendar_event"` — `aidream/services/google_workspace/tools.py`)
 * and `record_sync_status` onto each row they name. A reader that hardcodes the
 * item type beside `record_id` is confidently wrong the moment the stamp says
 * something else: V-22 fed a calendar-shaped payload carrying
 * `record_table: "media.source_library"` to the agenda door in
 * `components/mardown-display/blocks/google-kinds/GoogleWorkspaceResultBlock.tsx`
 * (`<RecordDoor type="calendar_event" id={event.record_id}>`) and got an "Open"
 * control that opens a `calendar_event` with a foreign id. That is the V-21
 * `document → udt_document` defect in a new place: the protection a token-driven
 * reader has — `RecordDoor` renders NOTHING for a type it does not recognise — is
 * exactly what a hardcoded type throws away.
 *
 * This is the one resolution, derived from THE type map itself (`detailSource`'s
 * schema + table), so a type registered tomorrow is resolvable with no edit here.
 * An unknown table returns `null`, and a caller must then render no door at all:
 * a door to the wrong record reads as a fact and is a lie (`no-dead-ends`, rule
 * 4). It never guesses from a bare table name, because table names repeat across
 * schemas (`agent.definition` and `mandate.definition`).
 *
 * Callers: pass `record_table` when the payload carries one and fall back to the
 * surface's own type only when it does not.
 */
const RECORD_TABLE_TO_ITEM_TYPE: ReadonlyMap<string, KnownItemType> = (() => {
  const map = new Map<string, KnownItemType>();
  const add = (key: string, type: KnownItemType): void => {
    // FIRST registration wins, which is the canonical one: `structured_list` is
    // declared before its legacy read-only alias `picklist`, and both point at
    // `workbench.udt_structured_lists`.
    if (!map.has(key.toLowerCase())) map.set(key.toLowerCase(), type);
  };
  for (const [type, config] of Object.entries(REGISTRY) as [
    KnownItemType,
    ItemTypeConfig,
  ][]) {
    const source = config.detailSource;
    if (source) add(`${source.schemaName ?? "public"}.${source.table}`, type);
    // A type may own its load through `refineDetail` and declare no
    // `detailSource` at all (`google_document` does), so the token's own live
    // registry row answers too — `ENTITY_TYPE_METADATA` is generated from
    // `platform.entity_types`, which is where `record_table` comes from in the
    // first place.
    const token = config.entityToken ?? type;
    const meta = (
      ENTITY_TYPE_METADATA as Record<string, { schema: string; table: string }>
    )[token];
    if (meta) add(`${meta.schema}.${meta.table}`, type);
  }
  return map;
})();

/**
 * 🚨 EVERY REGISTERED ENTITY'S TABLE, NOT ONLY THE ITEM TYPES' (lane F-104,
 * hostile verifier V-23, finding NEW-6).
 *
 * `RECORD_TABLE_TO_ITEM_TYPE` above answers ONE question — "which item type
 * does the Detail primitive open for this table" — and the honest answer for
 * `media.source_library` is `null`, because no item type reads it. V-23's
 * attack is what a reader then DID with that null: it rendered no control at
 * all for a record the card had just named, although `media_source_library` is
 * a registered entity whose `hrefFor` (`/libraries/<id>`) is a working screen.
 *
 * Ruling R35: `hrefFor` is the durable address and `useOpenItemPresentation` is
 * the door, and BOTH are required. So a stamp resolves in TWO legs, and only a
 * table NO registered entity claims resolves to nothing:
 *
 *   1. the entity TOKEN the table backs — from `ENTITY_TYPE_METADATA`, which is
 *      generated from `platform.entity_types`, the same row `record_table` is
 *      stamped from, so every one of the 800+ live tokens is declared here with
 *      no per-entity edit (the declaration this campaign looked for already
 *      exists: `{ token, schema, table }` on every row);
 *   2. the ITEM TYPE with an in-place opener, when one reads that same table.
 *
 * A caller renders the opener when leg 2 answers, the token's own durable
 * address when only leg 1 does, and nothing at all when neither does.
 */
const TOKENS_BY_RECORD_TABLE: ReadonlyMap<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const meta of Object.values(
    ENTITY_TYPE_METADATA as Record<
      string,
      { token: string; schema: string; table: string }
    >,
  )) {
    if (!meta?.token || !meta.schema || !meta.table) continue;
    const key = `${meta.schema}.${meta.table}`.toLowerCase();
    const held = map.get(key);
    if (held) held.push(meta.token);
    else map.set(key, [meta.token]);
  }
  return map;
})();

/** Entity token → the item type that opens it in place, when one exists. */
const ITEM_TYPE_BY_ENTITY_TOKEN: ReadonlyMap<string, KnownItemType> = (() => {
  const map = new Map<string, KnownItemType>();
  for (const [type, config] of Object.entries(REGISTRY) as [
    KnownItemType,
    ItemTypeConfig,
  ][]) {
    const token = config.entityToken ?? type;
    if (!map.has(token)) map.set(token, type);
  }
  return map;
})();

/** What a `record_table` stamp resolves to — both legs of R35, or null. */
export interface RecordTableTarget {
  /** The registered entity token backing that table. */
  token: string;
  /** The item type that opens it IN PLACE, or null when none reads the table. */
  itemType: KnownItemType | null;
}

/**
 * THE ONE resolution of a server `record_table` stamp. `null` means no
 * registered entity claims that table — the only case a reader renders nothing.
 */
export function recordTableTarget(recordTable: unknown): RecordTableTarget | null {
  if (typeof recordTable !== "string") return null;
  const key = recordTable.trim().toLowerCase();
  if (!key.includes(".")) return null;
  const itemType = RECORD_TABLE_TO_ITEM_TYPE.get(key) ?? null;
  const tokens = TOKENS_BY_RECORD_TABLE.get(key) ?? [];
  if (itemType) {
    const config = REGISTRY[itemType];
    const declared = config.entityToken ?? itemType;
    // The item type's own token wins when the table backs several (aliases).
    return { token: tokens.includes(declared) ? declared : (tokens[0] ?? declared), itemType };
  }
  if (tokens.length === 0) return null;
  const token = tokens.find((candidate) => ITEM_TYPE_BY_ENTITY_TOKEN.has(candidate)) ?? tokens[0];
  return { token, itemType: ITEM_TYPE_BY_ENTITY_TOKEN.get(token) ?? null };
}

export function itemTypeForRecordTable(
  recordTable: unknown,
): KnownItemType | null {
  if (typeof recordTable !== "string") return null;
  const key = recordTable.trim().toLowerCase();
  if (!key.includes(".")) return null;
  return RECORD_TABLE_TO_ITEM_TYPE.get(key) ?? null;
}

export function getItemConfig(type: ItemType | null | undefined): {
  config: ItemTypeConfig;
  recognized: boolean;
} {
  if (typeof type === "string" && type in REGISTRY) {
    return { config: REGISTRY[type as KnownItemType], recognized: true };
  }
  return {
    config: {
      ...FALLBACK_CONFIG,
      label: titleCase(type) ?? "Item",
    },
    recognized: false,
  };
}

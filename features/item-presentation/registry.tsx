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
  Table2,
  ListChecks,
  BookOpen,
  FileText,
  MessageSquare,
  Mail,
  Sparkles,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EnrichedItem, ItemType, KnownItemType } from "./types";

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
   * How this item opens in a window panel. The renderer maps this discriminant
   * to the matching overlay opener hook. Omit when no panel exists yet — the
   * card stays informative and the action button is hidden.
   */
  open?: ItemOpenKind;
  /**
   * Where the generic `ItemDetailWindow` reads the full record from. Types
   * without a bespoke window use this to open a clean, formatted detail view
   * (every scalar column rendered). Omit for types with a bespoke window
   * (agent/note/file/picklist) or no single canonical table (session/message)
   * — the detail window still opens, just seed-only.
   */
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
  | { kind: "message" }
  | { kind: "email" };

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
    enrich: (s, id) =>
      fetchRow(
        s,
        "agx_agent",
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
    detailSource: { table: "aga_apps", titleField: "name" },
    enrich: (s, id) =>
      fetchRow(s, "aga_apps", id, "name, description", (r) => ({
        name: clip(r.name, 80),
        about: clip(r.description),
      })),
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
    enrich: (s, id) =>
      fetchRow(s, "notes", id, "label, content, folder_name", (r) => ({
        name: clip(r.label, 80),
        about: clip(r.content),
        details: [
          r.folder_name
            ? { label: "Folder", value: String(r.folder_name) }
            : null,
        ].filter(Boolean) as EnrichedItem["details"],
      })),
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
    detailSource: { table: "tasks", schemaName: "workspace", titleField: "title" },
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
    detailSource: { table: "projects", schemaName: "workspace", titleField: "name" },
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
    detailSource: { table: "ctx_scope_types", titleField: "label_singular" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "ctx_scope_types",
        id,
        "label_singular, label_plural, description",
        (r) => ({
          name: clip(r.label_singular, 80) ?? clip(r.label_plural, 80),
          about: clip(r.description),
        }),
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
    detailSource: { table: "ctx_scopes", titleField: "name" },
    enrich: (s, id) =>
      fetchRow(s, "ctx_scopes", id, "name, description", (r) => ({
        name: clip(r.name, 80),
        about: clip(r.description),
      })),
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
    detailSource: { table: "ctx_context_items", titleField: "display_name" },
    enrich: (s, id) =>
      fetchRow(
        s,
        "ctx_context_items",
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
    // No single canonical "session" table (war-room / studio / window / quiz
    // all qualify) — opens seed-only until one is chosen. See KNOWN_DEFECTS D8.
    open: { kind: "session" },
  },
  table: {
    type: "table",
    label: "Table",
    icon: Table2,
    accent: {
      text: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-500/10",
      ring: "ring-cyan-500/20",
    },
    open: { kind: "table" },
    detailSource: { table: "udt_datasets", titleField: "table_name" },
    enrich: (s, id) =>
      fetchRow(s, "udt_datasets", id, "table_name, description", (r) => ({
        name: clip(r.table_name, 80),
        about: clip(r.description),
      })),
  },
  picklist: {
    type: "picklist",
    label: "Picklist",
    icon: ListChecks,
    accent: {
      text: "text-lime-600 dark:text-lime-400",
      bg: "bg-lime-500/10",
      ring: "ring-lime-500/20",
    },
    open: { kind: "picklist" },
    enrich: (s, id) =>
      fetchRow(s, "udt_picklists", id, "list_name, description", (r) => ({
        name: clip(r.list_name, 80),
        about: clip(r.description),
      })),
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
    detailSource: { table: "udt_workbooks", titleField: "workbook_name" },
    enrich: (s, id) =>
      fetchRow(s, "udt_workbooks", id, "workbook_name, description", (r) => ({
        name: clip(r.workbook_name, 80),
        about: clip(r.description),
      })),
  },
  document: {
    type: "document",
    label: "Document",
    icon: FileText,
    accent: {
      text: "text-stone-600 dark:text-stone-300",
      bg: "bg-stone-500/10",
      ring: "ring-stone-500/20",
    },
    open: { kind: "document" },
    detailSource: { table: "udt_documents", titleField: "document_name" },
    enrich: (s, id) =>
      fetchRow(s, "udt_documents", id, "document_name, description", (r) => ({
        name: clip(r.document_name, 80),
        about: clip(r.description),
      })),
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
    // Multiple message tables exist (cx_message, messages, dm_messages, …) —
    // opens seed-only until a canonical one is chosen. See KNOWN_DEFECTS D8.
    open: { kind: "message" },
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
    detailSource: { table: "emails", titleField: "subject" },
    enrich: (s, id) =>
      fetchRow(s, "emails", id, "subject, sender, recipient", (r) => ({
        name: clip(r.subject, 80),
        about: r.sender ? `From ${String(r.sender)}` : undefined,
        details: [
          r.recipient ? { label: "To", value: String(r.recipient) } : null,
        ].filter(Boolean) as EnrichedItem["details"],
      })),
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
          ? { label: "Size", value: formatBytes(r.size_bytes) }
          : null,
      ].filter(Boolean) as EnrichedItem["details"],
    }),
    "files",
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The neutral fallback for an unrecognized / missing type. Never null. */
export const FALLBACK_CONFIG: ItemTypeConfig = {
  type: "file" /* placeholder; not used for routing */,
  label: "Item",
  icon: Sparkles,
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

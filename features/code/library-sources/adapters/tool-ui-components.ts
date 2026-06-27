"use client";

import { Wrench } from "lucide-react";
import { extensionForLanguage } from "@/features/code-files/actions/languageOptions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LibrarySourceAdapter,
  LoadedSourceEntry,
  RenameSourceArgs,
  RenameSourceResult,
  SaveSourceArgs,
  SaveSourceResult,
  SourceEntry,
  SourceEntryField,
} from "../types";
import { RemoteConflictError } from "../types";

const PREFIX = "tool-ui:";

// ---------------------------------------------------------------------------
// Field map — the five editable code columns on `tool_ui_components`.
// `fieldId` is stable and appears in tab ids; `column` is the DB column.
// `required=true` means the column cannot be null (inline_code).
// ---------------------------------------------------------------------------

interface ToolUiField {
  fieldId: string;
  label: string;
  column:
    | "inline_code"
    | "overlay_code"
    | "header_extras_code"
    | "header_subtitle_code"
    | "utility_code";
  required: boolean;
}

const FIELDS: readonly ToolUiField[] = [
  { fieldId: "inline", label: "Inline", column: "inline_code", required: true },
  {
    fieldId: "overlay",
    label: "Overlay",
    column: "overlay_code",
    required: false,
  },
  {
    fieldId: "header_extras",
    label: "Header Extras",
    column: "header_extras_code",
    required: false,
  },
  {
    fieldId: "header_subtitle",
    label: "Header Subtitle",
    column: "header_subtitle_code",
    required: false,
  },
  {
    fieldId: "utility",
    label: "Utility",
    column: "utility_code",
    required: false,
  },
] as const;

const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.fieldId, f] as const));

// ---------------------------------------------------------------------------
// Tab id helpers — "tool-ui:<rowId>:<fieldId>"
// ---------------------------------------------------------------------------

function parseTabId(tabId: string): { rowId: string; fieldId: string } | null {
  if (!tabId.startsWith(PREFIX)) return null;
  const rest = tabId.slice(PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon === -1) return null;
  const rowId = rest.slice(0, colon);
  const fieldId = rest.slice(colon + 1);
  if (!rowId || !fieldId) return null;
  return { rowId, fieldId };
}

function makeTabId(rowId: string, fieldId?: string): string {
  if (!fieldId) {
    throw new Error("tool_ui_components tabs require a fieldId");
  }
  return `${PREFIX}${rowId}:${fieldId}`;
}

// ---------------------------------------------------------------------------
// Supabase shapes
// ---------------------------------------------------------------------------

interface ToolUiListRow {
  id: string;
  tool_name: string;
  display_name: string;
  language: string | null;
  updated_at: string;
  is_active: boolean;
  notes: string | null;
  inline_code: string;
  overlay_code: string | null;
  header_extras_code: string | null;
  header_subtitle_code: string | null;
  utility_code: string | null;
}

const LIST_COLUMNS =
  "id,tool_name,display_name,language,updated_at,is_active,notes," +
  "inline_code,overlay_code,header_extras_code,header_subtitle_code,utility_code";

const LOAD_COLUMNS =
  "id,tool_name,display_name,language,updated_at," +
  "inline_code,overlay_code,header_extras_code,header_subtitle_code,utility_code";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const toolUiComponentsAdapter: LibrarySourceAdapter = {
  sourceId: "tool_ui_components",
  label: "Tool UIs",
  icon: Wrench,
  tabIdPrefix: PREFIX,
  multiField: true,

  parseTabId,
  makeTabId,

  async list(supabase: SupabaseClient): Promise<SourceEntry[]> {
    // `tool_ui_components` rows aren't scoped per-user — they're admin-ish
    // assets shared across the app. List every active row so editors with
    // table-level privileges can open any of them.
    const { data, error } = await supabase
      .schema("tool").from("ui")
      .select(LIST_COLUMNS)
      .eq("is_active", true)
      .order("display_name", { ascending: true })
      .limit(300);

    if (error) throw error;
    const rows = (data ?? []) as unknown as ToolUiListRow[];

    return rows.map((row) => {
      const language = mapLanguage(row.language);
      const ext = extensionForLanguage(language);

      const fields: SourceEntryField[] = FIELDS.map((f) => {
        const raw = row[f.column as keyof ToolUiListRow] as string | null;
        return {
          fieldId: f.fieldId,
          label: f.label,
          extension: ext,
          language,
          hasContent: Boolean(raw && raw.length > 0),
        };
      });

      return {
        rowId: row.id,
        name: row.display_name || row.tool_name,
        description: row.notes ?? row.tool_name,
        updatedAt: row.updated_at,
        fields,
      };
    });
  },

  async load(
    supabase: SupabaseClient,
    rowId: string,
    fieldId?: string,
  ): Promise<LoadedSourceEntry> {
    if (!fieldId) {
      throw new Error("tool_ui_components.load() requires a fieldId");
    }
    const field = FIELD_BY_ID.get(fieldId);
    if (!field) {
      throw new Error(`Unknown tool_ui_components field "${fieldId}"`);
    }

    const { data, error } = await supabase
      .schema("tool").from("ui")
      .select(LOAD_COLUMNS)
      .eq("id", rowId)
      .single();
    if (error) throw error;

    const row = data as unknown as ToolUiListRow;
    const language = mapLanguage(row.language);
    const ext = extensionForLanguage(language);
    const content =
      (row[field.column as keyof ToolUiListRow] as string | null) ?? "";

    return {
      rowId: row.id,
      fieldId,
      name: `${field.fieldId}.${ext}`,
      path: `tool-ui:/${safeSlug(row.tool_name)}/${field.fieldId}.${ext}`,
      language,
      content,
      updatedAt: row.updated_at,
    };
  },

  async save(
    supabase: SupabaseClient,
    args: SaveSourceArgs,
  ): Promise<SaveSourceResult> {
    if (!args.fieldId) {
      throw new Error("tool_ui_components.save() requires a fieldId");
    }
    const field = FIELD_BY_ID.get(args.fieldId);
    if (!field) {
      throw new Error(`Unknown tool_ui_components field "${args.fieldId}"`);
    }

    // Only the targeted column is written — everything else on the row
    // is preserved untouched. This keeps edits surgical and avoids
    // clobbering columns another user might be editing at the same time.
    const patch: Record<string, string> = { [field.column]: args.content };

    let query = supabase
      .schema("tool").from("ui")
      .update(patch)
      .eq("id", args.rowId);

    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }

    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new RemoteConflictError(
        "tool_ui_components",
        args.rowId,
        args.fieldId,
      );
    }
    return { updatedAt: (data as { updated_at: string }).updated_at };
  },

  /**
   * Rename a tool-ui component row. Updates `display_name` only — the
   * per-field extensions are fixed by the adapter's FIELDS map (since
   * each leaf maps to a specific column, not a generic file), so there
   * is no extension to derive from the typed name.
   *
   * Any extension the user types (e.g. `.tsx`) is stripped from the
   * persisted display name so the tree shows the human-readable form.
   */
  async rename(
    supabase: SupabaseClient,
    args: RenameSourceArgs,
  ): Promise<RenameSourceResult> {
    const trimmed = args.newName.trim();
    if (!trimmed) throw new Error("Name cannot be empty.");

    // Strip a trailing extension if present — display names for tool-ui
    // rows are folder labels, not filenames.
    const dot = trimmed.lastIndexOf(".");
    const baseName =
      dot > 0 && dot < trimmed.length - 1 ? trimmed.slice(0, dot) : trimmed;

    let query = supabase
      .schema("tool").from("ui")
      .update({ display_name: baseName })
      .eq("id", args.rowId);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }

    const { data, error } = await query
      .select("updated_at,display_name,tool_name")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new RemoteConflictError("tool_ui_components", args.rowId);
    const row = data as {
      updated_at: string;
      display_name: string | null;
      tool_name: string;
    };
    return {
      updatedAt: row.updated_at,
      appliedName: row.display_name || row.tool_name,
    };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapLanguage(raw: string | null | undefined): string {
  const v = (raw ?? "tsx").toLowerCase();
  if (v === "react") return "typescript";
  if (v === "tsx" || v === "jsx") return "typescript";
  return v;
}

function safeSlug(input: string): string {
  return input.replace(/[^\w\-.]/g, "_").slice(0, 80) || "tool";
}

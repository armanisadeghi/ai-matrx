/**
 * features/files/virtual-sources/adapters/tool-ui-components.ts
 *
 * Tool UIs virtual source. `tool_ui_components` rows have five editable code
 * columns (`inline_code` / `overlay_code` / `header_extras_code` /
 * `header_subtitle_code` / `utility_code`). Each row materializes as a
 * folder; each non-null column appears as a file leaf inside it.
 *
 * Admin asset — no per-user scoping. capabilities = list/read/write only;
 * rename / delete are intentionally absent.
 */

"use client";

import { Wrench } from "lucide-react";
import { registerVirtualSource } from "@/features/files/virtual-sources/registry";
import { makeCodeInlinePreview } from "./CodeInlinePreview";
import type {
  ListArgs,
  WriteArgs,
  VirtualContent,
  VirtualNode,
  VirtualSourceAdapter,
} from "@/features/files/virtual-sources/types";
import { VirtualSourceError } from "@/features/files/virtual-sources/errors";
import type { Database } from "@/types/database.types";

const TAB_ID_PREFIX = "tool-ui:";

interface ToolUiField {
  fieldId: string;
  label: string;
  column:
    | "inline_code"
    | "overlay_code"
    | "header_extras_code"
    | "header_subtitle_code"
    | "utility_code";
}

const FIELDS: readonly ToolUiField[] = [
  { fieldId: "inline", label: "Inline", column: "inline_code" },
  { fieldId: "overlay", label: "Overlay", column: "overlay_code" },
  { fieldId: "header_extras", label: "Header Extras", column: "header_extras_code" },
  { fieldId: "header_subtitle", label: "Header Subtitle", column: "header_subtitle_code" },
  { fieldId: "utility", label: "Utility", column: "utility_code" },
] as const;

const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.fieldId, f] as const));

type ToolUiRow = Pick<
  Database["tool"]["Tables"]["ui"]["Row"],
  | "id"
  | "tool_name"
  | "display_name"
  | "language"
  | "updated_at"
  | "is_active"
  | "notes"
  | "inline_code"
  | "overlay_code"
  | "header_extras_code"
  | "header_subtitle_code"
  | "utility_code"
>;

// One literal (no concatenation) so TS keeps the literal type and supabase-js
// can parse the column list — this is what types the query result as ToolUiRow.
const LIST_COLUMNS =
  "id,tool_name,display_name,language,updated_at,is_active,notes,inline_code,overlay_code,header_extras_code,header_subtitle_code,utility_code";

function mapLanguage(raw: string | null | undefined): string {
  const v = (raw ?? "tsx").toLowerCase();
  if (v === "react" || v === "tsx" || v === "jsx") return "typescript";
  return v;
}

const toolUiAdapter: VirtualSourceAdapter = {
  sourceId: "tool_ui_components",
  label: "Tool UIs",
  icon: Wrench,
  capabilities: {
    list: true,
    read: true,
    write: true,
    rename: false,
    delete: false,
    move: false,
    folders: true, // each row is a folder of fields
    binary: false,
    versions: false,
    multiField: true,
  },
  dnd: { acceptsOwn: false },
  pathPrefix: "/Tool UIs",

  makeTabId(id, fieldId) {
    if (!fieldId) {
      throw new Error("tool_ui_components tabs require a fieldId");
    }
    return `${TAB_ID_PREFIX}${id}:${fieldId}`;
  },
  parseTabId(tabId) {
    if (!tabId.startsWith(TAB_ID_PREFIX)) return null;
    const rest = tabId.slice(TAB_ID_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon < 0) return null;
    const id = rest.slice(0, colon);
    const fieldId = rest.slice(colon + 1);
    return id && fieldId ? { id, fieldId } : null;
  },

  async list(supabase, _userId, args: ListArgs): Promise<VirtualNode[]> {
    if (args.parentId === null) {
      // Root — list every active row as a folder.
      const { data, error } = await supabase
        .schema("tool").from("ui")
        .select(LIST_COLUMNS)
        .eq("is_active", true)
        .order("display_name", { ascending: true })
        .limit(args.limit ?? 300);
      if (error) return [];
      const rows: ToolUiRow[] = data ?? [];
      return rows.map(
        (row): VirtualNode => ({
          id: row.id,
          kind: "folder" as const,
          name: row.display_name || row.tool_name,
          parentId: null,
          updatedAt: row.updated_at,
          fields: FIELDS.map((f) => {
            const raw = row[f.column] as string | null;
            return {
              fieldId: f.fieldId,
              label: f.label,
              extension: "tsx",
              language: mapLanguage(row.language),
              hasContent: Boolean(raw && raw.length > 0),
            };
          }),
        }),
      );
    }
    // Listing inside a row — emit one leaf per field.
    const { data, error } = await supabase
      .schema("tool").from("ui")
      .select(LIST_COLUMNS)
      .eq("id", args.parentId)
      .maybeSingle();
    if (error || !data) return [];
    const row: ToolUiRow = data;
    return FIELDS.map((f): VirtualNode => {
      const raw = row[f.column] as string | null;
      return {
        id: `${row.id}:${f.fieldId}`,
        kind: "file" as const,
        name: `${f.fieldId}.tsx`,
        parentId: row.id,
        updatedAt: row.updated_at,
        extension: "tsx",
        language: mapLanguage(row.language),
        mimeType: "text/typescript",
        hasContent: Boolean(raw && raw.length > 0),
      };
    });
  },

  async read(supabase, _userId, id, fieldId): Promise<VirtualContent> {
    if (!fieldId) {
      throw new VirtualSourceError(
        "validation",
        "read",
        "tool_ui_components requires fieldId",
      );
    }
    const field = FIELD_BY_ID.get(fieldId);
    if (!field) {
      throw new VirtualSourceError("validation", "read", `Unknown field ${fieldId}`);
    }
    const { data, error } = await supabase
      .schema("tool").from("ui")
      .select(LIST_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      throw new VirtualSourceError("not_found", "read", `Tool UI not found: ${id}`);
    }
    const row: ToolUiRow = data;
    const language = mapLanguage(row.language);
    return {
      id: row.id,
      fieldId,
      name: `${field.fieldId}.tsx`,
      path: `tool-ui:/${row.tool_name}/${field.fieldId}.tsx`,
      language,
      mimeType: "text/typescript",
      content: (row[field.column] as string | null) ?? "",
      updatedAt: row.updated_at,
    };
  },

  async write(supabase, _userId, args: WriteArgs) {
    if (!args.fieldId) {
      throw new VirtualSourceError("validation", "write", "fieldId required");
    }
    const field = FIELD_BY_ID.get(args.fieldId);
    if (!field) {
      throw new VirtualSourceError(
        "validation",
        "write",
        `Unknown field ${args.fieldId}`,
      );
    }
    let query = supabase
      .schema("tool").from("ui")
      .update({ [field.column]: args.content, updated_at: new Date().toISOString() })
      .eq("id", args.id);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Tool UI save failed (conflict?)");
    }
    return { updatedAt: (data as { updated_at: string }).updated_at };
  },

  async rename() {
    throw new VirtualSourceError("not_supported", "rename");
  },

  async delete() {
    throw new VirtualSourceError("not_supported", "delete");
  },

  inlinePreview: makeCodeInlinePreview("tool_ui_components"),

  openInRoute(node) {
    // Folder rows have no dedicated route; field leaves open the /code tab.
    if (node.kind === "folder") return null;
    return `/code?tab=${encodeURIComponent(`${TAB_ID_PREFIX}${node.id}`)}`;
  },
};

registerVirtualSource(toolUiAdapter);

"use client";

import { Lightbulb } from "lucide-react";
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
} from "../types";
import { RemoteConflictError } from "../types";

// ---------------------------------------------------------------------------
// Tab id helpers — "prompt-app:<rowId>"
// ---------------------------------------------------------------------------

const PREFIX = "prompt-app:";

function parseTabId(tabId: string): { rowId: string } | null {
  if (!tabId.startsWith(PREFIX)) return null;
  const rowId = tabId.slice(PREFIX.length);
  return rowId ? { rowId } : null;
}

function makeTabId(rowId: string): string {
  return `${PREFIX}${rowId}`;
}

// ---------------------------------------------------------------------------
// Supabase shape — pull only the columns we actually need
// ---------------------------------------------------------------------------

interface PromptAppRow {
  id: string;
  name: string;
  slug: string;
  component_code: string;
  component_language: string | null;
  updated_at: string;
  status: string | null;
  description: string | null;
}

const COLUMNS =
  "id,name,slug,component_code,component_language,updated_at,status,description";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const promptAppsAdapter: LibrarySourceAdapter = {
  sourceId: "prompt_apps",
  label: "Prompt Apps",
  icon: Lightbulb,
  tabIdPrefix: PREFIX,
  multiField: false,

  parseTabId,
  makeTabId,

  async list(
    supabase: SupabaseClient,
    userId: string | null,
  ): Promise<SourceEntry[]> {
    if (!userId) return [];
    const { data, error } = await supabase
      .from("prompt_apps")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    const rows = (data ?? []) as unknown as PromptAppRow[];
    return rows.map((row) => ({
      rowId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      updatedAt: row.updated_at,
      badge: row.status && row.status !== "published" ? row.status : undefined,
    }));
  },

  async load(
    supabase: SupabaseClient,
    rowId: string,
  ): Promise<LoadedSourceEntry> {
    const { data, error } = await supabase
      .from("prompt_apps")
      .select(COLUMNS)
      .eq("id", rowId)
      .single();

    if (error) throw error;
    const row = data as unknown as PromptAppRow;
    // See aga-apps adapter for the rationale: derive the file extension
    // from the RAW component_language so JSX/TSX flavor survives. Without
    // this, every JSX-flavored prompt app loads as `.ts` and Monaco's TS
    // worker refuses to parse JSX, polluting the editor with type errors.
    const language = mapLanguage(row.component_language);
    const ext = extensionForComponentLanguage(row.component_language);
    return {
      rowId: row.id,
      name: `${safeFilename(row.slug || row.name)}.${ext}`,
      path: `prompt-app:/${row.slug || row.id}.${ext}`,
      language,
      content: row.component_code ?? "",
      updatedAt: row.updated_at,
    };
  },

  async save(
    supabase: SupabaseClient,
    args: SaveSourceArgs,
  ): Promise<SaveSourceResult> {
    let query = supabase
      .from("prompt_apps")
      .update({ component_code: args.content })
      .eq("id", args.rowId);

    if (args.expectedUpdatedAt) {
      // Optimistic guard — the UPDATE only applies if the row hasn't
      // been touched elsewhere since we loaded it.
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }

    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error) throw error;
    if (!data) {
      // No row matched the combined id + updated_at predicate.
      throw new RemoteConflictError("prompt_apps", args.rowId);
    }
    return { updatedAt: (data as { updated_at: string }).updated_at };
  },

  /**
   * Rename a prompt app — same shape as aga-apps. Updates `name` and,
   * if the user typed an extension, the `component_language` column so
   * the file's type-checker behavior re-routes through the new flavor.
   */
  async rename(
    supabase: SupabaseClient,
    args: RenameSourceArgs,
  ): Promise<RenameSourceResult> {
    const trimmed = args.newName.trim();
    if (!trimmed) throw new Error("Name cannot be empty.");

    const dot = trimmed.lastIndexOf(".");
    const hasExtension = dot > 0 && dot < trimmed.length - 1;
    const baseName = hasExtension ? trimmed.slice(0, dot) : trimmed;
    const ext = hasExtension ? trimmed.slice(dot + 1).toLowerCase() : null;

    const sanitisedName = safeFilename(baseName) || baseName;
    const update: Record<string, string> = { name: sanitisedName };
    if (ext) update.component_language = componentLanguageForExtension(ext);

    let query = supabase
      .from("prompt_apps")
      .update(update)
      .eq("id", args.rowId);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }

    const { data, error } = await query
      .select("updated_at,name")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new RemoteConflictError("prompt_apps", args.rowId);
    const row = data as { updated_at: string; name: string };
    return { updatedAt: row.updated_at, appliedName: row.name };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapLanguage(raw: string | null | undefined): string {
  // The `component_language` column accepts "tsx" | "jsx" | "typescript" |
  // "javascript" | "html" | "react". "react" is legacy and maps to tsx.
  const v = (raw ?? "tsx").toLowerCase();
  if (v === "react") return "typescript";
  if (v === "tsx" || v === "jsx") return "typescript";
  return v;
}

/**
 * Compute the file extension preserving JSX flavor. Mirrors the helper
 * in aga-apps — kept duplicated rather than shared so each adapter stays
 * self-contained per the codebase rule that adapters are pure modules.
 */
function extensionForComponentLanguage(raw: string | null | undefined): string {
  const v = (raw ?? "tsx").toLowerCase();
  if (v === "tsx" || v === "react") return "tsx";
  if (v === "jsx") return "jsx";
  if (v === "ts" || v === "typescript") return "ts";
  if (v === "js" || v === "javascript") return "js";
  return extensionForLanguage(mapLanguage(v));
}

/** Inverse — pick the canonical `component_language` for a typed extension. */
function componentLanguageForExtension(extOrName: string): string {
  const dot = extOrName.lastIndexOf(".");
  const ext = (dot >= 0 ? extOrName.slice(dot + 1) : extOrName).toLowerCase();
  if (!ext) return "tsx";
  if (ext === "tsx") return "tsx";
  if (ext === "jsx") return "jsx";
  if (ext === "ts") return "typescript";
  if (ext === "js") return "javascript";
  if (ext === "py") return "python";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "md" || ext === "mdx") return "markdown";
  return ext;
}

function safeFilename(input: string): string {
  return input.replace(/[^\w\-.]/g, "_").slice(0, 80) || "prompt-app";
}

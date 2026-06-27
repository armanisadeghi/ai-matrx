"use client";

import { SquareStack } from "lucide-react";
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

const PREFIX = "aga-app:";

function parseTabId(tabId: string): { rowId: string } | null {
  if (!tabId.startsWith(PREFIX)) return null;
  const rowId = tabId.slice(PREFIX.length);
  return rowId ? { rowId } : null;
}

function makeTabId(rowId: string): string {
  return `${PREFIX}${rowId}`;
}

interface AgaAppRow {
  id: string;
  name: string;
  slug: string;
  component_code: string;
  component_language: string | null;
  updated_at: string;
  status: string | null;
  description: string | null;
  app_kind: string | null;
  version: number | null;
}

const COLUMNS =
  "id,name,slug,component_code,component_language,updated_at,status,description,app_kind,version";

export const agaAppsAdapter: LibrarySourceAdapter = {
  sourceId: "aga_apps",
  label: "Agent Apps",
  icon: SquareStack,
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
      .schema("app").from("definition")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    const rows = (data ?? []) as unknown as AgaAppRow[];
    return rows.map((row) => ({
      rowId: row.id,
      name: row.name,
      description: row.description ?? undefined,
      updatedAt: row.updated_at,
      badge:
        row.status && row.status !== "published"
          ? row.status
          : row.version && row.version > 1
            ? `v${row.version}`
            : undefined,
    }));
  },

  async load(
    supabase: SupabaseClient,
    rowId: string,
  ): Promise<LoadedSourceEntry> {
    const { data, error } = await supabase
      .schema("app").from("definition")
      .select(COLUMNS)
      .eq("id", rowId)
      .single();

    if (error) throw error;
    const row = data as unknown as AgaAppRow;
    // Two derivations from `component_language` that must NOT collapse:
    //
    //   1. `language` is the Monaco mode id ("typescript", "javascript", …).
    //      Monaco only knows the base mode — it has no separate "tsx" mode.
    //   2. `ext` is the file extension we put on the virtual `path`. THIS is
    //      what makes Monaco's TS worker enable JSX parsing — a `.tsx` path
    //      is parsed as JSX-flavored TypeScript, a `.ts` path is not.
    //
    // The previous code did `extensionForLanguage(mapLanguage(raw))`, which
    // collapsed "tsx"/"react" → "typescript" → ".ts" and silently broke
    // type-checking for every JSX-flavored agent app. Compute the extension
    // from the RAW value so the JSX flavor survives.
    const language = mapLanguage(row.component_language);
    const ext = extensionForComponentLanguage(row.component_language);
    return {
      rowId: row.id,
      name: `${safeFilename(row.slug || row.name)}.${ext}`,
      path: `aga-app:/${row.slug || row.id}.${ext}`,
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
      .schema("app").from("definition")
      .update({ component_code: args.content })
      .eq("id", args.rowId);

    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }

    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new RemoteConflictError("aga_apps", args.rowId);
    }
    return { updatedAt: (data as { updated_at: string }).updated_at };
  },

  /**
   * Rename an agent app. The new name is parsed for an extension —
   * if present, it's mapped back to `component_language` so the file
   * type-checks correctly the next time it's loaded.
   *
   * Examples:
   *   "MyApp.tsx" → name="MyApp",     component_language="tsx"
   *   "checkout.jsx" → name="checkout", component_language="jsx"
   *   "helpers.ts"  → name="helpers",  component_language="typescript"
   *   "notes"       → name="notes",    component_language unchanged
   */
  async rename(
    supabase: SupabaseClient,
    args: RenameSourceArgs,
  ): Promise<RenameSourceResult> {
    const trimmed = args.newName.trim();
    if (!trimmed) {
      throw new Error("Name cannot be empty.");
    }

    const dot = trimmed.lastIndexOf(".");
    const hasExtension = dot > 0 && dot < trimmed.length - 1;
    const baseName = hasExtension ? trimmed.slice(0, dot) : trimmed;
    const ext = hasExtension ? trimmed.slice(dot + 1).toLowerCase() : null;

    const sanitisedName = safeFilename(baseName) || baseName;
    const update: Record<string, string> = { name: sanitisedName };
    if (ext) {
      update.component_language = componentLanguageForExtension(ext);
    }

    let query = supabase
      .schema("app").from("definition")
      .update(update)
      .eq("id", args.rowId);

    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }

    const { data, error } = await query
      .select("updated_at,name")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new RemoteConflictError("aga_apps", args.rowId);
    }
    const row = data as { updated_at: string; name: string };
    return {
      updatedAt: row.updated_at,
      appliedName: row.name,
    };
  },
};

function mapLanguage(raw: string | null | undefined): string {
  const v = (raw ?? "tsx").toLowerCase();
  if (v === "react") return "typescript";
  if (v === "tsx" || v === "jsx") return "typescript";
  return v;
}

/**
 * Compute the file extension for an `aga_apps.component_language` value.
 *
 * Distinct from `extensionForLanguage` because the latter operates on
 * Monaco mode ids (`"typescript"`) which have already lost the JSX bit.
 * Here we keep `"tsx"` as `tsx`, `"jsx"` as `jsx`, etc., so the virtual
 * path Monaco sees ends in the correct extension and JSX parsing kicks in.
 */
function extensionForComponentLanguage(raw: string | null | undefined): string {
  const v = (raw ?? "tsx").toLowerCase();
  if (v === "tsx" || v === "react") return "tsx";
  if (v === "jsx") return "jsx";
  if (v === "ts" || v === "typescript") return "ts";
  if (v === "js" || v === "javascript") return "js";
  // Fall back to the language→extension table for everything else (python,
  // json, css, …). The Monaco-mapped form gives the right answer there.
  return extensionForLanguage(mapLanguage(v));
}

/**
 * Inverse of `extensionForComponentLanguage` — the canonical
 * `component_language` value to write back to the DB when the user
 * renames a file with a new extension.
 *
 * Defaults to "tsx" so unknown extensions don't silently drop JSX support
 * for agent apps (the most common case).
 */
function componentLanguageForExtension(extOrName: string): string {
  // Accept either a raw extension ("tsx") or a full filename ("foo.tsx").
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
  // Unknown extensions: keep the value the user typed so they can write
  // anything custom. The Monaco mapping will fall back to plaintext.
  return ext;
}

function safeFilename(input: string): string {
  return input.replace(/[^\w\-.]/g, "_").slice(0, 80) || "agent-app";
}

/** Strip the trailing extension from a filename ("foo.tsx" → "foo"). */
function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

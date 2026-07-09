"use client";

import { FileCode } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
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

/**
 * Library adapter for standalone `html_pages` (HTML CMS project).
 *
 * Unlike other adapters, this does NOT query Matrx Main via the passed
 * Supabase client — `html_pages` lives in project `viyklljfdhtidwecakwx`
 * and must go through `/api/html-pages` (HTMLPageService).
 */

const PREFIX = "html-page:";

function parseTabId(tabId: string): { rowId: string } | null {
  if (!tabId.startsWith(PREFIX)) return null;
  const rowId = tabId.slice(PREFIX.length);
  return rowId ? { rowId } : null;
}

function makeTabId(rowId: string): string {
  return `${PREFIX}${rowId}`;
}

function safeFilename(input: string): string {
  return input.replace(/[^\w\-.]/g, "_").slice(0, 80) || "page";
}

interface HtmlPageListRow {
  id: string;
  meta_title: string;
  meta_description: string | null;
  is_indexable: boolean;
  updated_at?: string;
  created_at: string;
}

interface HtmlPageFullRow {
  id: string;
  meta_title: string;
  html_content: string;
  updated_at: string;
  meta_description?: string | null;
  meta_keywords?: string | null;
  og_image?: string | null;
  canonical_url?: string | null;
  is_indexable?: boolean;
}

export const htmlPagesAdapter: LibrarySourceAdapter = {
  sourceId: "html_pages",
  label: "HTML Pages",
  icon: FileCode,
  tabIdPrefix: PREFIX,
  multiField: false,
  // No Matrx Main realtime table — HTML CMS is a separate project.
  // Omit realtimeTable so useTabRealtimeWatcher skips subscription.

  parseTabId,
  makeTabId,

  async list(
    _supabase: SupabaseClient,
    userId: string | null,
  ): Promise<SourceEntry[]> {
    if (!userId) return [];
    const rows = (await HTMLPageService.getUserPages(
      userId,
    )) as HtmlPageListRow[];
    return (rows ?? []).map((row) => ({
      rowId: row.id,
      name: `${safeFilename(row.meta_title || "page")}.html`,
      description: row.meta_description ?? undefined,
      updatedAt: row.updated_at ?? row.created_at,
      badge: row.is_indexable ? "indexable" : undefined,
    }));
  },

  async load(
    _supabase: SupabaseClient,
    rowId: string,
  ): Promise<LoadedSourceEntry> {
    const row = (await HTMLPageService.getPage(rowId)) as HtmlPageFullRow;
    if (!row?.id) {
      throw new Error(`HTML page not found: ${rowId}`);
    }
    const base = safeFilename(row.meta_title || "page");
    return {
      rowId: row.id,
      name: `${base}.html`,
      path: `html-page:/${row.id}.html`,
      language: "html",
      content: row.html_content ?? "",
      updatedAt: row.updated_at,
    };
  },

  async save(
    _supabase: SupabaseClient,
    args: SaveSourceArgs,
  ): Promise<SaveSourceResult> {
    // Preserve existing metadata; only overwrite html_content.
    const existing = (await HTMLPageService.getPage(
      args.rowId,
    )) as HtmlPageFullRow | null;
    if (!existing?.id) {
      throw new RemoteConflictError("html_pages", args.rowId);
    }
    if (
      args.expectedUpdatedAt &&
      existing.updated_at &&
      args.expectedUpdatedAt !== existing.updated_at
    ) {
      throw new RemoteConflictError("html_pages", args.rowId);
    }

    const result = (await HTMLPageService.updatePage(
      args.rowId,
      args.content,
      existing.meta_title,
      existing.meta_description ?? "",
      undefined,
      {
        metaKeywords: existing.meta_keywords ?? undefined,
        ogImage: existing.og_image ?? undefined,
        canonicalUrl: existing.canonical_url ?? undefined,
        isIndexable: existing.is_indexable,
      },
    )) as { updatedAt?: string };

    return {
      updatedAt: result.updatedAt ?? new Date().toISOString(),
    };
  },

  async rename(
    _supabase: SupabaseClient,
    args: RenameSourceArgs,
  ): Promise<RenameSourceResult> {
    const trimmed = args.newName.trim();
    if (!trimmed) {
      throw new Error("Name cannot be empty.");
    }

    const dot = trimmed.lastIndexOf(".");
    const hasExtension = dot > 0 && dot < trimmed.length - 1;
    const baseName = hasExtension ? trimmed.slice(0, dot) : trimmed;
    const title = baseName.trim() || "Untitled";

    const existing = (await HTMLPageService.getPage(
      args.rowId,
    )) as HtmlPageFullRow | null;
    if (!existing?.id) {
      throw new RemoteConflictError("html_pages", args.rowId);
    }
    if (
      args.expectedUpdatedAt &&
      existing.updated_at &&
      args.expectedUpdatedAt !== existing.updated_at
    ) {
      throw new RemoteConflictError("html_pages", args.rowId);
    }

    const result = (await HTMLPageService.updatePage(
      args.rowId,
      undefined,
      title,
      undefined,
      undefined,
      {},
    )) as { updatedAt?: string };

    return {
      updatedAt: result.updatedAt ?? new Date().toISOString(),
      appliedName: `${safeFilename(title)}.html`,
    };
  },
};

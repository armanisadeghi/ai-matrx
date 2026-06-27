"use client";

// NOTE: The `prompt_apps` table has been moved to the graveyard schema.
// All Supabase calls in this adapter are stubbed. The adapter shell is kept so
// the registry import doesn't break; it simply surfaces no items.

import { Lightbulb } from "lucide-react";
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

  // NOTE: The `prompt_apps` table has been moved to the graveyard schema and is no longer
  // reachable via PostgREST. All operations fail-soft with an empty result or a clear error
  // so the code editor doesn't crash — the Prompt Apps source simply shows nothing.

  async list(): Promise<SourceEntry[]> {
    console.warn("[code/library-sources/adapters/prompt-apps] list: prompt_apps table is in graveyard schema — returning empty");
    return [];
  },

  async load(_supabase: SupabaseClient, rowId: string): Promise<LoadedSourceEntry> {
    console.warn("[code/library-sources/adapters/prompt-apps] load: prompt_apps table is in graveyard schema");
    throw new Error(`Prompt App ${rowId} is not available — prompt_apps has been decommissioned`);
  },

  async save(_supabase: SupabaseClient, args: SaveSourceArgs): Promise<SaveSourceResult> {
    console.warn("[code/library-sources/adapters/prompt-apps] save: prompt_apps table is in graveyard schema");
    throw new Error(`Cannot save Prompt App ${args.rowId} — prompt_apps has been decommissioned`);
  },

  async rename(_supabase: SupabaseClient, args: RenameSourceArgs): Promise<RenameSourceResult> {
    console.warn("[code/library-sources/adapters/prompt-apps] rename: prompt_apps table is in graveyard schema");
    throw new Error(`Cannot rename Prompt App ${args.rowId} — prompt_apps has been decommissioned`);
  },
};


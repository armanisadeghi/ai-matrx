// features/dictionary/service/dictionaryService.ts
//
// THE SOLE CHOKEPOINT for all dict_* Supabase access from frontend code.
// Every read/write of dict_entries / dict_settings + the dict_* RPCs goes
// through here. Thin wrappers over the SECURITY DEFINER RPCs defined in
// migrations/dict_dictionary_system.sql — no direct table queries (writes are
// RPC-only by design; reads go through the same RPCs so authorization lives in
// one place, the database).

"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  DictEntry,
  DictEntryDraft,
  DictLevel,
  DictOwnerCatalogue,
  DictSelection,
  ResolvedDictionary,
} from "@/features/dictionary/types";

function rpcError(context: string, error: { message: string } | null): never {
  throw new Error(`dictionary.${context}: ${error?.message ?? "unknown error"}`);
}

/** Map a raw dict_entries row (snake_case, nullable arrays) to DictEntry. */
function toEntry(row: {
  id: string;
  term: string;
  sounds_like: string[] | null;
  pronunciation: string | null;
  ipa: string | null;
  definition: string | null;
  category: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}): DictEntry {
  return {
    id: row.id,
    term: row.term,
    sounds_like: row.sounds_like ?? [],
    pronunciation: row.pronunciation,
    ipa: row.ipa,
    definition: row.definition,
    category: row.category,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const dictionaryService = {
  /** Every dictionary-bearing owner visible to the current user. */
  async listOwners(): Promise<DictOwnerCatalogue> {
    const { data, error } = await supabase.rpc("dict_list_owners");
    if (error) rpcError("listOwners", error);
    return data as unknown as DictOwnerCatalogue;
  },

  /** All entries for one owner, alphabetised. */
  async listEntries(level: DictLevel, ownerId: string): Promise<DictEntry[]> {
    const { data, error } = await supabase.rpc("dict_list_entries", {
      p_level: level,
      p_owner_id: ownerId,
    });
    if (error) rpcError("listEntries", error);
    return ((data as unknown as Parameters<typeof toEntry>[0][]) ?? []).map(toEntry);
  },

  /** Upsert a batch (id present = update, absent = insert/merge-by-term). */
  async upsertEntries(
    level: DictLevel,
    ownerId: string,
    entries: DictEntryDraft[],
  ): Promise<DictEntry[]> {
    const { data, error } = await supabase.rpc("dict_upsert_entries", {
      p_level: level,
      p_owner_id: ownerId,
      p_entries: entries as unknown as never,
    });
    if (error) rpcError("upsertEntries", error);
    return ((data as unknown as Parameters<typeof toEntry>[0][]) ?? []).map(toEntry);
  },

  /** Delete entries by id; returns the number removed. */
  async deleteEntries(level: DictLevel, ownerId: string, ids: string[]): Promise<number> {
    const { data, error } = await supabase.rpc("dict_delete_entries", {
      p_level: level,
      p_owner_id: ownerId,
      p_ids: ids,
    });
    if (error) rpcError("deleteEntries", error);
    return (data as unknown as number) ?? 0;
  },

  /** Read the inline-policy setting for one owner. */
  async getSettings(
    level: DictLevel,
    ownerId: string,
  ): Promise<{ max_inline_chars: number | null; has_row: boolean }> {
    const { data, error } = await supabase.rpc("dict_get_settings", {
      p_level: level,
      p_owner_id: ownerId,
    });
    if (error) rpcError("getSettings", error);
    return data as unknown as { max_inline_chars: number | null; has_row: boolean };
  },

  /** Set (or clear, with null) the inline-policy ceiling for one owner. */
  async setSettings(
    level: DictLevel,
    ownerId: string,
    maxInlineChars: number | null,
  ): Promise<{ max_inline_chars: number | null; has_row: boolean }> {
    const { data, error } = await supabase.rpc("dict_set_settings", {
      p_level: level,
      p_owner_id: ownerId,
      p_max_inline_chars: maxInlineChars,
    });
    if (error) rpcError("setSettings", error);
    return data as unknown as { max_inline_chars: number | null; has_row: boolean };
  },

  /** Merge + de-dupe the selected dictionaries into one active set. */
  async resolve(selection: DictSelection): Promise<ResolvedDictionary> {
    const { data, error } = await supabase.rpc("dict_resolve", {
      p_include_user: selection.includePersonal,
      p_all: selection.all,
      p_organization_ids: selection.organizationIds,
      p_scope_type_ids: selection.scopeTypeIds,
      p_scope_ids: selection.scopeIds,
    });
    if (error) rpcError("resolve", error);
    return data as unknown as ResolvedDictionary;
  },
};

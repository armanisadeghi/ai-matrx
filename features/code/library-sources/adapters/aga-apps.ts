"use client";

// features/code/library-sources/adapters/aga-apps.ts — APPLET SOURCE IN THE CODE WORKSPACE.
//
// An Applet record (`app.definition`, CONTRACTS §8) holds its code as `files` (name → source) with one
// `entry`. Each Applet is a folder in the Library; each file is a leaf. Save merges ONE file into `files`
// through the platform's jsonb-merge primitive (CAS on `version`, re-merge on a concurrent write), so two
// people editing different files of one Applet never lose each other's work; the record's version trigger
// snapshots every save into `app.definition_version`.

import { SquareStack } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeJsonColumn } from "@ai-matrx/data/db";
import type { Database } from "@/types/database.types";
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
import { appletState, appletVersionLabel } from "@/features/applets/lib/applet-state";

const PREFIX = "aga-app:";
const SOURCE_ID = "aga_apps";

/** "aga-app:<rowId>:<file name>" — a row id is a uuid, so the first colon after the prefix splits. */
function parseTabId(tabId: string): { rowId: string; fieldId?: string } | null {
  if (!tabId.startsWith(PREFIX)) return null;
  const rest = tabId.slice(PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon < 0) return rest ? { rowId: rest } : null;
  const rowId = rest.slice(0, colon);
  const fieldId = rest.slice(colon + 1);
  return rowId ? { rowId, ...(fieldId ? { fieldId } : {}) } : null;
}

function makeTabId(rowId: string, fieldId?: string): string {
  return fieldId ? `${PREFIX}${rowId}:${fieldId}` : `${PREFIX}${rowId}`;
}

export const AGA_APP_OWNER_COLUMN =
  "created_by" satisfies keyof Database["app"]["Tables"]["definition"]["Row"];

type FilesMap = Record<string, string>;

function filesOf(value: unknown): FilesMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: FilesMap = {};
  for (const [name, source] of Object.entries(value as Record<string, unknown>)) {
    if (typeof source === "string") out[name] = source;
  }
  return out;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "tsx";
}

function languageOf(name: string): string {
  const ext = extensionOf(name);
  if (ext === "css") return "css";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  return ext === "js" || ext === "jsx" ? "javascript" : "typescript";
}

/** Entry first, then alphabetical — the order the Library shows. */
function orderedFileNames(files: FilesMap, entry: string | null): string[] {
  return Object.keys(files).sort((a, b) => (a === entry ? -1 : b === entry ? 1 : a.localeCompare(b)));
}

interface FilesRow {
  id: string;
  version: number;
  files: unknown;
  entry: string | null;
  updated_at: string;
}

const FILES_COLUMNS = "id, version, files, entry, updated_at";

/** The one read of the columns this adapter writes (`version` is the CAS token). */
function queryFilesRow(supabase: SupabaseClient, rowId: string) {
  return supabase
    .schema("app")
    .from("definition")
    .select(FILES_COLUMNS)
    .eq("id", rowId)
    .is("deleted_at", null)
    .maybeSingle();
}

/** Merge one change into `files`; the version trigger snapshots the save. */
async function writeFiles(
  supabase: SupabaseClient,
  rowId: string,
  merge: (current: FilesMap) => FilesMap,
  fieldId?: string,
): Promise<string> {
  const result = await mergeJsonColumn<FilesRow>({
    fetchCurrent: () => queryFilesRow(supabase, rowId),
    readColumn: (row) => row.files,
    merge: (current) => merge(filesOf(current)),
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      supabase
        .schema("app")
        .from("definition")
        .update({ files: value as Database["app"]["Tables"]["definition"]["Update"]["files"], version: nextVersion })
        .eq("id", rowId)
        .eq("version", expectedVersion)
        .select(FILES_COLUMNS)
        .maybeSingle(),
  });
  if (result.status === "saved") return result.row.updated_at;
  if (result.status === "not_found") throw new Error("This app no longer exists.");
  if (result.status === "conflict") throw new RemoteConflictError(SOURCE_ID, rowId, fieldId);
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

export const agaAppsAdapter: LibrarySourceAdapter = {
  sourceId: SOURCE_ID,
  label: "Applets",
  description: "Your Applets' files. Save writes that file and keeps a version.",
  icon: SquareStack,
  tabIdPrefix: PREFIX,
  multiField: true,
  realtimeTable: { schema: "app", table: "definition" },

  parseTabId,
  makeTabId,

  async list(supabase: SupabaseClient<Database>, userId: string | null): Promise<SourceEntry[]> {
    if (!userId) return [];
    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .select("id, name, slug, description, updated_at, status, published_to_web, content_version, files, entry")
      .is("deleted_at", null)
      .eq(AGA_APP_OWNER_COLUMN, userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((row) => {
      const files = filesOf(row.files);
      const fields: SourceEntryField[] = orderedFileNames(files, row.entry).map((name) => ({
        fieldId: name,
        label: name,
        extension: extensionOf(name),
        language: languageOf(name),
        hasContent: files[name] !== "",
      }));
      return {
        rowId: row.id,
        name: row.name,
        description: row.description ?? undefined,
        updatedAt: row.updated_at,
        fields,
        // THE state's word while not published, else the saved content version (never the row's write counter).
        badge: appletState(row).kind !== "published" ? appletState(row).label : (appletVersionLabel(row.content_version) ?? undefined),
      };
    });
  },

  async load(supabase: SupabaseClient, rowId: string, fieldId?: string): Promise<LoadedSourceEntry> {
    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .select("id, slug, files, entry, updated_at")
      .eq("id", rowId)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    const files = filesOf(data.files);
    const name = fieldId ?? data.entry ?? orderedFileNames(files, null)[0] ?? "App.tsx";
    return {
      rowId: data.id,
      fieldId: name,
      name,
      path: `aga-app:/${data.slug || data.id}/${name}`,
      language: languageOf(name),
      content: files[name] ?? "",
      updatedAt: data.updated_at,
    };
  },

  async save(supabase: SupabaseClient, args: SaveSourceArgs): Promise<SaveSourceResult> {
    const fileName = args.fieldId;
    if (!fileName) throw new Error("Saving an Applet needs the file name.");
    const updatedAt = await writeFiles(supabase, args.rowId, (files) => ({ ...files, [fileName]: args.content }), fileName);
    return { updatedAt };
  },

  /**
   * Without a file: renames the Applet. With a file: renames that file (and the entry, when it is the
   * entry). Pages naming the old file keep working only if they are edited too — the page list is the
   * Applet editor's (`/applets/manage/<id>/settings`).
   */
  async rename(supabase: SupabaseClient, args: RenameSourceArgs): Promise<RenameSourceResult> {
    const trimmed = args.newName.trim();
    if (!trimmed) throw new Error("Name cannot be empty.");
    if (args.fieldId) {
      const from = args.fieldId;
      const { data: row, error: readError } = await queryFilesRow(supabase, args.rowId);
      if (readError) throw readError;
      if (!row) throw new Error("This app no longer exists.");
      const updatedAt = await writeFiles(
        supabase,
        args.rowId,
        (files) => {
          if (from === trimmed || !(from in files)) return files;
          const { [from]: source, ...rest } = files;
          return { ...rest, [trimmed]: source ?? "" };
        },
        from,
      );
      if (row.entry === from) {
        const { error } = await supabase.schema("app").from("definition").update({ entry: trimmed }).eq("id", args.rowId);
        if (error) throw error;
      }
      return { updatedAt, appliedName: trimmed };
    }
    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .update({ name: trimmed })
      .eq("id", args.rowId)
      .select("updated_at, name")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new RemoteConflictError(SOURCE_ID, args.rowId);
    return { updatedAt: data.updated_at, appliedName: data.name };
  },
};

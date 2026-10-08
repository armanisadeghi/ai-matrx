/**
 * features/files/virtual-sources/adapters/aga-apps.ts
 *
 * Applets virtual source. Backed by `app.definition`: each Applet is one leaf,
 * its ENTRY file (`files[entry]`). The other files of a multi-file Applet are
 * edited through the Library source (`features/code/library-sources/adapters/
 * aga-apps.ts`, one leaf per file). A save merges the one file into `files`
 * on the record's `version` (`mergeJsonColumn`) and the version trigger keeps
 * a snapshot. Double-click opens the `/code` workspace with the right tab.
 *
 * Ported from the older `LibrarySourceAdapter` at
 * `features/code/library-sources/adapters/aga-apps.ts` and extended with
 * rename / delete / openInRoute.
 */

"use client";

import { findPatchResidue } from "@/features/code-editor/utils/patchResidue";
import { Workflow } from "lucide-react";
import { registerVirtualSource } from "@/features/files/virtual-sources/registry";
import { makeCodeInlinePreview } from "./CodeInlinePreview";
import type {
  ListArgs,
  RenameArgs,
  WriteArgs,
  VirtualContent,
  VirtualNode,
  VirtualSourceAdapter,
} from "@/features/files/virtual-sources/types";
import type { Database } from "@/types/database.types";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { writeOne } from "@/utils/supabase/writeOne";
import { mergeJsonColumn } from "@ai-matrx/data/db";
import { defaultListFilter, type ListScopeWord } from "@/lib/list-scope";
import { appletState, appletVersionLabel } from "@/features/applets/lib/applet-state";

const TAB_ID_PREFIX = "aga-app:";

const COLUMNS = "id,name,slug,files,entry,updated_at,status,published_to_web,description,content_version";

type AgaAppRow = Pick<
  Database["app"]["Tables"]["definition"]["Row"],
  "id" | "name" | "slug" | "files" | "entry" | "updated_at" | "status" | "published_to_web" | "description" | "content_version"
>;

type FilesMap = Record<string, string>;

function filesOf(value: unknown): FilesMap {
  const out: FilesMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [name, source] of Object.entries(value)) if (typeof source === "string") out[name] = source;
  return out;
}

/** The entry file's name: the record's `entry`, else its first file, else App.tsx. */
function entryName(row: Pick<AgaAppRow, "files" | "entry">): string {
  return row.entry || Object.keys(filesOf(row.files))[0] || "App.tsx";
}

const agaAppsAdapter: VirtualSourceAdapter = {
  sourceId: "aga_apps",
  label: "Applets",
  icon: Workflow,
  capabilities: {
    list: true,
    read: true,
    write: true,
    rename: true,
    delete: true,
    move: false,
    folders: false,
    binary: false,
    versions: false,
    multiField: false,
  },
  dnd: { acceptsOwn: false },
  pathPrefix: "/Applets",

  makeTabId(id) {
    return `${TAB_ID_PREFIX}${id}`;
  },
  parseTabId(tabId) {
    if (!tabId.startsWith(TAB_ID_PREFIX)) return null;
    const id = tabId.slice(TAB_ID_PREFIX.length);
    return id ? { id } : null;
  },

  async list(supabase, userId, args: ListArgs): Promise<VirtualNode[]> {
    if (!userId) return [];
    if (args.parentId !== null) return []; // flat — no folders
    // DD-137c / §3.3: `app` is registered `organization`, so the apps source lists the
    // organization's apps. RLS is the ceiling; this is only where the tree opens.
    const listScope = await defaultListFilter("app", { userId, ownerColumn: "user_id" });
    let appQuery = supabase
      .schema("app").from("definition")
      .select(COLUMNS)
      .is("deleted_at", null);
    appQuery = listScope.apply(appQuery);
    const { data, error } = await appQuery
      .order("updated_at", { ascending: false })
      .limit(args.limit ?? 200);
    if (error) return [];
    return ((data ?? []) as AgaAppRow[]).map((row) => ({
      id: row.id,
      kind: "file" as const,
      name: row.name,
      parentId: null,
      updatedAt: row.updated_at,
      extension: "tsx",
      language: "typescript",
      mimeType: "text/typescript",
      hasContent: !!filesOf(row.files)[entryName(row)],
      // THE state's word while not published, else the saved content version.
      badge: appletState(row).kind !== "published" ? appletState(row).label : (appletVersionLabel(row.content_version) ?? undefined),
    }));
  },

  async read(supabase, _userId, id): Promise<VirtualContent> {
    const { data, error } = await supabase
      .schema("app").from("definition")
      .select(COLUMNS)
      .is("deleted_at", null)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error("We couldn't open this Applet. Please try again.");
    }
    // Zero rows is denied / deleted / stale-id and this adapter cannot tell
    // which — the canonical honest throw says both and screams into the
    // Error Inspector.
    if (!data) {
      throw recordUnavailable({
        entity: "Applet",
        reason: "unknown",
        recordId: id,
        relation: "app.definition",
      });
    }
    const row = data as AgaAppRow;
    const entry = entryName(row);
    return {
      id: row.id,
      name: entry,
      path: `aga-app:/${row.slug || row.id}/${entry}`,
      language: "typescript",
      mimeType: "text/typescript",
      content: filesOf(row.files)[entry] ?? "",
      updatedAt: row.updated_at,
    };
  },

  async write(supabase, _userId, args: WriteArgs) {
    // Patch markers are never code: refuse the save before a mis-parsed SEARCH/REPLACE block leaves
    // an Applet that cannot compile (feedback 02a11ba3; the database refuses it too).
    const residue = findPatchResidue(args.content);
    if (residue) {
      throw new Error(
        `This code still contains a patch marker ("${residue.text}", line ${residue.line}), so it was not saved. Remove it and save again.`,
      );
    }
    type Row = Pick<Database["app"]["Tables"]["definition"]["Row"], "id" | "version" | "files" | "entry" | "updated_at">;
    const columns = "id,version,files,entry,updated_at";
    const fetchCurrent = () =>
      supabase.schema("app").from("definition").select(columns).eq("id", args.id).is("deleted_at", null).maybeSingle();
    const first = await fetchCurrent();
    if (first.error || !first.data) throw new Error("This Applet no longer exists.");
    const entry = entryName(first.data);
    const result = await mergeJsonColumn<Row>({
      fetchCurrent,
      readColumn: (row) => row.files,
      merge: (current) => ({ ...filesOf(current), [entry]: args.content }),
      applyUpdate: ({ value, expectedVersion, nextVersion }) =>
        supabase
          .schema("app")
          .from("definition")
          .update({ files: value as Database["app"]["Tables"]["definition"]["Update"]["files"], version: nextVersion })
          .eq("id", args.id)
          .eq("version", expectedVersion)
          .select(columns)
          .maybeSingle(),
    });
    if (result.status === "saved") return { updatedAt: result.row.updated_at };
    throw new Error(
      result.status === "not_found"
        ? "This Applet no longer exists."
        : "We couldn't save this Applet. It may have been changed somewhere else — reload it and reapply your edit.",
    );
  },

  async rename(supabase, userId, args: RenameArgs) {
    let query = supabase
      .schema("app").from("definition")
      .update({
        name: args.newName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.id)
      .eq("user_id", userId);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error || !data) {
      throw new Error(
        "We couldn't rename this Applet. You may not be allowed to change it.",
      );
    }
    return { updatedAt: (data as { updated_at: string }).updated_at };
  },

  async delete(supabase, userId, id) {
    // Archive = the soft delete (`deleted_at`) — the ONE archive mechanism the /applets
    // Archived filter, its Restore and /trash read. Only its maker may (as on /applets).
    await writeOne(
      supabase
        .schema("app").from("definition")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("created_by", userId)
        .select("id"),
      { action: "archive", noun: "Applet" },
    );
  },

  inlinePreview: makeCodeInlinePreview("aga_apps"),

  openInRoute(node) {
    return `/code?tab=${encodeURIComponent(`${TAB_ID_PREFIX}${node.id}`)}`;
  },
};

registerVirtualSource(agaAppsAdapter);

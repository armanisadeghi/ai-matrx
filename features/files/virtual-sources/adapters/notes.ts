/**
 * features/files/virtual-sources/adapters/notes.ts
 *
 * Notes virtual source adapter. Surfaces the existing notes-v2 system in the
 * `/files` tree without disturbing how notes-v2 itself runs (Phase 0 audit
 * confirmed this adapter is purely additive).
 *
 * Mapping:
 *   - `notes` table rows → file leaves
 *   - `notes.folder_name` (string column) → folders, materialized from the
 *     distinct values plus the explicit `note_folders` table
 *   - `notes.label` → display name
 *   - `notes.content` → file content (markdown)
 *   - `notes.updated_at` → optimistic concurrency
 *
 * Double-clicking a note in `/files` hands off to `/notes/<id>`, where the
 * rich notes-v2 editor takes over. The cloud-files Monaco editor is reserved
 * for sources without a dedicated route.
 */

"use client";

import { StickyNote } from "lucide-react";
import { registerVirtualSource } from "@/features/files/virtual-sources/registry";
import { NotesInlinePreview } from "./NotesInlinePreview";
import type {
  ListArgs,
  RenameArgs,
  WriteArgs,
  MoveArgs,
  CreateArgs,
  VirtualContent,
  VirtualNode,
  VirtualSourceAdapter,
} from "@/features/files/virtual-sources/types";

/** Sentinel id used in synthetic ids for the implicit "Unfiled" folder —
 *  notes whose `folder_name` column is null. */
const UNFILED_VID = "__unfiled__";
const UNFILED_LABEL = "Unfiled";

/** Build a virtual id for a folder row. Real folder names are unique per user
 *  in `note_folders`, so we use the name as the virtualId. Synthetic ids are
 *  scoped per-adapter so collisions across sources are impossible. */
function folderVidFromName(name: string): string {
  return `folder:${name}`;
}

function folderNameFromVid(vid: string): string | null {
  if (vid === UNFILED_VID) return null;
  if (vid.startsWith("folder:")) return vid.slice("folder:".length);
  return null;
}

const TAB_ID_PREFIX = "notes:";

const notesAdapter: VirtualSourceAdapter = {
  sourceId: "notes",
  label: "Notes",
  icon: StickyNote,
  capabilities: {
    list: true,
    read: true,
    write: true,
    rename: true,
    delete: true,
    move: true,
    folders: true,
    binary: false,
    versions: true,
    multiField: false,
  },
  dnd: { acceptsOwn: true },
  pathPrefix: "/Notes",

  makeTabId(id, fieldId) {
    return fieldId
      ? `${TAB_ID_PREFIX}${id}:${fieldId}`
      : `${TAB_ID_PREFIX}${id}`;
  },
  parseTabId(tabId) {
    if (!tabId.startsWith(TAB_ID_PREFIX)) return null;
    const rest = tabId.slice(TAB_ID_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon < 0) return { id: rest };
    return { id: rest.slice(0, colon), fieldId: rest.slice(colon + 1) };
  },

  async list(supabase, userId, args: ListArgs): Promise<VirtualNode[]> {
    if (!userId) return [];
    if (args.parentId === null) {
      // Adapter root — list folders.
      // Pull distinct `folder_name` values from notes plus any rows in
      // `note_folders` (the materialized list). Union avoids missing folders
      // that exist in either source.
      const [folderRows, noteFolders] = await Promise.all([
        supabase
          .from("note_folders")
          .select("folder_name")
          .eq("user_id", userId),
        supabase
          .from("notes")
          .select("folder_name")
          .eq("user_id", userId)
          .eq("is_deleted", false),
      ]);
      const names = new Set<string>();
      let hasUnfiled = false;
      for (const row of folderRows.data ?? []) {
        if (row.folder_name) names.add(row.folder_name);
      }
      for (const row of noteFolders.data ?? []) {
        if (row.folder_name) names.add(row.folder_name);
        else hasUnfiled = true;
      }
      const folders: VirtualNode[] = Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          id: folderVidFromName(name),
          kind: "folder" as const,
          name,
          parentId: null,
        }));
      if (hasUnfiled) {
        folders.unshift({
          id: UNFILED_VID,
          kind: "folder",
          name: UNFILED_LABEL,
          parentId: null,
        });
      }
      return folders;
    }
    // Inside a folder — list notes whose folder_name matches.
    const folderName = folderNameFromVid(args.parentId);
    let query = supabase
      .from("notes")
      .select("id, label, updated_at, version, folder_name")
      .eq("user_id", userId)
      .eq("is_deleted", args.includeDeleted ? true : false);
    if (folderName === null) {
      query = query.is("folder_name", null);
    } else {
      query = query.eq("folder_name", folderName);
    }
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map(
      (row): VirtualNode => ({
        id: row.id,
        kind: "file",
        name: row.label ?? "Untitled note",
        parentId: args.parentId,
        updatedAt: row.updated_at ?? undefined,
        extension: "md",
        language: "markdown",
        mimeType: "text/markdown",
      }),
    );
  },

  async read(supabase, userId, id): Promise<VirtualContent> {
    const { data, error } = await supabase
      .from("notes")
      .select("id, label, content, updated_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Note not found: ${id}`);
    }
    const name = data.label ?? "Untitled note";
    return {
      id: data.id,
      name,
      path: `/Notes/${name}.md`,
      language: "markdown",
      mimeType: "text/markdown",
      content: data.content ?? "",
      updatedAt: data.updated_at ?? undefined,
    };
  },

  async write(supabase, userId, args: WriteArgs) {
    const update: { content: string; updated_at: string } = {
      content: args.content,
      updated_at: new Date().toISOString(),
    };
    let query = supabase
      .from("notes")
      .update(update)
      .eq("id", args.id)
      .eq("user_id", userId);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query
      .select("updated_at")
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Note write failed");
    }
    return { updatedAt: data.updated_at ?? update.updated_at };
  },

  async rename(supabase, userId, args: RenameArgs) {
    const update = {
      label: args.newName,
      updated_at: new Date().toISOString(),
    };
    let query = supabase
      .from("notes")
      .update(update)
      .eq("id", args.id)
      .eq("user_id", userId);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query
      .select("updated_at")
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Note rename failed");
    }
    return { updatedAt: data.updated_at ?? update.updated_at };
  },

  async move(supabase, userId, args: MoveArgs) {
    // Move = update folder_name. Parent virtual id is `folder:<name>` or
    // `__unfiled__` (which clears the column).
    const folderName =
      args.newParentId === null ? null : folderNameFromVid(args.newParentId);
    const update = {
      folder_name: folderName,
      updated_at: new Date().toISOString(),
    };
    let query = supabase
      .from("notes")
      .update(update)
      .eq("id", args.id)
      .eq("user_id", userId);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query
      .select("updated_at")
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Note move failed");
    }
    return { updatedAt: data.updated_at ?? update.updated_at };
  },

  async delete(supabase, userId, id, hard) {
    if (hard) {
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("notes")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async create(supabase, userId, args: CreateArgs) {
    if (args.kind === "folder") {
      // note_folders is the materialized list — insert and return as a node.
      const { data, error } = await supabase
        .from("note_folders")
        .insert({ user_id: userId, folder_name: args.name })
        .select("id, folder_name")
        .maybeSingle();
      if (error || !data) {
        throw new Error(error?.message ?? "Folder create failed");
      }
      return {
        id: folderVidFromName(data.folder_name ?? args.name),
        kind: "folder" as const,
        name: data.folder_name ?? args.name,
        parentId: null,
      };
    }
    const folderName =
      args.parentId === null
        ? null
        : folderNameFromVid(args.parentId);
    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: userId,
        label: args.name,
        content: args.content ?? "",
        folder_name: folderName,
        // Notes are private by default. The `notes.visibility` enum column
        // (2026 canonicalization) defaults to `'internal'` at the DB; set it
        // explicitly so a new note isn't silently org-visible.
        visibility: "private",
      })
      .select("id, label, updated_at")
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Note create failed");
    }
    return {
      id: data.id,
      kind: "file" as const,
      name: data.label ?? args.name,
      parentId: args.parentId,
      updatedAt: data.updated_at ?? undefined,
      extension: "md",
      language: "markdown",
      mimeType: "text/markdown",
    };
  },

  inlinePreview: NotesInlinePreview,

  openInRoute(node) {
    // Folder nodes don't have a dedicated route; only file leaves do.
    if (node.kind === "folder") return null;
    return `/notes/${node.id}`;
  },

  async listVersions(supabase, id) {
    const { data } = await supabase
      .from("note_versions")
      .select("id, version_number, created_at, created_by, change_summary")
      .eq("note_id", id)
      .order("version_number", { ascending: false });
    return (data ?? []).map((row) => ({
      id: row.id,
      versionNumber: row.version_number ?? 0,
      createdAt: row.created_at ?? "",
      createdBy: row.created_by ?? null,
      changeSummary: row.change_summary ?? null,
    }));
  },
};

registerVirtualSource(notesAdapter);

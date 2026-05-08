/**
 * features/files/virtual-sources/adapters/code-files.ts
 *
 * Code Snippets virtual source. Backed by `code_files` (content) +
 * `code_file_folders` (hierarchy). Per the user's call we are NOT migrating
 * snippets to S3-backed cloud-files — they stay as Postgres rows and surface
 * here alongside Notes / Agent Apps / Tool UIs.
 *
 * Hierarchy: real folder tree via `code_file_folders.parent_folder_id`.
 * Files at the root have `folder_id = null`.
 *
 * Storage caveat: large rows store their content in cld_files. `s3_key`
 * holds a cld_files UUID, `s3_bucket = "cloud-files"`. The adapter
 * prefers inline `content` when present and falls back to the universal
 * file handler when `s3_key` is set.
 */

"use client";

import { Code2 } from "lucide-react";
import { registerVirtualSource } from "@/features/files/virtual-sources/registry";
import { makeCodeInlinePreview } from "./CodeInlinePreview";
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

const TAB_ID_PREFIX = "code-file:";

interface CodeFileRow {
  id: string;
  name: string;
  language: string;
  folder_id: string | null;
  updated_at: string;
  is_deleted: boolean;
  s3_key: string | null;
  s3_bucket: string | null;
  content: string;
}

interface CodeFolderRow {
  id: string;
  name: string;
  parent_folder_id: string | null;
  updated_at: string;
}

const FILE_LIST_COLUMNS =
  "id,name,language,folder_id,updated_at,is_deleted,s3_key,s3_bucket";
const FOLDER_LIST_COLUMNS = "id,name,parent_folder_id,updated_at";

function languageToExtension(lang: string): string {
  switch (lang.toLowerCase()) {
    case "typescript":
    case "tsx":
      return "tsx";
    case "javascript":
    case "jsx":
      return "jsx";
    case "python":
      return "py";
    case "json":
      return "json";
    case "markdown":
      return "md";
    case "html":
      return "html";
    case "css":
      return "css";
    case "sql":
      return "sql";
    case "yaml":
      return "yaml";
    default:
      return "txt";
  }
}

function languageToMime(lang: string): string {
  switch (lang.toLowerCase()) {
    case "typescript":
    case "tsx":
      return "text/typescript";
    case "javascript":
    case "jsx":
      return "text/javascript";
    case "python":
      return "text/x-python";
    case "json":
      return "application/json";
    case "markdown":
      return "text/markdown";
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "sql":
      return "application/sql";
    case "yaml":
      return "application/yaml";
    default:
      return "text/plain";
  }
}

const codeFilesAdapter: VirtualSourceAdapter = {
  sourceId: "code_files",
  label: "Code Snippets",
  icon: Code2,
  capabilities: {
    list: true,
    read: true,
    write: true,
    rename: true,
    delete: true,
    move: true,
    folders: true,
    binary: false,
    versions: false,
    multiField: false,
  },
  dnd: { acceptsOwn: true },
  pathPrefix: "/Code Snippets",

  makeTabId(id) {
    return `${TAB_ID_PREFIX}${id}`;
  },
  parseTabId(tabId) {
    if (!tabId.startsWith(TAB_ID_PREFIX)) return null;
    const id = tabId.slice(TAB_ID_PREFIX.length);
    return id ? { id } : null;
  },

  async list(supabase, _userId, args: ListArgs): Promise<VirtualNode[]> {
    // RLS scopes both `code_files` and `code_file_folders` by `auth.uid()`,
    // so we don't need an explicit `.eq("user_id", userId)`. Adding it
    // breaks when the Redux `userAuth.id` hasn't hydrated yet (passed in as
    // empty string) — the predicate would silently match nothing.
    const [folderRes, fileRes] = await Promise.all([
      args.parentId === null
        ? supabase
            .from("code_file_folders")
            .select(FOLDER_LIST_COLUMNS)
            .is("parent_folder_id", null)
            .order("name", { ascending: true })
        : supabase
            .from("code_file_folders")
            .select(FOLDER_LIST_COLUMNS)
            .eq("parent_folder_id", args.parentId)
            .order("name", { ascending: true }),
      args.parentId === null
        ? supabase
            .from("code_files")
            .select(FILE_LIST_COLUMNS)
            .eq("is_deleted", false)
            .is("folder_id", null)
            .order("updated_at", { ascending: false })
        : supabase
            .from("code_files")
            .select(FILE_LIST_COLUMNS)
            .eq("is_deleted", false)
            .eq("folder_id", args.parentId)
            .order("updated_at", { ascending: false }),
    ]);

    const folders: VirtualNode[] = ((folderRes.data ?? []) as CodeFolderRow[]).map(
      (row) => ({
        id: row.id,
        kind: "folder" as const,
        name: row.name,
        parentId: row.parent_folder_id,
        updatedAt: row.updated_at,
      }),
    );
    const files: VirtualNode[] = ((fileRes.data ?? []) as CodeFileRow[]).map(
      (row) => ({
        id: row.id,
        kind: "file" as const,
        name: row.name,
        parentId: row.folder_id,
        updatedAt: row.updated_at,
        extension: languageToExtension(row.language),
        language: row.language,
        mimeType: languageToMime(row.language),
        hasContent: !!row.content || !!row.s3_key,
      }),
    );
    return [...folders, ...files];
  },

  async read(supabase, _userId, id): Promise<VirtualContent> {
    const { data, error } = await supabase
      .from("code_files")
      .select(`${FILE_LIST_COLUMNS},content`)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Code file not found: ${id}`);
    }
    const row = data as unknown as CodeFileRow;
    let content = row.content ?? "";
    if (!content && row.s3_key) {
      // S3-backed snippet — fetch via the universal handler. The s3_key
      // is a cld_files UUID for new rows.
      const { fileHandler } = await import("@/features/file-handler/handler");
      const blob = await fileHandler
        .use({ kind: "file_id", fileId: row.s3_key })
        .as({ kind: "blob" });
      content = await blob.text();
    }
    return {
      id: row.id,
      name: row.name,
      path: `code-file:/${row.name}`,
      language: row.language,
      mimeType: languageToMime(row.language),
      content,
      updatedAt: row.updated_at,
    };
  },

  async write(supabase, _userId, args: WriteArgs) {
    // RLS scopes the update — no explicit user_id predicate. Adding one
    // would silently drop the write when `userAuth.id` hasn't hydrated.
    let query = supabase
      .from("code_files")
      .update({
        content: args.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.id);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query.select("updated_at").maybeSingle();
    if (error) {
      throw new Error(error.message || "Code file save failed");
    }
    if (!data) {
      throw new Error(
        `Code file save returned no row — RLS may have blocked the update (id=${args.id})`,
      );
    }
    return { updatedAt: (data as { updated_at: string }).updated_at };
  },

  async rename(supabase, _userId, args: RenameArgs) {
    let query = supabase
      .from("code_files")
      .update({ name: args.newName, updated_at: new Date().toISOString() })
      .eq("id", args.id);
    if (args.expectedUpdatedAt) {
      query = query.eq("updated_at", args.expectedUpdatedAt);
    }
    const { data, error } = await query.select("updated_at").maybeSingle();
    if (!error && data) {
      return { updatedAt: (data as { updated_at: string }).updated_at };
    }
    // Try as a folder.
    const folderRes = await supabase
      .from("code_file_folders")
      .update({ name: args.newName, updated_at: new Date().toISOString() })
      .eq("id", args.id)
      .select("updated_at")
      .maybeSingle();
    if (folderRes.error || !folderRes.data) {
      throw new Error(folderRes.error?.message ?? "Code file rename failed");
    }
    return {
      updatedAt: (folderRes.data as { updated_at: string }).updated_at,
    };
  },

  async move(supabase, _userId, args: MoveArgs) {
    // Files use folder_id; folders use parent_folder_id. Try file first.
    const fileRes = await supabase
      .from("code_files")
      .update({
        folder_id: args.newParentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.id)
      .select("updated_at")
      .maybeSingle();
    if (!fileRes.error && fileRes.data) {
      return { updatedAt: (fileRes.data as { updated_at: string }).updated_at };
    }
    const folderRes = await supabase
      .from("code_file_folders")
      .update({
        parent_folder_id: args.newParentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.id)
      .select("updated_at")
      .maybeSingle();
    if (folderRes.error || !folderRes.data) {
      throw new Error(folderRes.error?.message ?? "Move failed");
    }
    return {
      updatedAt: (folderRes.data as { updated_at: string }).updated_at,
    };
  },

  async delete(supabase, _userId, id, hard) {
    if (hard) {
      const { error } = await supabase
        .from("code_files")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("code_files")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async create(supabase, userId, args: CreateArgs) {
    if (args.kind === "folder") {
      const { data, error } = await supabase
        .from("code_file_folders")
        .insert({
          user_id: userId,
          name: args.name,
          parent_folder_id: args.parentId,
        })
        .select(FOLDER_LIST_COLUMNS)
        .maybeSingle();
      if (error || !data) {
        throw new Error(error?.message ?? "Folder create failed");
      }
      const row = data as unknown as CodeFolderRow;
      return {
        id: row.id,
        kind: "folder" as const,
        name: row.name,
        parentId: row.parent_folder_id,
        updatedAt: row.updated_at,
      };
    }
    const { data, error } = await supabase
      .from("code_files")
      .insert({
        user_id: userId,
        name: args.name,
        content: args.content ?? "",
        folder_id: args.parentId,
        language: "plaintext",
      })
      .select(FILE_LIST_COLUMNS)
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Code file create failed");
    }
    const row = data as unknown as CodeFileRow;
    return {
      id: row.id,
      kind: "file" as const,
      name: row.name,
      parentId: row.folder_id,
      updatedAt: row.updated_at,
      extension: languageToExtension(row.language),
      language: row.language,
      mimeType: languageToMime(row.language),
      hasContent: !!row.content || !!row.s3_key,
    };
  },

  inlinePreview: makeCodeInlinePreview("code_files"),

  openInRoute(node) {
    if (node.kind === "folder") return null;
    return `/code?tab=${encodeURIComponent(`${TAB_ID_PREFIX}${node.id}`)}`;
  },
};

registerVirtualSource(codeFilesAdapter);

// features/code-files/service/codeFilesService.ts
//
// Direct Supabase CRUD for code_files and code_file_folders. This layer is
// dumb on purpose — no S3 handling, no caching, no smart label generation.
// The S3 routing and dirty-field coalescing live in the thunks; the API
// facade in codeFilesApi.ts is what app code should call.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Json } from "@/types/database.types";
import type { CodeFile, CodeFolder } from "../redux/code-files.types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface CreateCodeFileInput {
  name?: string;
  path?: string | null;
  language?: string;
  content?: string;
  folder_id?: string | null;
  repository_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  workspace_id?: string | null;
  tags?: string[];
  metadata?: Json;
  s3_key?: string | null;
  s3_bucket?: string | null;
  is_public?: boolean;
}

export interface UpdateCodeFileInput {
  name?: string;
  path?: string | null;
  language?: string;
  content?: string;
  folder_id?: string | null;
  repository_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  workspace_id?: string | null;
  tags?: string[];
  metadata?: Json;
  s3_key?: string | null;
  s3_bucket?: string | null;
  is_public?: boolean;
  is_readonly?: boolean;
}

export interface CreateCodeFolderInput {
  name: string;
  description?: string | null;
  parent_folder_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  workspace_id?: string | null;
  icon_name?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface UpdateCodeFolderInput {
  name?: string;
  description?: string | null;
  parent_folder_id?: string | null;
  icon_name?: string;
  color?: string | null;
  sort_order?: number | null;
}

// ── Code file list (metadata only, no content) ──────────────────────────────

/** Columns selected for the list view — intentionally excludes content. */
const LIST_COLUMNS =
  "id,user_id,folder_id,repository_id,organization_id,project_id,workspace_id,task_id,name,path,language,content_hash,s3_key,s3_bucket,is_public,is_deleted,is_readonly,tags,metadata,version,created_at,updated_at";

/**
 * Fetch metadata (no content) for all of the current user's code files.
 * Used to populate the manager/sidebar without pulling potentially massive
 * blobs into memory.
 *
 * Note: no explicit `user_id` filter — RLS on `code_files` scopes rows to
 * the caller's `auth.uid()`. Adding a redundant `.eq("user_id", ...)`
 * here would force this fetch to wait for the Redux auth slice to
 * hydrate, which is exactly the bug that surfaced as
 * "Failed to load library — Not authenticated" on first paint.
 */
export async function fetchCodeFilesList(): Promise<CodeFile[]> {
  const { data, error } = await supabase
    .schema("code").from("code_files")
    .select(LIST_COLUMNS)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[codeFilesService] fetchCodeFilesList failed", error);
    throw error;
  }

  return ((data ?? []) as unknown[]).map((row) => ({
    ...(row as Omit<CodeFile, "content">),
    content: "",
  })) as CodeFile[];
}

/** Fetch a single code file with full content. */
export async function fetchCodeFileById(id: string): Promise<CodeFile | null> {
  const { data, error } = await supabase
    .schema("code").from("code_files")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("[codeFilesService] fetchCodeFileById failed", error);
    return null;
  }
  return data as CodeFile;
}

/** Bulk fetch full content for a set of file IDs. */
export async function fetchCodeFilesByIds(ids: string[]): Promise<CodeFile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .schema("code").from("code_files")
    .select("*")
    .in("id", ids)
    .eq("is_deleted", false);
  if (error) {
    console.error("[codeFilesService] fetchCodeFilesByIds failed", error);
    throw error;
  }
  return (data ?? []) as CodeFile[];
}

export async function createCodeFile(
  input: CreateCodeFileInput,
): Promise<CodeFile> {
  const userId = requireUserId();
  const name = input.name ?? "Untitled";
  // `path` is NOT NULL in the DB — fall back to the filename (or empty string)
  // so inserts never fail when the caller doesn't care about a folder-like path.
  const path = input.path ?? name;
  // Never write a null org — fall back to the cached personal org.
  const organizationId = await ensureOrgId(input.organization_id);
  const { data, error } = await supabase
    .schema("code").from("code_files")
    .insert({
      user_id: userId,
      name,
      path,
      language: input.language ?? "plaintext",
      content: input.content ?? "",
      folder_id: input.folder_id ?? null,
      repository_id: input.repository_id ?? null,
      organization_id: organizationId,
      project_id: input.project_id ?? null,
      task_id: input.task_id ?? null,
      workspace_id: input.workspace_id ?? null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      s3_key: input.s3_key ?? null,
      s3_bucket: input.s3_bucket ?? null,
      is_public: input.is_public ?? false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[codeFilesService] createCodeFile failed", error);
    throw error;
  }
  return data as CodeFile;
}

export async function updateCodeFile(
  id: string,
  updates: UpdateCodeFileInput,
): Promise<CodeFile> {
  const { data, error } = await supabase
    .schema("code").from("code_files")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[codeFilesService] updateCodeFile failed", error);
    throw error;
  }
  return data as CodeFile;
}

export async function deleteCodeFile(id: string): Promise<void> {
  const { error } = await supabase
    .schema("code").from("code_files")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) {
    console.error("[codeFilesService] deleteCodeFile failed", error);
    throw error;
  }
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function fetchCodeFolders(): Promise<CodeFolder[]> {
  // No explicit `user_id` filter — RLS scopes rows by `auth.uid()`. See
  // the matching note on `fetchCodeFilesList` for why we don't gate this
  // fetch on Redux auth-state hydration.
  const { data, error } = await supabase
    .schema("code").from("code_file_folders")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("[codeFilesService] fetchCodeFolders failed", error);
    throw error;
  }
  return (data ?? []) as CodeFolder[];
}

export async function createCodeFolder(
  input: CreateCodeFolderInput,
): Promise<CodeFolder> {
  const userId = requireUserId();
  // Never write a null org — fall back to the cached personal org.
  const organizationId = await ensureOrgId(input.organization_id);
  const { data, error } = await supabase
    .schema("code").from("code_file_folders")
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description ?? null,
      parent_folder_id: input.parent_folder_id ?? null,
      organization_id: organizationId,
      project_id: input.project_id ?? null,
      workspace_id: input.workspace_id ?? null,
      // `icon_name` is NOT NULL in the DB (default 'Folder'). Don't overwrite
      // the default with explicit null.
      icon_name: input.icon_name ?? "Folder",
      color: input.color ?? "zinc",
      sort_order: input.sort_order ?? 999,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[codeFilesService] createCodeFolder failed", error);
    throw error;
  }
  return data as CodeFolder;
}

export async function updateCodeFolder(
  id: string,
  updates: UpdateCodeFolderInput,
): Promise<CodeFolder> {
  const { data, error } = await supabase
    .schema("code").from("code_file_folders")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[codeFilesService] updateCodeFolder failed", error);
    throw error;
  }
  return data as CodeFolder;
}

export async function deleteCodeFolder(id: string): Promise<void> {
  const { error } = await supabase
    .schema("code").from("code_file_folders")
    .update({ is_active: false })
    .eq("id", id);
  if (error) {
    console.error("[codeFilesService] deleteCodeFolder failed", error);
    throw error;
  }
}

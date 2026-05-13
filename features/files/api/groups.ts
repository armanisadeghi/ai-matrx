/**
 * features/files/api/groups.ts
 *
 * User groups (for bulk permissions).
 *
 * Backend contract: features/files/cld_files_frontend.md §6 (Groups).
 *
 * DB tables: cld_user_groups + cld_user_group_members. (The Python doc
 * uses `cld_file_groups` naming; see PYTHON_TEAM_COMMS.md.)
 */

import {
  del,
  getJson,
  postJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import type {
  AddGroupMemberRequest,
  CloudUserGroupMemberRow,
  CloudUserGroupRow,
  CreateGroupRequest,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function listGroups(
  opts: RequestOptions = {},
): Promise<{ data: CloudUserGroupRow[]; meta: ResponseMeta }> {
  return getJson<CloudUserGroupRow[]>("/files/groups", opts);
}

export async function createGroup(
  body: CreateGroupRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudUserGroupRow; meta: ResponseMeta }> {
  return postJson<CloudUserGroupRow, CreateGroupRequest>(
    "/files/groups",
    body,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Group members
// ---------------------------------------------------------------------------

export async function listGroupMembers(
  groupId: string,
  opts: RequestOptions = {},
): Promise<{ data: CloudUserGroupMemberRow[]; meta: ResponseMeta }> {
  return getJson<CloudUserGroupMemberRow[]>(
    `/files/groups/${groupId}/members`,
    opts,
  );
}

export async function addGroupMember(
  groupId: string,
  body: AddGroupMemberRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudUserGroupMemberRow; meta: ResponseMeta }> {
  return postJson<CloudUserGroupMemberRow, AddGroupMemberRequest>(
    `/files/groups/${groupId}/members`,
    body,
    opts,
  );
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
  opts: RequestOptions = {},
): Promise<{ data: null; meta: ResponseMeta }> {
  return del<null>(`/files/groups/${groupId}/members/${userId}`, opts);
}

/**
 * features/files/api/fileOrganization.ts — LANE GATES-TAIL (VERIFIER-21 #2)
 *
 * A REQUEST ABOUT ONE FILE CARRIES THAT FILE'S ORGANIZATION — READ FROM THE FILE, NEVER FROM
 * THE PERSON'S PICKER.
 *
 * The defect: in a fresh session (header "Choose org") `/files/f/<id>` named the file and then
 * said "Couldn't load this file — GET /files/<id>/download → HTTP 400", because every per-file
 * request to the files service went out with no `X-Organization-Id` and the service refused it
 * ("Choose the organization you're working in"). Picking an organization in the shell made it
 * open. Access is personal (Arman, 2026-09-23): whether ONE object opens is never decided by
 * which organization is selected, and an object page resolves its organization FROM THE OBJECT.
 *
 * Where the file's organization comes from, in order:
 *   1. an organization the caller already named (`opts.organizationId`) — always wins;
 *   2. an organization remembered for this file id — the file page seeds it from the row it
 *      read under RLS as the person (`files.files.organization_id`), and every per-file read
 *      that answers records the row's own `organization_id`;
 *   3. the file row already in the files slice (`cloudFiles.filesById[id].organizationId`),
 *      loaded by a list or tree under the person's access.
 * With none of these the request goes as before (the transport's own rule decides); nothing
 * here ever reads the active selection, so nothing here can guess.
 */

import type { RequestOptions } from "@/lib/python-client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";

const remembered = new Map<string, string>();

function isOrganizationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Record the organization a file lives in, as the file's own row says. */
export function rememberFileOrganization(
  fileId: string | null | undefined,
  organizationId: string | null | undefined,
): void {
  if (!fileId || !isOrganizationId(organizationId)) return;
  remembered.set(fileId, organizationId);
}

/** Record it from any per-file answer that carries the row (`FileRecordApi` and kin). */
export function rememberFileOrganizationFrom(record: unknown): void {
  if (!record || typeof record !== "object") return;
  const row = record as { id?: unknown; file_id?: unknown; organization_id?: unknown };
  const id = typeof row.id === "string" ? row.id : typeof row.file_id === "string" ? row.file_id : null;
  rememberFileOrganization(id, row.organization_id as string | null | undefined);
}

/** The organization this file lives in, as far as the file itself has told us; null otherwise. */
export function fileOrganizationId(fileId: string): string | null {
  const known = remembered.get(fileId);
  if (known) return known;
  const state = getStoreSingleton()?.getState() as
    | { cloudFiles?: { filesById?: Record<string, { organizationId?: string | null } | undefined> } }
    | undefined;
  const fromSlice = state?.cloudFiles?.filesById?.[fileId]?.organizationId;
  return isOrganizationId(fromSlice) ? fromSlice : null;
}

/** `opts` with the file's own organization filled in when the caller named none. */
export function withFileOrganization<T extends RequestOptions>(fileId: string, opts: T): T {
  if (opts.organizationId) return opts;
  const organizationId = fileOrganizationId(fileId);
  return organizationId ? { ...opts, organizationId } : opts;
}

/** Test seam: forget every remembered file organization. */
export function __resetFileOrganizationsForTest(): void {
  remembered.clear();
}

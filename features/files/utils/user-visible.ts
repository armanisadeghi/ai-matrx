/**
 * features/files/utils/user-visible.ts
 *
 * THE ONE VISIBILITY RULE, MIRRORED — never a second rule.
 *
 * The rule that decides whether a cloud row is the user's own file (as opposed
 * to machine infrastructure) is declared ONCE, in the database:
 *
 *   files.is_user_visible_path(text)        — files   (system-files/, generations/, .matrx-tmp/,
 *                                             machine namespaces coding-sessions/, tool-images/)
 *   files.is_user_visible(files.files)      — + not derived, not a produced artifact (artifact_kind)
 *   files.is_user_visible_folder_path(text) — folders (system + machine namespaces)
 *   files.is_recent_activity(files.files)   — RECENTS: visible, not device-written
 *                                             (origin_device_id), not machine output under
 *                                             the person's roots
 *
 * Declared once in aidream packages/matrx-files/matrx_files/user_visible.py. The
 * rule and how a machine writer registers: common-docs
 * systems/files/user-files-vs-machine-files.md.
 *
 * `public.get_user_file_tree` and the daemon's sync feed both call those, so
 * anything that arrives through the RPC is ALREADY filtered — callers must not
 * filter it a second time. This module exists for the ONE consumer the RPC
 * cannot serve: Supabase Realtime `postgres_changes` payloads, which arrive
 * straight off the write-ahead log with no predicate applied.
 *
 * Because that consumer needs the answer synchronously, per row, the rule is
 * MIRRORED here rather than re-declared — the same "one declaration, several
 * call shapes, parity is the guard, not the syntax" posture the server takes
 * between its SQL function and its ORM filter set
 * (common-docs projects/folder-sync/specs/SPEC-SERVER.md §1.2).
 *
 * 🚨 The guard is `user-visible.parity.test.ts`: it runs every path below
 * through the LIVE database functions and asserts identical answers. If
 * somebody changes the SQL rule and not this file, that test goes red. Never
 * edit the logic here without running it.
 *
 * What this rule is NOT: a permission check (RLS is). Recents is a strict
 * SUBSET of it — `isRecentActivityFile` / `isRecentActivityPath` below, mirrors
 * of `files.is_recent_activity*`, and the ONLY Recents rule in the browser.
 *
 * FastFire note: top-level `FastFire/**` used to be hidden here by a rule the
 * server never had, so the desktop daemon would sync those bytes to disk while
 * the browser refused to show them. `FastFire` is now a REGISTERED
 * machine-written prefix (files.machine_written_prefixes) — the desktop
 * first-run deselects it by default, and nothing hides it
 * (SPEC-SERVER §1.4 S18, folder-sync DECISIONS D16).
 */

/** Top-level path segments the database treats as machine infrastructure. */
const SYSTEM_SEGMENTS = ["system-files", "generations"] as const;
const TMP_SEGMENT = ".matrx-tmp";
/** Mirror of `MACHINE_NAMESPACES` — top-level segments only machines write into. */
const MACHINE_SEGMENTS = ["coding-sessions", "tool-images"] as const;
/** Mirror of `RECENT_EXCLUDED_ROOTS` — machine output filed under the person's roots. */
const RECENT_EXCLUDED_ROOTS = [
  "Images/Generated",
  "Generated",
  "Agent Apps/blocks",
  "Images/agent-blocks",
  "Transcripts/Recordings",
  "FastFire/sessions",
  "FastFire/responses",
] as const;

/** `ltrim(p,'/')` — the database's own leading-slash shape. */
function stripLeadingSlashes(path: string): string {
  let i = 0;
  while (i < path.length && path[i] === "/") i += 1;
  return path.slice(i);
}

/** `split_part(ltrim(p,'/'),'/',1)` — the database's own first-segment shape. */
function firstSegment(path: string): string {
  const rest = stripLeadingSlashes(path);
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

/**
 * Mirror of `files.is_user_visible_path(text)` — the FILE rule.
 * True when the path is the user's own content rather than machine output.
 */
export function isUserVisibleFilePath(
  path: string | null | undefined,
): boolean {
  if (path === null || path === undefined) return false;
  const head = firstSegment(path);
  if ((SYSTEM_SEGMENTS as readonly string[]).includes(head)) return false;
  if ((MACHINE_SEGMENTS as readonly string[]).includes(head)) return false;
  return head !== TMP_SEGMENT;
}

/**
 * Mirror of `files.is_user_visible_folder_path(text)` — the FOLDER rule.
 * Deliberately NOT the same as the file rule: `.matrx-tmp` folders stay in
 * scope (unchanged since the tree first spelled it). Mirroring the divergence
 * is honest; inventing a stricter client rule is what this module exists to stop.
 */
export function isUserVisibleFolderPath(
  path: string | null | undefined,
): boolean {
  if (path === null || path === undefined) return false;
  const head = firstSegment(path);
  if ((SYSTEM_SEGMENTS as readonly string[]).includes(head)) return false;
  return !(MACHINE_SEGMENTS as readonly string[]).includes(head);
}

/** The shape a realtime `files.files` payload carries (published columns). */
export interface UserVisibleFileRowShape {
  file_path: string | null;
  parent_file_id: string | null;
  derivation_kind: string | null;
  /** A machine-produced artifact (e.g. 'coding_session_artifact'). */
  artifact_kind?: string | null;
}

/**
 * Mirror of `files.is_user_visible(files.files)` — the ROW rule: not a
 * derivative, and a user-visible path. `parent_file_id` and `derivation_kind`
 * are both required because 824 live rows are parentless variants, so neither
 * column alone excludes derivatives (SPEC-SERVER §1.2).
 */
export function isUserVisibleFileRow(row: UserVisibleFileRowShape): boolean {
  if (row.parent_file_id !== null && row.parent_file_id !== undefined)
    return false;
  if (row.derivation_kind !== null && row.derivation_kind !== undefined)
    return false;
  if (row.artifact_kind !== null && row.artifact_kind !== undefined)
    return false;
  return isUserVisibleFilePath(row.file_path);
}

/**
 * Mirror of `files.is_recent_activity_path(text)` — the path half of RECENTS:
 * a user-visible path that is not machine output filed under the person's
 * roots. Also the Recents rule for a FOLDER row.
 */
export function isRecentActivityPath(
  path: string | null | undefined,
): boolean {
  if (!isUserVisibleFilePath(path)) return false;
  const trimmed = stripLeadingSlashes(path as string);
  return !RECENT_EXCLUDED_ROOTS.some(
    (root) => trimmed === root || trimmed.startsWith(`${root}/`),
  );
}

/** The fields Recents needs from a file record (domain or row shape). */
export interface RecentActivityFileShape {
  filePath: string | null | undefined;
  /** The registered device that wrote the row; null for an in-app write. */
  originDeviceId?: string | null;
  parentFileId?: string | null;
  derivationKind?: string | null;
}

/**
 * Mirror of `files.is_recent_activity(files.files)` — RECENTS: the file is the
 * person's recent activity in the app. A file a desktop sync client wrote
 * (`originDeviceId`) is the person's file, but never their recent activity
 * (folder-sync DECISIONS R3).
 */
export function isRecentActivityFile(file: RecentActivityFileShape): boolean {
  if (file.originDeviceId) return false;
  if (file.parentFileId) return false;
  if (file.derivationKind) return false;
  return isRecentActivityPath(file.filePath);
}

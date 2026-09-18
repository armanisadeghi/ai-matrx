/**
 * features/files/utils/user-visible.ts
 *
 * THE ONE VISIBILITY RULE, MIRRORED — never a second rule.
 *
 * The rule that decides whether a cloud row is the user's own file (as opposed
 * to machine infrastructure) is declared ONCE, in the database:
 *
 *   files.is_user_visible_path(text)   — files   (system-files/, generations/, .matrx-tmp/)
 *   public.is_system_path(text)        — folders (system-files/, generations/)
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
 * What this rule is NOT: it is not "should this appear in Recents" (that is
 * `isSystemManagedContentPath`) and it is not a permission check (RLS is).
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

/** `split_part(ltrim(p,'/'),'/',1)` — the database's own first-segment shape. */
function firstSegment(path: string): string {
  let i = 0;
  while (i < path.length && path[i] === "/") i += 1;
  const rest = path.slice(i);
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
  return head !== TMP_SEGMENT;
}

/**
 * Mirror of `NOT public.is_system_path(text)` — the FOLDER rule as
 * `get_user_file_tree` spells it. Deliberately NOT the same as the file rule:
 * the tree keeps `.matrx-tmp` folders out of scope for the predicate and uses
 * the protected-system test instead. Mirroring the divergence is honest;
 * inventing a stricter client rule is what this module exists to stop.
 */
export function isUserVisibleFolderPath(
  path: string | null | undefined,
): boolean {
  if (path === null || path === undefined) return false;
  return !(SYSTEM_SEGMENTS as readonly string[]).includes(firstSegment(path));
}

/** The shape a realtime `files.files` payload carries (published columns). */
export interface UserVisibleFileRowShape {
  file_path: string | null;
  parent_file_id: string | null;
  derivation_kind: string | null;
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
  return isUserVisibleFilePath(row.file_path);
}

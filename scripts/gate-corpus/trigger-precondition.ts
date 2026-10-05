/**
 * The restore's "nothing to disable" precondition for tables this script does not own.
 *
 * `auth.users` carries exactly one user trigger by design: `on_auth_user_mirror`, which
 * keeps `iam.users` in step with it (Phase 2 of the database-estate reduction). It is
 * allowed BY NAME. Any other user trigger, on that table or any other, still fails the
 * precondition — a different trigger is a different restore problem and must be seen.
 */
export const ALLOWED_USER_TRIGGERS: Readonly<Record<string, readonly string[]>> = {
  "auth.users": ["on_auth_user_mirror"],
};

/** The user triggers that are NOT on the table's allow-list (empty = precondition holds). */
export function unexpectedUserTriggers(table: string, triggerNames: readonly string[]): string[] {
  const allowed = ALLOWED_USER_TRIGGERS[table] ?? [];
  return triggerNames.filter((n) => !allowed.includes(n));
}

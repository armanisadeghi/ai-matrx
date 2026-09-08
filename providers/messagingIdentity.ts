/**
 * A database call may name a user only after the app state and the Supabase
 * session agree on that identity. Account changes hydrate those two sources in
 * separate steps; mounting messaging in the gap makes its self-guarded RPCs
 * correctly reject the stale target user.
 */
export function verifiedMessagingUserId(
  appUserId: string | null | undefined,
  sessionUserId: string | null | undefined,
): string | null {
  return appUserId != null && appUserId === sessionUserId ? appUserId : null;
}

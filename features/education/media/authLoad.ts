/**
 * A persisted Redux identity can briefly precede Supabase's restored browser
 * session. Library reads must wait for all three signals or PostgREST sends
 * the request as `anon`, where private study media is intentionally closed.
 */
export function authenticatedStudyMediaLoadKey(input: {
  authReady: boolean;
  userId: string | null;
  accessToken: string | null;
}): string | null {
  const { authReady, userId, accessToken } = input;
  if (!authReady || !userId || !accessToken) return null;
  return userId;
}

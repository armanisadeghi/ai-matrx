"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";

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

/**
 * Same race, single-record shape: a detail page's `getById` fired on mount
 * before all three auth signals settle goes out as `anon`, and a private
 * `study_media` row refuses it with 42501 — rendering a real record's page as
 * a permanent "Something went wrong" on first load (there is no retry loop,
 * so the race is not self-healing). Every `study_media` detail read gates on
 * this before firing.
 */
export function useStudyMediaAuthReady(): boolean {
  const authReady = useAppSelector(selectAuthReady);
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  return Boolean(authReady && userId && accessToken);
}

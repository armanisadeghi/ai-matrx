/**
 * Action-type prefixes for transcript-studio thunks.
 *
 * This module exists so a consumer can recognize a thunk's action WITHOUT importing
 * the thunk itself. `realtimeMiddleware` only needs to know "did fetchSessions just
 * fulfil?" — a string comparison — but it was importing `fetchSessionsThunk` from
 * `./thunks` to call `.fulfilled.match(action)`. That single import dragged
 * `cleanRecording.thunk` -> the agent execution system -> canvas materialization ->
 * the markdown content-IR pipeline into `lib/redux/store.ts`, which is built under
 * Providers for EVERY route.
 *
 * Keep this file a leaf: string constants only, no imports. Both the thunk definition
 * and any matcher must read the prefix from here so they can never drift apart.
 */

export const TRANSCRIPT_STUDIO_FETCH_SESSIONS = "transcriptStudio/fetchSessions";

/** The `fulfilled` action type RTK derives from the prefix above. */
export const TRANSCRIPT_STUDIO_FETCH_SESSIONS_FULFILLED =
  `${TRANSCRIPT_STUDIO_FETCH_SESSIONS}/fulfilled` as const;

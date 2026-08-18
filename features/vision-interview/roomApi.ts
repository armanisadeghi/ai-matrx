// features/vision-interview/roomApi.ts
//
// The two aidream calls the v3 room cannot do itself (CLAUDE.md § Data flow —
// everything else in this feature is direct browser → Supabase):
//
//   POST /vision-interview/sessions/{id}/roles
//     Resolves every role's MANDATE and persists the bindings. The client can
//     never resolve a mandate — that authority is the server's — so without
//     this call `interview.session.role_bindings` is empty and every stage tab
//     is a dead room. Requires NO workflow run, and is idempotent: the
//     per-role conversation ids are stable across calls.
//
//   POST /vision-interview/sessions/{id}/observe
//     THE HIJACK (aidream `services/vision_interview/live_turns.py`). The
//     person now talks to an expert down the ORDINARY agent-chat path, which
//     deleted the mechanism the Scribe used to ride on. This ping tells the
//     server a turn landed; server-side it mirrors the conversation's new
//     messages into `interview.turn`, honours the `<answered_questions>`
//     block, and runs the Scribe + answer tracker. Fire-and-forget: it returns
//     `{scheduled: true}` immediately, the pass survives the tab closing, it
//     is idempotent per `chat.message.id`, and a pass with nothing new to
//     mirror returns before any model is called. A missed ping is repaired by
//     the next one — so this NEVER blocks the UI and never raises a toast.
//
// Paths are cast `as never` until `pnpm sync-types` regenerates
// `types/python-generated/api-types.ts` (same precedent as the `/start` call
// in hooks/useInterviewRun.ts).

import { callApi } from "@/lib/api/call-api";
import type { RoleKey } from "./types";

/** The `/roles` response — one entry per role key the server bound. */
export interface RolesReadyPayload {
  session_id: string;
  roles: Record<string, unknown>;
}

export function ensureSessionRolesCall(sessionId: string) {
  return callApi({
    path: "/vision-interview/sessions/{session_id}/roles" as never,
    method: "POST",
    pathParams: { session_id: sessionId } as never,
    body: {} as never,
  });
}

export function observeRoleTurnCall(sessionId: string, roleKey: RoleKey) {
  return callApi({
    path: "/vision-interview/sessions/{session_id}/observe" as never,
    method: "POST",
    pathParams: { session_id: sessionId } as never,
    body: { role_key: roleKey } as never,
  });
}

/** Narrows an unknown `/roles` body to its bindings map, or null if malformed. */
export function rolesFromPayload(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const roles = (data as { roles?: unknown }).roles;
  if (!roles || typeof roles !== "object") return null;
  return roles as Record<string, unknown>;
}

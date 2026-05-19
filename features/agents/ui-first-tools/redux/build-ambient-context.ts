/**
 * buildAmbientContext — pure dict builder for the ambient context keys
 * (user / client / route_brief / conversation / organization / project /
 * task / active_scopes) that ride on the FIRST request of a conversation.
 *
 * Critical design points:
 *   1. This does NOT write to the `instanceContext` Redux slice. That slice
 *      is for user-bound, explicitly-attached context — its entries render
 *      as chips above each user message via `ContextSlotChipStrip`. Putting
 *      ambient keys there would make them appear as chips on every message,
 *      which is wrong for "I'm telling the agent about itself once."
 *   2. This only runs on the first turn of a conversation. After that, the
 *      agent has the keys in its conversation history; re-sending them on
 *      every turn is noise.
 *
 * Returned dict is merged into `payload.context` in `executeInstance`.
 */

import type { RootState } from "@/lib/redux/store";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectProjectId,
  selectProjectName,
  selectTaskId,
  selectTaskName,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";

interface AmbientContextSnapshot {
  user: {
    id: string;
    name: string;
    email: string | null;
    is_admin: boolean;
    admin_level: string | null;
  };
  client: {
    surface: "nextjs";
    now: string;
    timezone: string;
    locale: string;
  };
  route_brief: {
    url: string | null;
    title: string | null;
    route_kind: string;
  };
  conversation: { id: string };
  organization?: { id: string; name: string | null };
  project?: { id: string; name: string | null };
  task?: { id: string; name: string | null };
  active_scopes?: Record<string, string>;
}

function snapshotRoute(): AmbientContextSnapshot["route_brief"] {
  if (typeof window === "undefined") {
    return { url: null, title: null, route_kind: "server" };
  }
  const url = window.location.pathname + window.location.search;
  const title = typeof document !== "undefined" ? document.title : null;
  let route_kind = "other";
  if (url.startsWith("/chat")) route_kind = "chat";
  else if (url.startsWith("/agents")) route_kind = "agents";
  else if (url.startsWith("/agent")) route_kind = "agents";
  else if (url.startsWith("/tasks")) route_kind = "tasks";
  else if (url.startsWith("/projects")) route_kind = "projects";
  else if (url.startsWith("/notes")) route_kind = "notes";
  else if (url.startsWith("/code")) route_kind = "code";
  else if (url === "/" || url === "") route_kind = "home";
  return { url, title, route_kind };
}

/**
 * Build the ambient context dict for the FIRST send of `conversationId`.
 * Returns `null` if there's no signed-in user — without RLS access the
 * server-side use of these keys is moot.
 */
export function buildAmbientContext(
  state: RootState,
  conversationId: string,
): Record<string, unknown> | null {
  const auth = state.userAuth;
  if (!auth?.id) return null;

  const profile = state.userProfile?.userMetadata;
  const name =
    profile?.fullName ||
    profile?.name ||
    profile?.preferredUsername ||
    auth.email ||
    "user";

  const now = new Date();
  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const locale =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "en-US";

  const snapshot: AmbientContextSnapshot = {
    user: {
      id: auth.id,
      name,
      email: auth.email,
      is_admin: auth.isAdmin ?? false,
      admin_level: auth.adminLevel ?? null,
    },
    client: {
      surface: "nextjs",
      now: now.toISOString(),
      timezone,
      locale,
    },
    route_brief: snapshotRoute(),
    conversation: { id: conversationId },
  };

  const orgId = selectOrganizationId(state);
  if (orgId) {
    snapshot.organization = {
      id: orgId,
      name: selectOrganizationName(state) ?? null,
    };
  }
  const projectId = selectProjectId(state);
  if (projectId) {
    snapshot.project = {
      id: projectId,
      name: selectProjectName(state) ?? null,
    };
  }
  const taskId = selectTaskId(state);
  if (taskId) {
    snapshot.task = { id: taskId, name: selectTaskName(state) ?? null };
  }

  const scopeSelections = selectScopeSelectionsContext(state);
  const activeScopes: Record<string, string> = {};
  for (const [k, v] of Object.entries(scopeSelections)) {
    if (v) activeScopes[k] = v;
  }
  if (Object.keys(activeScopes).length > 0) {
    snapshot.active_scopes = activeScopes;
  }

  return snapshot as unknown as Record<string, unknown>;
}

/**
 * Detect "this is the first turn of the conversation."
 *
 * Both of these are true:
 *  - The messages slice has no entry for this conversation OR the records
 *    map is empty (we haven't received any cx_message rows yet).
 *  - The conversation record's status isn't 'running' from a prior turn.
 *
 * The messages-slice check is sufficient on its own: a conversation with
 * even one previous turn will have at least the user message reserved.
 */
export function isFirstTurn(
  state: RootState,
  conversationId: string,
): boolean {
  const entry = state.messages?.byConversationId?.[conversationId];
  if (!entry) return true;
  if (!entry.orderedIds || entry.orderedIds.length === 0) return true;
  return false;
}

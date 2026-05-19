/**
 * seedAmbientContextKeys — writes a set of "always relevant" ambient context
 * keys into the per-conversation `instanceContext` slice. These ride on the
 * `context` field of every agent request and let the model template
 * `{{user.name}}` / `{{active_scope.name}}` / `{{route_brief.title}}` etc.
 * without us hand-wiring every key into every prompt.
 *
 * Why a thunk: it reads userAuth + appContext + scopes from Redux, so it has
 * to run on the client with access to the store. The instanceContext slice
 * is already the canonical home for the request's `context` dict — we just
 * write into it via the existing `setContextEntries` action.
 *
 * Called from:
 *   - The conversation-open path (lazy seed on first send if context is empty).
 *
 * Idempotent. Overwrites in place rather than appending — if the user
 * switches scopes mid-conversation, the next call refreshes the values.
 */

import type { ThunkAction } from "redux-thunk";
import type { UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectProjectId,
  selectProjectName,
  selectTaskId,
  selectTaskName,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";

type AmbientThunk = ThunkAction<void, RootState, unknown, UnknownAction>;

function snapshotRoute(): {
  url: string | null;
  title: string | null;
  route_kind: string;
} {
  if (typeof window === "undefined") {
    return { url: null, title: null, route_kind: "server" };
  }
  const url = window.location.pathname + window.location.search;
  const title = typeof document !== "undefined" ? document.title : null;
  // Coarse classification — fine routing details belong to the
  // `nextjs-surface` orchestration envelope, not the context payload.
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

export const seedAmbientContextKeys =
  (conversationId: string): AmbientThunk =>
  (dispatch, getState) => {
    const state = getState();
    const auth = state.userAuth;
    if (!auth?.id) return;

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

    const route_brief = snapshotRoute();

    const entries: Parameters<typeof setContextEntries>[0]["entries"] = [
      {
        key: "user",
        value: {
          id: auth.id,
          name,
          email: auth.email,
          is_admin: auth.isAdmin ?? false,
          admin_level: auth.adminLevel ?? null,
        },
        label: "Signed-in user",
      },
      {
        key: "client",
        value: {
          surface: "nextjs",
          now: now.toISOString(),
          timezone,
          locale,
        },
        label: "Client environment",
      },
      {
        key: "route_brief",
        value: route_brief,
        label: "Current route",
      },
      {
        key: "conversation",
        value: {
          id: conversationId,
        },
        label: "Active conversation",
      },
    ];

    const orgId = selectOrganizationId(state);
    if (orgId) {
      entries.push({
        key: "organization",
        value: { id: orgId, name: selectOrganizationName(state) ?? null },
        label: "Active organization",
      });
    }

    const projectId = selectProjectId(state);
    if (projectId) {
      entries.push({
        key: "project",
        value: { id: projectId, name: selectProjectName(state) ?? null },
        label: "Active project",
      });
    }

    const taskId = selectTaskId(state);
    if (taskId) {
      entries.push({
        key: "task",
        value: { id: taskId, name: selectTaskName(state) ?? null },
        label: "Active task",
      });
    }

    const scopeSelections = selectScopeSelectionsContext(state);
    const activeScopes: Record<string, string> = {};
    for (const [k, v] of Object.entries(scopeSelections)) {
      if (v) activeScopes[k] = v;
    }
    if (Object.keys(activeScopes).length > 0) {
      entries.push({
        key: "active_scopes",
        value: activeScopes,
        label: "Active scope selections (by scope_type_id)",
      });
    }

    dispatch(setContextEntries({ conversationId, entries }));
  };

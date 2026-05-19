/**
 * `nextjs-surface` capability provider.
 *
 * Active for every authenticated user on any Next.js surface (chat, agent
 * build, agent run, agent app). Returns a `NextjsSurfaceState` orchestration
 * envelope that aidream stashes on `AppContext.metadata` for downstream
 * discovery handlers to filter UI-first tool injection.
 *
 * The aidream backend registers the matching `NextjsSurfacePayload` /
 * `NEXTJS_SURFACE` capability in `aidream/api/client_capabilities.py`. The
 * two shapes must stay in sync — payload mismatches surface as a 422.
 *
 * Self-registers on import. Imported once from
 * `features/agents/redux/execution-system/client-capabilities/register-all.ts`,
 * which is in turn imported from `app/DeferredSingletons.tsx` for the side
 * effect.
 */

import {
  selectIsSuperAdmin,
  selectIsAdmin,
  selectAdminLevel,
} from "@/lib/redux/selectors/userSelectors";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { registerClientCapability } from "@/features/agents/redux/execution-system/client-capabilities/registry";
import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import type { NextjsSurfaceState } from "@/features/agents/types/tool-injection.types";

function detectTheme(): "light" | "dark" | "system" {
  if (typeof document === "undefined") return "system";
  const cls = document.documentElement.classList;
  if (cls.contains("dark")) return "dark";
  if (cls.contains("light")) return "light";
  return "system";
}

function detectRoute(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname || null;
}

function classifyRouteKind(pathname: string | null): string | null {
  if (!pathname) return null;
  // Strip the (authenticated) group prefix.
  const stripped = pathname.replace(/^\/?\(authenticated\)/, "");
  if (stripped.startsWith("/chat")) return "chat";
  if (stripped.startsWith("/agent")) return "agents";
  if (stripped.startsWith("/agents")) return "agents";
  if (stripped.startsWith("/tasks")) return "tasks";
  if (stripped.startsWith("/projects")) return "projects";
  if (stripped.startsWith("/dashboard")) return "dashboard";
  if (stripped.startsWith("/settings")) return "settings";
  if (stripped.startsWith("/administration")) return "admin";
  if (stripped.startsWith("/code")) return "code";
  if (stripped.startsWith("/notes")) return "notes";
  if (stripped.startsWith("/transcripts")) return "transcripts";
  if (stripped.startsWith("/scope") || stripped.startsWith("/scopes"))
    return "scopes";
  if (stripped === "/" || stripped === "") return "home";
  return "other";
}

registerClientCapability({
  name: "nextjs-surface",
  selectPayload: (state, conversationId): NextjsSurfaceState | null => {
    // Authentication is required — the seven UI-first tools all hit RLS-gated
    // tables. If there's no user, the capability stays out of the envelope
    // entirely so aidream doesn't register a tool set that would just fail.
    if (!state.userAuth?.id) return null;

    // The orchestration payload's ``surface`` field used to be the bare
    // bridge label (always "chat"). Now it carries the canonical
    // ``ui_surface.name`` (matrx-user/chat, matrx-user/agent-builder, …)
    // matching what ``client.surface`` ships at the envelope level — so
    // downstream tools / variables reading the payload don't have to
    // reconcile two surface concepts.
    const route = detectRoute();
    const route_kind = classifyRouteKind(route);
    const surface = surfaceFromPathname(route) ?? "matrx-user/chat";

    const orgId = selectOrganizationId(state);
    const projectId = selectProjectId(state);
    const taskId = selectTaskId(state);
    const scopeSelections = selectScopeSelectionsContext(state);
    const active_scopes: Record<string, string> = {};
    for (const [scopeType, scopeId] of Object.entries(scopeSelections)) {
      if (scopeId) active_scopes[scopeType] = scopeId;
    }

    // The matrx-extend bridge isn't wired into the chat surface yet
    // (see docs/MATRX_EXTEND_CONNECTION.md, Phase 2). Always 'absent' until
    // Phase 2 lands.
    const extension_bridge = "absent" as const;

    return {
      surface,
      route,
      route_kind,
      is_admin: selectIsAdmin(state) ?? false,
      admin_level: selectAdminLevel(state) ?? null,
      // Default permission mode is 'act' for the desktop app — the inline
      // ask UX gives the user fine-grained control without a global toggle.
      permission_mode: "act",
      theme: detectTheme(),
      organization_id: orgId,
      project_id: projectId,
      task_id: taskId,
      active_scopes,
      extension_bridge,
      // Server-side persistence not in scope for v1 — empty list.
      loaded_categories: [],
    };
  },
});

// Tag the conversationId so a linter can't strip the import as unused.
// (The above call is the actual side effect — but TypeScript needs the file
// to do something exportable for some bundler setups.)
export const NEXTJS_SURFACE_CAPABILITY_NAME = "nextjs-surface";

/**
 * `nextjs-surface` capability provider.
 *
 * Always active for authenticated users on any Next.js surface (chat, agent
 * build, agent run, agent app). Returns a `NextjsSurfaceState` orchestration
 * envelope that the aidream `load_nextjs_tools` discovery handler reads to
 * decide which UI-first tools to register.
 *
 * Self-registers on import. Imported once from
 * `features/agents/ui-first-tools/capability/register.ts`, which is in turn
 * imported from `app/DeferredSingletons.tsx` for the side effect.
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

/**
 * Toggle: keep the capability OUT of the wire envelope until aidream
 * registers `nextjs-surface` as a known capability. Until that lands,
 * declaring it would 422 the whole request. The seven UI-first tools
 * still ship via `build-tool-injection.ts` (gated on `state.userAuth?.id`,
 * not on this capability). The ambient context still rides through
 * `buildAmbientContext` (first-turn-only) into the `context` payload. The ONLY thing
 * disabling this loses is the orchestration envelope at
 * `client.state['nextjs-surface']` — which we don't need today.
 *
 * To re-enable after aidream adds the handler: flip this to true.
 */
const ENABLE_NEXTJS_SURFACE_CAPABILITY = false;

registerClientCapability({
  name: "nextjs-surface",
  selectPayload: (state, conversationId): NextjsSurfaceState | null => {
    if (!ENABLE_NEXTJS_SURFACE_CAPABILITY) return null;
    // Authentication is required — the seven UI-first tools all hit RLS-gated
    // tables. If there's no user, the capability stays out of the envelope
    // entirely so aidream doesn't register a tool set that would just fail.
    if (!state.userAuth?.id) return null;

    // Bridge surface label preference: instanceUIState if present, else
    // fall back to a generic "chat" label. The exact source feature already
    // rides on `request.source_feature` anyway, so this is for orchestration.
    const surface = "chat";

    const route = detectRoute();
    const route_kind = classifyRouteKind(route);

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

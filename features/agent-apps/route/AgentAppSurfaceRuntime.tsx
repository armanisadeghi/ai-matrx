"use client";

/**
 * AgentAppSurfaceRuntime — registers the `matrx-user/agent-apps` surface for
 * the per-app workspace (`/agent-apps/[id]/**`). Mounted in the [id] layout so
 * every sub-route (overview / run / code / settings / versions / v/[version])
 * emits the same live scope.
 *
 * The scope is built at Run time from the Redux agent-app slice (hydrated by
 * `AgentAppHydratorServer`) — never from a stale render snapshot. When the
 * hydrator hasn't landed yet, the app-specific keys are simply absent, which
 * is exactly what the manifest declares (nothing on this surface is
 * `alwaysAvailable`).
 *
 * It also wires the surface's two ENTITY write targets (`app_category`,
 * `app_tags`) for EVERY sub-route. Those persist straight through
 * `saveAppField` and need no editor, so scoping them to the Settings tab
 * would have been an artifact of where the pickers happen to be rendered.
 * The three DRAFT targets stay registered in `AgentAppSettingsContent`, which
 * owns the inputs they stage into — a draft with nowhere to land is a write
 * that goes nowhere. When Settings is open its own registration shadows this
 * one for the entity pair, so the write goes through the same `saveField`
 * wrapper the user's own picker clicks use.
 */

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectActiveApp } from "@/features/agents/redux/agent-apps/selectors";
import { saveAppField } from "@/features/agents/redux/agent-apps/thunks";
import {
  AGENT_APPS_SURFACE_NAME,
  createAgentAppsScope,
} from "@/features/surfaces/manifests/agent-apps.manifest";
import { buildAgentAppEntityWriteHandlers } from "./agent-app-entity-writes";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

type ActiveView =
  | "overview"
  | "run"
  | "code"
  | "settings"
  | "versions"
  | "version_detail";

/** `/agent-apps/<id>[/<sub>]` → which workspace UI is open. */
function viewFromPathname(pathname: string | null): ActiveView | undefined {
  if (!pathname) return undefined;
  const segments = pathname.split("/").filter(Boolean);
  // ["agent-apps", "<id>", ...rest]
  if (segments[0] !== "agent-apps" || segments.length < 2) return undefined;
  const sub = segments[2];
  if (!sub) return "overview";
  if (sub === "run" || sub === "code" || sub === "settings" || sub === "versions")
    return sub;
  if (sub === "v") return "version_detail";
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asObjectArray(
  value: unknown,
): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : undefined;
}

export function AgentAppSurfaceRuntime({ children }: { children: ReactNode }) {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Entity write targets, live on every sub-route. The app is read from the
  // live store at CALL time (same rule as the scope), and the value persists
  // through the canonical `saveAppField` thunk with `.unwrap()` so a failed
  // save REJECTS — the writeback seam must hear about it rather than report a
  // success that never happened. Fresh closures per call (the
  // `getWriteHandlers` contract).
  const getSurfaceWriteHandlers = () =>
    buildAgentAppEntityWriteHandlers({
      getApp: () => selectActiveApp(store.getState()),
      persist: async (appId, field, value) => {
        await dispatch(
          saveAppField({
            appId,
            field,
            value: value as Parameters<typeof saveAppField>[0]["value"],
          }),
        ).unwrap();
      },
    });

  const getScope = () => {
    const app = selectActiveApp(store.getState());
    const active_view = viewFromPathname(pathnameRef.current);
    if (!app) {
      return createAgentAppsScope({ active_view });
    }
    return createAgentAppsScope({
      app_id: app.id,
      app_slug: app.slug,
      app_name: app.name,
      app_tagline: app.tagline ?? undefined,
      app_description: app.description ?? undefined,
      app_status: app.status,
      app_category: app.category ?? undefined,
      app_tags: app.tags,
      app_visibility: app.visibility,
      agent_id: app.agent_id,
      app_version: app.version,
      pinned_version: app.pinned_version ?? undefined,
      use_latest: app.use_latest,
      app_summary: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        tagline: app.tagline,
        status: app.status,
        category: app.category,
        tags: app.tags,
        visibility: app.visibility,
        agent_id: app.agent_id,
        version: app.version,
        pinned_version: app.pinned_version,
        use_latest: app.use_latest,
      },
      shell_kind: app.shell_kind,
      component_language: app.component_language,
      component_code: app.component_code || undefined,
      variable_schema: asObjectArray(app.variable_schema),
      shell_config: asObject(app.shell_config),
      slot_overrides: asObject(app.slot_overrides),
      active_view,
      usage_stats: {
        total_executions: app.total_executions,
        total_tokens_used: app.total_tokens_used,
        total_cost: app.total_cost,
        unique_users_count: app.unique_users_count,
        success_rate: app.success_rate,
        avg_execution_time_ms: app.avg_execution_time_ms,
        last_execution_at: app.last_execution_at,
      },
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_APPS_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

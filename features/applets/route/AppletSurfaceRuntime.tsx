"use client";

/**
 * AppletSurfaceRuntime — registers the `matrx-user/agent-apps` surface for
 * the per-app workspace (`/applets/manage/[id]/**`). Mounted in the [id] layout so
 * every sub-route (overview / run / code / settings / versions / v/[version])
 * emits the same live scope.
 *
 * The scope is built at Run time from the Redux applet slice (hydrated by
 * `AppletHydratorServer`) — never from a stale render snapshot. When the
 * hydrator hasn't landed yet, the app-specific keys are simply absent, which
 * is exactly what the manifest declares (nothing on this surface is
 * `alwaysAvailable`).
 *
 * It also wires the surface's two ENTITY write targets (`app_category`,
 * `app_tags`) for EVERY sub-route. Those persist straight through
 * `saveAppField` and need no editor, so scoping them to the Settings tab
 * would have been an artifact of where the pickers happen to be rendered.
 * The three DRAFT targets stay registered in `AppletSettingsContent`, which
 * owns the inputs they stage into — a draft with nowhere to land is a write
 * that goes nowhere. When Settings is open its own registration shadows this
 * one for the entity pair, so the write goes through the same `saveField`
 * wrapper the user's own picker clicks use.
 */

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectActiveApp } from "@/features/agents/redux/applets/selectors";
import { saveAppField } from "@/features/agents/redux/applets/thunks";
import {
  APPLETS_SURFACE_NAME,
  createAppletsScope,
} from "@/features/surfaces/manifests/applets.manifest";
import { buildAppletEntityWriteHandlers } from "./applet-entity-writes";
import { buildAppletBundle } from "./applet-context";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { appletFiles, appletJobs, appletPages, appletSources } from "@/features/applets/types";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import type { RootState } from "@/lib/redux/store";
import { publishedToWebLabel } from "@/lib/row-access";
import { appletState } from "@/features/applets/lib/applet-state";

type ActiveView =
  | "overview"
  | "run"
  | "code"
  | "settings"
  | "versions"
  | "version_detail";

/** `/applets/manage/<id>[/<sub>]` → which workspace UI is open. */
function viewFromPathname(pathname: string | null): ActiveView | undefined {
  if (!pathname) return undefined;
  const segments = pathname.split("/").filter(Boolean);
  // ["applets", "manage", "<id>", ...rest]
  if (segments[0] !== "applets" || segments[1] !== "manage" || segments.length < 3) return undefined;
  const sub = segments[3];
  if (!sub) return "overview";
  if (sub === "run" || sub === "code" || sub === "settings" || sub === "versions")
    return sub;
  if (sub === "v") return "version_detail";
  return undefined;
}

/**
 * The workspace scope from live state — one pure builder shared by the
 * provider and the run page's right-click menu, so both say the same thing.
 */
export function buildAppletsWorkspaceScope(
  state: RootState,
  pathname: string | null,
): SurfaceScopePayload {
  const app = selectActiveApp(state);
  const active_view = viewFromPathname(pathname);
  if (!app) {
    return createAppletsScope({ active_view });
  }
  // The Applet's own runs live on its own surface (`applets/<id>`), never on this editor's scope.
  return createAppletsScope({
    app_bundle: buildAppletBundle(app, active_view),
    app_id: app.id,
    app_slug: app.slug,
    app_name: app.name,
    app_tagline: app.tagline ?? undefined,
    app_description: app.description ?? undefined,
    app_status: appletState(app).kind,
    app_category: app.category ?? undefined,
    app_tags: app.tags,
    // Surface key keeps its manifest name; the value is the row word.
    app_visibility: publishedToWebLabel(app.published_to_web),
    app_version: app.content_version,
    app_summary: {
      id: app.id,
      slug: app.slug,
      name: app.name,
      tagline: app.tagline,
      status: appletState(app).kind,
      category: app.category,
      tags: app.tags,
      published_to_web: app.published_to_web,
      version: app.content_version,
    },
    app_entry: app.entry ?? undefined,
    app_pages: appletPages(app).map((p) => ({ ...p })),
    app_jobs: appletJobs(app).map((j) => ({ ...j })),
    app_sources: appletSources(app).map((s) => ({ ...s })),
    app_files: appletFiles(app),
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
}

export function AppletSurfaceRuntime({ children }: { children: ReactNode }) {
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
    buildAppletEntityWriteHandlers({
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

  // Disclosure only (agent-disclosure law): the Applet's own jobs are named in the top Agents menu on
  // every page of its editor — never as page content.
  const activeApp = useAppSelector(selectActiveApp);
  useDeclaredSurfaceMandates(
    activeApp
      ? appletJobs(activeApp).map((job) => ({
          mandateKey: storedMandateKey(job.key),
          does: `Runs "${job.alias}" in ${activeApp.name}.`,
          surfaceName: APPLETS_SURFACE_NAME,
        }))
      : [],
  );

  const getScope = () =>
    buildAppletsWorkspaceScope(store.getState(), pathnameRef.current);

  return (
    <SurfaceRuntimeProvider
      surfaceName={APPLETS_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

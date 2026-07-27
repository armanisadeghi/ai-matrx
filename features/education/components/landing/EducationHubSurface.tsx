"use client";

// features/education/components/landing/EducationHubSurface.tsx
//
// The Education Hub's surface emitter (`matrx-user/education`). A render-free
// client island: it mounts <SurfaceRuntimeProvider> so the AppShell Agents
// chrome can build a live ApplicationScope for this route, and renders nothing.
//
// It exists as its own component because `EducationHub` is a SERVER component
// (100% SSR for SEO) and SurfaceRuntimeProvider registers from an effect.
//
// Scope is assembled at TRIGGER time, never on mount:
//   • the discovery registries (EDU_AXES / EDU_TOOLS) are static imports;
//   • the learner's Study-today snapshot is read from the module store that
//     StudyTodayCard — the component that already loads it — publishes into,
//     so the hub never fetches the study spine twice.

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationScope,
  type EducationAxisSummary,
  type EducationToolSummary,
} from "@/features/surfaces/manifests/education.manifest";
import { getStudyTodaySnapshot } from "../../study/dashboard/studyTodaySnapshot";
import { EDU_TOOLS } from "../../data/tools";
import { EDU_AXES, EDU_BASE, EDU_WORKSPACE_HREF, eduHref } from "../../constants";

const SURFACE_NAME = "matrx-user/education";

function buildAxes(): EducationAxisSummary[] {
  return EDU_AXES.map((axis) => ({
    id: axis.id,
    label: axis.label,
    segment: axis.segment,
    blurb: axis.blurb,
    href: eduHref(axis.segment),
  }));
}

/**
 * Same ordering the hub renders (live first, featured leading) so the agent
 * sees the tools in the order the learner sees them.
 */
function buildTools(): EducationToolSummary[] {
  return [...EDU_TOOLS]
    .sort((a, b) => {
      const rank = (s: (typeof EDU_TOOLS)[number]["status"]) =>
        s === "live" ? 0 : 1;
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    })
    .map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      tagline: tool.tagline,
      status: tool.status,
      access_tier: tool.accessTier,
      featured: !!tool.featured,
      href: eduHref(tool.slug),
    }));
}

export function EducationHubSurface() {
  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={() => {
        const tools = buildTools();
        const snapshot = getStudyTodaySnapshot();
        return createEducationScope({
          study_snapshot_available: snapshot !== null,
          discovery_axes: buildAxes(),
          study_tools: tools,
          live_tool_slugs: tools
            .filter((t) => t.status === "live")
            .map((t) => t.slug),
          entry_points: {
            hub: EDU_BASE,
            create_kit: eduHref("start"),
            library: eduHref("library"),
            learn: eduHref("learn"),
            planner: eduHref("planner"),
            progress: eduHref("progress"),
            workspace: EDU_WORKSPACE_HREF,
          },
          ...(snapshot
            ? {
                has_active_plan: snapshot.has_active_plan,
                is_rest_day: snapshot.is_rest_day,
                study_streak_days: snapshot.streak_days,
                next_actions: snapshot.next_actions,
                next_actions_total_minutes: snapshot.total_minutes,
                study_snapshot: snapshot,
              }
            : {}),
        });
      }}
    >
      {null}
    </SurfaceRuntimeProvider>
  );
}

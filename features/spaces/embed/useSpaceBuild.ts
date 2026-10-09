"use client";

// features/spaces/embed/useSpaceBuild.ts — THE door other features use to run Build with AI (mandate
// `spaces.build`, Space Builder) without reaching into Spaces internals. Same run as the Spaces sidebar's
// "Build with AI": it floats in the platform's LiveRunWindow (1–8 minutes, never a spinner), runs in the
// organization you pass (where new Spaces and tables are made), and resolves with what was built.
//
//   const { build, isRunning } = useSpaceBuild();
//   const r = await build({ request: "an agency OS with clients, a dashboard and a 90-day plan", organizationId });
//   router.push(r.url!)   // r = { summary, rootSpaceId, url, spaceIds, tableIds }
//
// Throws with a readable message when the run fails or returns no result. A change to an existing page is
// the Spaces page's own "Ask AI to change this page" door, not this one.

import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";

import { BUILD_KEY } from "../ai/spaces-ai";
import { buildRequest, readBuildResult } from "../ai/SpaceBuilder";

export interface SpaceBuildOutcome {
  summary: string;
  rootSpaceId: string | null;
  /** `/spaces/<rootSpaceId>`, or null when the run named no root page. */
  url: string | null;
  spaceIds: string[];
  tableIds: string[];
}

/** Builds take 1–8 minutes; the wait outlasts the slowest one. */
const RUN_TIMEOUT_MS = 12 * 60_000;

export function useSpaceBuild() {
  const { run, isRunning } = useFloatingAgentRun({ instanceId: "spaces-build-external" });

  const build = async (args: { request: string; organizationId: string; label?: string }): Promise<SpaceBuildOutcome> => {
    const words = args.request.trim();
    if (!words) throw new Error("Say what to build");
    if (!BUILD_KEY) throw new Error("Build with AI is not available here");
    const r = await run({
      mandateKey: BUILD_KEY,
      ...buildRequest(words, null),
      label: args.label ?? "Building your Space",
      organizationId: args.organizationId,
      expect: "json",
      initiation: "user",
      surfaceName: null,
      sourceFeature: "documents",
      surfaceKey: "spaces-page",
      timeoutMs: RUN_TIMEOUT_MS,
      coerce: readBuildResult,
    });
    return {
      summary: r.summary,
      rootSpaceId: r.root_space_id,
      url: r.root_space_id ? `/spaces/${r.root_space_id}` : null,
      spaceIds: r.space_ids,
      tableIds: r.table_ids,
    };
  };

  return { build, isRunning, available: Boolean(BUILD_KEY) };
}

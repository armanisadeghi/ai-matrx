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
// Throws with a readable message when the run fails or returns no result.
//
// A reload or a paused tab must never start a SECOND build. `build` hands the run's conversation id to
// `onConversationCreated` the moment it exists; keep it, and after a reload call `reattach(conversationId)`:
// it returns the same outcome when the run is done, or follows the run still in progress in the same
// LiveRunWindow — never a new run. If the run's own result cannot be read again, the root page is found
// through the conversation stamped on it (`content.space_by_conversation`). A change to an existing page is
// the Spaces page's own "Ask AI to change this page" door, not this one.

import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";

import { rootPageForConversation } from "./space-by-conversation";
import { BUILD_KEY } from "../ai/spaces-ai";
import { buildRequest, readBuildResult, type SpaceBuildResult } from "../ai/SpaceBuilder";

export interface SpaceBuildOutcome {
  summary: string;
  rootSpaceId: string | null;
  /** `/spaces/<rootSpaceId>`, or null when the run named no root page. */
  url: string | null;
  spaceIds: string[];
  tableIds: string[];
}

/** A refusal written for a person (the box shows its message as-is); every other error is said plainly by the caller. */
export class SpaceBuildRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceBuildRefused";
  }
}

/** Builds take 1–8 minutes; the wait outlasts the slowest one. */
const RUN_TIMEOUT_MS = 12 * 60_000;

function outcomeOf(r: SpaceBuildResult): SpaceBuildOutcome {
  return {
    summary: r.summary,
    rootSpaceId: r.root_space_id,
    url: r.root_space_id ? `/spaces/${r.root_space_id}` : null,
    spaceIds: r.space_ids,
    tableIds: r.table_ids,
  };
}

/** The lookup half of `reattach`: the root page the conversation made, as an outcome (no summary survives). */
async function fromStamp(conversationId: string): Promise<SpaceBuildOutcome | null> {
  const page = await rootPageForConversation(conversationId);
  return page ? { summary: "", rootSpaceId: page.spaceId, url: `/spaces/${page.spaceId}`, spaceIds: [page.spaceId], tableIds: [] } : null;
}

export function useSpaceBuild() {
  const { run, reattach: reattachRun, isRunning } = useFloatingAgentRun({ instanceId: "spaces-build-external" });

  const build = async (args: {
    request: string;
    organizationId: string;
    label?: string;
    /** Fires as soon as the run's conversation exists — keep the id so a reload can `reattach` to it. */
    onConversationCreated?: (conversationId: string) => void;
  }): Promise<SpaceBuildOutcome> => {
    const words = args.request.trim();
    if (!words) throw new SpaceBuildRefused("Say what to build");
    if (!BUILD_KEY) throw new SpaceBuildRefused("Build with AI is not available here");
    const r = await run({
      mandateKey: BUILD_KEY,
      ...buildRequest(words, null),
      label: args.label ?? "Building your Space",
      organizationId: args.organizationId,
      ...(args.onConversationCreated ? { onConversationCreated: args.onConversationCreated } : {}),
      expect: "json",
      initiation: "user",
      surfaceName: null,
      sourceFeature: "documents",
      surfaceKey: "spaces-page",
      timeoutMs: RUN_TIMEOUT_MS,
      coerce: readBuildResult,
    });
    return outcomeOf(r);
  };

  const reattach = async (conversationId: string, args: { label?: string } = {}): Promise<SpaceBuildOutcome> => {
    if (!BUILD_KEY) throw new Error("Build with AI is not available here");
    try {
      // The conversation's own result first: finished = its last message, still running = followed to the end.
      const r = await reattachRun(conversationId, {
        label: args.label ?? "Building your Space",
        surfaceKey: "spaces-page",
        expect: "json",
        timeoutMs: RUN_TIMEOUT_MS,
        coerce: readBuildResult,
      });
      if (r.root_space_id) return outcomeOf(r);
      return (await fromStamp(conversationId)) ?? outcomeOf(r);
    } catch (err) {
      // The result could not be read again: the page stamped with this conversation is still the answer.
      const found = await fromStamp(conversationId).catch(() => null);
      if (found) return found;
      throw err;
    }
  };

  return { build, reattach, isRunning, available: Boolean(BUILD_KEY) };
}

"use client";

/**
 * useLiveWorkingDocPatch — the working-document drawer's window into the SAME
 * live agent edit the inline tool-call message animates. It reads the current
 * request's `ctx_patch` tool lifecycle straight from Redux and derives a
 * `before → after` diff frame (via the shared `deriveWorkingDocDiffFrame`) that
 * streams token-by-token while the agent writes and reconciles to the server's
 * authoritative content once the turn settles.
 *
 * This is the fix for the drawer's stale/empty diff: instead of the old fuzzy
 * "seen snapshot" heuristic (which only reacted AFTER the DB re-read and cleared
 * itself the moment the view opened), the drawer now consumes the exact same
 * source of truth as `PatchDiffInline` — the tool arguments that arrive whole at
 * `tool_started`.
 *
 * A turn can issue several patches; we fold them all so the drawer reads as one
 * cumulative "what the agent changed this turn" diff. The BEFORE is frozen the
 * instant the first patch of the current request appears (a ref keyed by
 * requestId, so each new turn re-freezes and the post-write re-read can't
 * clobber it) — mirroring `PatchDiffInline`'s lazy-`useState` freeze, adapted
 * for a long-lived (always-mounted) drawer.
 */

import { useEffect, useMemo, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectPrimaryRequest,
  selectToolLifecycleMap,
  selectToolCallIdsInOrder,
  selectIsLatestToolActivity,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { PATCH_TOOLS } from "@/features/tool-call-visualization/registry/toolArtifact";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";
import { isTerminal } from "@/features/tool-call-visualization/renderers/_shared";
import type { WorkingDocPatchArgs } from "@/features/tool-call-visualization/renderers/working-document/applyWorkingDocPatch";

import { selectWorkingDocContent } from "./instance-working-document.selectors";
import {
  deriveWorkingDocDiffFrame,
  type WorkingDocDiffFrame,
} from "./workingDocPatchDiff";

export interface LiveWorkingDocPatch extends WorkingDocDiffFrame {
  /** True when the current request has at least one working-document patch. */
  hasPatch: boolean;
  /** Whether to animate the reveal (live) vs render the final diff at once. */
  animate: boolean;
  /** The callId of the latest patch — a stable replay key + dismissal marker. */
  latestCallId: string | null;
}

const EMPTY: LiveWorkingDocPatch = {
  hasPatch: false,
  before: "",
  after: null,
  isStructural: false,
  command: null,
  animate: false,
  latestCallId: null,
};

function readPatchArgs(entry: ToolLifecycleEntry): WorkingDocPatchArgs {
  const args = entry.arguments as Record<string, unknown>;
  const str = (key: string): string | null => {
    const v = args?.[key];
    return typeof v === "string" ? v : null;
  };
  return {
    command: str("command"),
    old_str: str("old_str"),
    new_str: str("new_str"),
    separator: str("separator"),
    operations: args?.operations,
  };
}

/** Is this lifecycle entry a working-document patch? */
function isWorkingDocPatch(entry: ToolLifecycleEntry): boolean {
  if (!PATCH_TOOLS.has(entry.toolName)) return false;
  const key = (entry.arguments as Record<string, unknown>)?.key;
  return key === WORKING_DOCUMENT_CONTEXT_KEY;
}

export function useLiveWorkingDocPatch(
  conversationId: string,
): LiveWorkingDocPatch {
  const request = useAppSelector(selectPrimaryRequest(conversationId));
  const requestId = request?.requestId ?? "";

  const lifecycleMap = useAppSelector(selectToolLifecycleMap(requestId));
  const callIdOrder = useAppSelector(selectToolCallIdsInOrder(requestId));
  const serverContent = useAppSelector(selectWorkingDocContent(conversationId));

  // The current request's working-doc patch entries, in stream order.
  const patchEntries = useMemo<ToolLifecycleEntry[]>(() => {
    if (!lifecycleMap) return [];
    const ordered: ToolLifecycleEntry[] = [];
    for (const callId of callIdOrder) {
      const entry = lifecycleMap[callId];
      if (entry && isWorkingDocPatch(entry)) ordered.push(entry);
    }
    return ordered;
  }, [lifecycleMap, callIdOrder]);

  const latestEntry =
    patchEntries.length > 0 ? patchEntries[patchEntries.length - 1] : null;
  const latestCallId = latestEntry?.callId ?? null;

  // Freeze BEFORE the instant this request's first patch appears; re-freeze on a
  // new request. Captured in an effect (not a render-time ref) so the later
  // post-write re-read that mutates `serverContent` can't move it. The updater
  // is a no-op once frozen for the current request, so `serverContent` in the
  // deps never re-captures mid-turn — it only lets the FIRST capture read the
  // live pre-patch value.
  const [frozen, setFrozen] = useState<{
    requestId: string;
    before: string;
  } | null>(null);
  useEffect(() => {
    if (patchEntries.length === 0) return;
    setFrozen((prev) =>
      prev && prev.requestId === requestId
        ? prev
        : { requestId, before: serverContent },
    );
  }, [requestId, patchEntries.length, serverContent]);
  const frozenBefore =
    frozen && frozen.requestId === requestId ? frozen.before : serverContent;

  // Animate while the latest patch is the stream's latest activity OR still
  // running — the exact gating `PatchDiffInline` uses.
  const isLatestActivity = useAppSelector(
    useMemo(
      () =>
        requestId && latestCallId
          ? selectIsLatestToolActivity(requestId, latestCallId)
          : () => false,
      [requestId, latestCallId],
    ),
  );

  return useMemo<LiveWorkingDocPatch>(() => {
    if (patchEntries.length === 0) return EMPTY;

    const allTerminal = patchEntries.every((e) => isTerminal(e));
    const patches = patchEntries.map(readPatchArgs);
    const frame = deriveWorkingDocDiffFrame({
      frozenBefore,
      patches,
      serverContent,
      reconcile: allTerminal,
    });

    return {
      ...frame,
      hasPatch: true,
      animate: !allTerminal || isLatestActivity,
      latestCallId,
    };
  }, [patchEntries, frozenBefore, serverContent, isLatestActivity, latestCallId]);
}

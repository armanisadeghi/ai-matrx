"use client";

/**
 * useCopySlotAgent — the ONE "Copy & Update" implementation for agent slots:
 * fork the EXACT agent record the server runs for a slot into an editable
 * personal copy, best-effort connect it as the caller's override, then open
 * the copy in the builder. Absorbed from research's AgentRoleCard (the proven
 * pattern, incl. its failure decomposition); consumed by SlotOverrideEditor
 * and research's per-topic agents page. Never fork this logic beside a
 * consumer.
 *
 * Fork target semantics:
 * - an existing OVERRIDE agent (the user's own master row) when given;
 * - otherwise a version-PINNED slot runs the pinned version — duplicate the
 *   VERSION, or the user edits a different/corrupted agent;
 * - a FLOATING slot (no pinned version) runs the latest master, so forking
 *   the master IS forking what runs.
 *
 * Failure decomposition: the COPY is the critical step — once the copy
 * exists, the builder opens no matter what; a failed CONNECT must never
 * masquerade as a failed copy (info toast, not error).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  duplicateAgent,
  duplicateAgentVersion,
} from "@/features/agents/redux/agent-definition/thunks";

export interface CopySlotAgentSource {
  /** The caller's current override agent (fork THIS master when set). */
  overrideAgentId?: string | null;
  /** The slot's default master agent id. */
  defaultAgentId: string | null;
  /** The slot's pinned version id — null for floating slots. */
  defaultAgentVersionId: string | null;
}

export interface CopySlotAgentOptions {
  /** Best-effort: connect the copy as the caller's override. May throw —
   * a failed connect downgrades the toast, never the copy. */
  connect?: (newAgentId: string) => void | Promise<void>;
  /** Toast when copy + connect both succeeded. */
  connectedMessage?: string;
  /** Toast when the copy succeeded but the connect failed. */
  copiedOnlyMessage?: string;
}

export function useCopySlotAgent(): {
  copying: boolean;
  /** Returns the new agent id, or null when the copy itself failed. */
  copyAndOpen: (
    source: CopySlotAgentSource,
    options?: CopySlotAgentOptions,
  ) => Promise<string | null>;
} {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [copying, setCopying] = useState(false);

  const copyAndOpen = async (
    source: CopySlotAgentSource,
    options: CopySlotAgentOptions = {},
  ): Promise<string | null> => {
    setCopying(true);
    try {
      // Dispatch inside each branch so each thunk action keeps its own type
      // (a ternary between two different thunks has no single dispatch
      // overload).
      const forkMasterId =
        source.overrideAgentId ??
        (source.defaultAgentVersionId == null ? source.defaultAgentId : null);
      let newId: string;
      if (forkMasterId != null) {
        newId = await dispatch(
          duplicateAgent({ agentId: forkMasterId, asSystem: false }),
        ).unwrap();
      } else if (source.defaultAgentVersionId != null) {
        newId = await dispatch(
          duplicateAgentVersion({
            versionId: source.defaultAgentVersionId,
            asSystem: false,
          }),
        ).unwrap();
      } else {
        toast.error("This step has no default agent to copy.");
        return null;
      }
      // The copy is the critical step — once it exists, open it for editing
      // no matter what. Connecting it is best-effort.
      try {
        await options.connect?.(newId);
        toast.success(
          options.connectedMessage ??
            "Copied — opening your editable version to update.",
        );
      } catch {
        toast.info(
          options.copiedOnlyMessage ??
            "Copied your editable version — connect it to this step later.",
        );
      }
      router.push(`/agents/${newId}/build`);
      return newId;
    } catch (err) {
      // `.unwrap()` re-throws a Redux SerializedError (a plain object with a
      // `.message`), NOT an Error instance — so `instanceof Error` would hide
      // the real cause behind "unknown error". Read `.message` off either shape.
      const message =
        (err as { message?: string } | null)?.message ?? "unknown error";
      toast.error(`Couldn't copy agent: ${message}`);
      return null;
    } finally {
      setCopying(false);
    }
  };

  return { copying, copyAndOpen };
}

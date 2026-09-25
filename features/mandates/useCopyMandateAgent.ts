"use client";

/**
 * useCopyMandateAgent — the ONE "Copy & Update" implementation for mandates:
 * fork the EXACT agent record the server runs for a mandate into an editable
 * personal copy, best-effort connect it as the caller's override, then open
 * the copy in the builder. Absorbed from research's AgentRoleCard (the proven
 * pattern, incl. its failure decomposition); consumed by the mandate workspace
 * and research's per-topic agents page. Never fork this logic beside a
 * consumer.
 *
 * Fork target semantics:
 * - an existing OVERRIDE agent (the user's own master row) when given;
 * - otherwise a version-PINNED mandate runs the pinned version — duplicate the
 *   VERSION, or the user edits a different/corrupted agent;
 * - a FLOATING mandate (no pinned version) runs the latest master, so forking
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
import type { AppDispatch } from "@/lib/redux/store";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
import {
  duplicateAgent,
  duplicateAgentVersion,
} from "@/features/agents/redux/agent-definition/thunks";

export interface CopyMandateAgentSource {
  /** The caller's current override agent (fork THIS master when set). */
  overrideAgentId?: string | null;
  /** The mandate's default master agent id. */
  defaultAgentId: string | null;
  /** The mandate's pinned version id — null for floating mandates. */
  defaultAgentVersionId: string | null;
  /**
   * Where the copy is homed. A PERSONAL copy ("into your account") names the
   * person's own workspace, so it never asks "Which workspace is this for?";
   * an organization's copy names that organization. Omitted = the workspace
   * the person is working in (asked when none is selected).
   */
  organizationId?: string | null;
}

export interface CopyMandateAgentOptions {
  /** Best-effort: connect the copy as the caller's override. May throw —
   * a failed connect downgrades the toast, never the copy. */
  connect?: (newAgentId: string) => void | Promise<void>;
  /** Toast when copy + connect both succeeded. */
  connectedMessage?: string;
  /** Toast when the copy succeeded but the connect failed. */
  copiedOnlyMessage?: string;
}

/** Fork the holder snapshot the mandate runs; binding is owned by the caller. */
export async function duplicateMandateAgent(
  dispatch: AppDispatch,
  source: CopyMandateAgentSource,
): Promise<string> {
  const forkMasterId =
    source.overrideAgentId ??
    (source.defaultAgentVersionId == null ? source.defaultAgentId : null);
  if (forkMasterId != null) {
    return dispatch(
      duplicateAgent({
        agentId: forkMasterId,
        asSystem: false,
        organizationId: source.organizationId ?? undefined,
      }),
    ).unwrap();
  }
  if (source.defaultAgentVersionId != null) {
    return dispatch(
      duplicateAgentVersion({
        versionId: source.defaultAgentVersionId,
        asSystem: false,
        organizationId: source.organizationId ?? undefined,
      }),
    ).unwrap();
  }
  throw new Error("This step has no default agent to copy.");
}

export function useCopyMandateAgent(): {
  copying: boolean;
  /** Returns the new agent id, or null when the copy itself failed. */
  copyAndOpen: (
    source: CopyMandateAgentSource,
    options?: CopyMandateAgentOptions,
  ) => Promise<string | null>;
} {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [copying, setCopying] = useState(false);

  const copyAndOpen = async (
    source: CopyMandateAgentSource,
    options: CopyMandateAgentOptions = {},
  ): Promise<string | null> => {
    setCopying(true);
    try {
      // Dispatch inside each branch so each thunk action keeps its own type
      // (a ternary between two different thunks has no single dispatch
      // overload).
      // "Copy & Update" makes the person's OWN copy — homed in their own
      // workspace, never a question about which organization it is for.
      const newId = await duplicateMandateAgent(dispatch, {
        ...source,
        organizationId: source.organizationId ?? (await resolvePersonalOrgId()),
      });
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
      // agent-link-ok: copying a mandate agent creates a USER copy; the system twin is never the copy
      router.push(`/agents/${newId}/build`);
      return newId;
    } catch (err) {
      // Closing the organization picker is "not now", never a failure.
      if (isOrganizationSelectionCancelled(err)) return null;
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

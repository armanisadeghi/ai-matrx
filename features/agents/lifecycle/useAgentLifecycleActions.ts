"use client";

// features/agents/lifecycle/useAgentLifecycleActions.ts
//
// ARCHIVE AND DELETE, WHERE THE PERSON IS STANDING.
//
// WHY THIS EXISTS. On 2026-09-19 the independent verifier could not delete the throwaway
// agent it had just built: the agent BUILDER has no delete. The capability was never
// missing from the platform — `/agents/all` has had both a working archive toggle and an
// honest soft delete for months (`features/agents/browse/useAgentRowActions.tsx`) — it was
// missing from the one screen you are on when you decide you are done with an agent, and
// nothing on that screen said where to go instead. A person had to know to navigate to a
// list page and find the row again.
//
// SO THE TWO ACTIONS MOVE INTO A HOOK RATHER THAN BEING COPIED. Both surfaces dispatch the
// SAME thunks the list page does — `saveAgentField("isArchived")` and `deleteAgent` — and
// read the SAME confirm copy (`buildAgentDeleteConfirm`), so the honest "this is a soft
// delete an admin can restore" sentence cannot drift between screens and neither can the
// behaviour.
//
// ARCHIVE COMES FIRST AND IS NOT DESTRUCTIVE. The platform's archived-items law is archive
// rather than hard delete, and `agent.definition.is_archived` is exactly that door;
// `deleteAgent` is itself a SOFT delete (it stamps `deleted_at` and destroys nothing).
// Neither action can lose an agent, and the confirm says so in those words.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  deleteAgent,
  saveAgentField,
} from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { buildAgentDeleteConfirm } from "@/features/agents/deletion/agentDeleteConfirm";
import { toast } from "@/lib/toast";

export interface AgentLifecycleActions {
  /** Whether the agent is archived right now (false while it is still loading). */
  isArchived: boolean;
  /** "Archive" or "Unarchive" — the label for the control, never a guess. */
  archiveLabel: string;
  /** Flip the archive flag. Resolves when the write has landed or failed loudly. */
  toggleArchived: () => Promise<void>;
  /** Confirm, soft-delete, then leave the agent's own page. */
  remove: () => Promise<void>;
  /** True while either write is in flight, so a menu can disable both. */
  isBusy: boolean;
}

export function useAgentLifecycleActions(
  agentId: string,
  /** Where to land after a delete — the agent's page no longer has a subject. */
  basePath = "/agents",
): AgentLifecycleActions {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const [isBusy, setIsBusy] = useState(false);

  const isArchived = Boolean(agent?.isArchived);
  const name = agent?.name ?? "";

  const toggleArchived = useCallback(async () => {
    setIsBusy(true);
    try {
      await dispatch(
        saveAgentField({ agentId, field: "isArchived", value: !isArchived as never }),
      ).unwrap();
      toast.success(
        isArchived
          ? `"${name || "Agent"}" is back in your lists`
          : `"${name || "Agent"}" archived — it stays in your archive and can be restored`,
      );
    } catch (err) {
      toast.error(
        isArchived ? "Could not unarchive this agent" : "Could not archive this agent",
        { description: err instanceof Error ? err.message : undefined },
      );
    } finally {
      setIsBusy(false);
    }
  }, [agentId, dispatch, isArchived, name]);

  const remove = useCallback(async () => {
    // The ONE honest confirm for a soft delete — same words every agent surface uses.
    const ok = await confirm(buildAgentDeleteConfirm(name));
    if (!ok) return;
    setIsBusy(true);
    try {
      await dispatch(deleteAgent(agentId)).unwrap();
      toast.success(name ? `Deleted "${name}"` : "Agent deleted");
      // This screen's subject is gone, so it does not stay on it pretending otherwise.
      router.push(basePath);
    } catch (err) {
      toast.error("Could not delete agent", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsBusy(false);
    }
  }, [agentId, basePath, dispatch, name, router]);

  return {
    isArchived,
    archiveLabel: isArchived ? "Unarchive" : "Archive",
    toggleArchived,
    remove,
    isBusy,
  };
}

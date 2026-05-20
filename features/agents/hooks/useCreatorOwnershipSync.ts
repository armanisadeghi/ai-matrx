"use client";

/**
 * useCreatorOwnershipSync — drives the global ownership-authority flag
 * (`creatorDebug.isCreator`, read by `selectIsCreator`).
 *
 * Call it from any surface that loads a specific agent (build / run / chat /
 * apps), passing the agent's id. The flag is set TRUE only when we are CERTAIN
 * the current user owns the agent:
 *   - the agent's DB-computed `isOwner` is explicitly `true`, OR
 *   - the agent is in the current user's owned-agents list.
 * Everything else — `isOwner === false`, `isOwner === null` (not yet fetched),
 * a missing agentId, or unmount — resolves to FALSE. The bias is deliberately
 * toward "not the creator": never light up creator surfaces unless we're sure.
 *
 * The effect's cleanup clears the flag, so navigating away (unmount) or
 * switching to a different agent always resets to false first.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setIsCreator } from "@/lib/redux/preferences/creatorDebugSlice";
import { selectOwnedAgentIds } from "@/lib/redux/slices/agentCacheSlice";
import { selectAgentIsOwner } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentAccessLevel } from "@/features/agents/redux/agent-definition/thunks";

export function useCreatorOwnershipSync(agentId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const ownedIds = useAppSelector(selectOwnedAgentIds);
  const isOwnerFlag = useAppSelector((state) =>
    agentId ? selectAgentIsOwner(state, agentId) : null,
  );

  const knownOwned = !!agentId && ownedIds.includes(agentId);

  // When ownership is unknown — not in the owned list AND isOwner not yet
  // fetched (null) — ask the DB for the authoritative access level so a
  // CERTAIN determination becomes possible. One RPC per agent; once isOwner is
  // known (true/false) the condition is false and it never re-fires. The
  // owned-list and agx_get_access_level paths aren't loaded on every surface
  // (e.g. the chat route), so this is what makes the flag actually resolve.
  useEffect(() => {
    if (agentId && !knownOwned && isOwnerFlag === null) {
      void dispatch(fetchAgentAccessLevel(agentId));
    }
  }, [dispatch, agentId, knownOwned, isOwnerFlag]);

  const isOwner = !!agentId && (isOwnerFlag === true || knownOwned);

  useEffect(() => {
    dispatch(setIsCreator(isOwner));
    return () => {
      dispatch(setIsCreator(false));
    };
  }, [dispatch, isOwner]);
}

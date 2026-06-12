"use client";

import { useState, useRef, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import {
  makeSelectFilteredAgents,
  selectAllAgentCategories,
  selectAllAgentTags,
  selectTotalBuiltinAgentsCount,
  selectTotalOwnedAgentsCount,
  selectTotalSharedAgentsCount,
  selectTotalUserAgentsCount,
} from "@/features/agents/redux/agent-consumers/selectors";
import type { AgentListTabCounts } from "./core/AgentListTabs";
import {
  selectAgentsSliceStatus,
  selectActiveAgentId,
} from "@/features/agents/redux/agent-definition/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { setActiveAgentId } from "@/features/agents/redux/agent-definition/slice";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";

export interface AgentListCoreOptions {
  consumerId: string;
  onSelect?: (agentId: string) => void;
  navigateTo?: string;
}

export function useAgentListCore({
  consumerId,
  onSelect,
  navigateTo,
}: AgentListCoreOptions) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [hasFetched, setHasFetched] = useState(false);
  const [hoveredAgent, setHoveredAgent] =
    useState<AgentDefinitionRecord | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const consumer = useAgentConsumer(consumerId, { unregisterOnUnmount: true });

  const selectFiltered = useMemo(
    () => makeSelectFilteredAgents(consumerId),
    [consumerId],
  );
  const agents = useAppSelector(selectFiltered);
  const sliceStatus = useAppSelector(selectAgentsSliceStatus);
  const activeAgentId = useAppSelector(selectActiveAgentId);
  const allCategories = useAppSelector(selectAllAgentCategories);
  const allTags = useAppSelector(selectAllAgentTags);
  const tabCounts: AgentListTabCounts = {
    mine: useAppSelector(selectTotalOwnedAgentsCount),
    shared: useAppSelector(selectTotalSharedAgentsCount),
    all: useAppSelector(selectTotalUserAgentsCount),
    system: useAppSelector(selectTotalBuiltinAgentsCount),
  };
  const isLoading = sliceStatus === "loading";

  const ensureLoaded = useCallback(() => {
    if (!hasFetched) {
      dispatch(initializeChatAgents());
      setHasFetched(true);
    }
  }, [hasFetched, dispatch]);

  const handleSelectAgent = useCallback(
    (agent: AgentDefinitionRecord) => {
      if (onSelect) {
        onSelect(agent.id);
      } else if (navigateTo) {
        startTransition(() =>
          router.push(navigateTo.replace("{id}", agent.id)),
        );
      } else {
        dispatch(setActiveAgentId(agent.id));
      }
    },
    [onSelect, navigateTo, dispatch, router, startTransition],
  );

  const activeFilterCount =
    (consumer.sortBy !== "updated-desc" ? 1 : 0) +
    (consumer.tab !== "system" && consumer.includedCats.length > 0 ? 1 : 0) +
    (consumer.tab !== "system" && consumer.includedTags.length > 0 ? 1 : 0) +
    (consumer.tab !== "system" && consumer.favFilter !== "all" ? 1 : 0);

  const handleAgentHover = useCallback(
    (agent: AgentDefinitionRecord, panelOpen: boolean) => {
      if (panelOpen) return;
      if (hoverLeaveTimerRef.current) {
        clearTimeout(hoverLeaveTimerRef.current);
        hoverLeaveTimerRef.current = null;
      }
      setHoveredAgent(agent);
    },
    [],
  );

  const handleAgentHoverEnd = useCallback(
    (agent: AgentDefinitionRecord, onClear: () => void) => {
      if (hoveredAgent?.id === agent.id) {
        hoverLeaveTimerRef.current = setTimeout(() => {
          setHoveredAgent(null);
          onClear();
        }, 150);
      }
    },
    [hoveredAgent],
  );

  const handleDetailPanelMouseEnter = useCallback(() => {
    if (hoverLeaveTimerRef.current) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  }, []);

  const handleDetailPanelMouseLeave = useCallback((onClear: () => void) => {
    hoverLeaveTimerRef.current = setTimeout(() => {
      setHoveredAgent(null);
      onClear();
    }, 150);
  }, []);

  return {
    agents,
    isLoading,
    activeAgentId,
    allCategories,
    allTags,
    consumer,
    tabCounts,
    activeFilterCount,
    hoveredAgent,
    setHoveredAgent,
    ensureLoaded,
    handleSelectAgent,
    handleAgentHover,
    handleAgentHoverEnd,
    handleDetailPanelMouseEnter,
    handleDetailPanelMouseLeave,
  };
}

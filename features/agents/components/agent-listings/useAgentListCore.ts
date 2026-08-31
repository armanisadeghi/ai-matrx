"use client";

import {
  useState,
  useRef,
  useMemo,
  useTransition,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { shouldDefaultAgentListToPublicTab } from "@/features/agents/constants/agent-list-labels";
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";
import {
  makeSelectFilteredAgents,
  selectAllAgentCategories,
  selectAllAgentTags,
  selectAllSystemAgentCategories,
  selectAllSystemAgentTags,
  selectTotalBuiltinAgentsCount,
  selectTotalOwnedAgentsCount,
  selectTotalSharedAgentsCount,
  selectTotalUserAgentsCount,
} from "@/features/agents/redux/agent-consumers/selectors";
import type { AgentListTabCounts } from "./core/AgentListTabs";
import {
  selectAgentsSliceStatus,
  selectActiveAgentId,
  selectAgentById,
} from "@/features/agents/redux/agent-definition/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { setActiveAgentId } from "@/features/agents/redux/agent-definition/slice";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";

export interface AgentListCoreOptions {
  consumerId: string;
  onSelect?: (agentId: string) => void;
  navigateTo?: string;
  /** Route-scoped agent id (chat/builder headers). Overrides Redux activeAgentId. */
  activeAgentIdOverride?: string | null;
  /**
   * Tab this surface opens on, applied once on first mount. Admin surfaces
   * that manage system agents pass `"system"`. When omitted the normal
   * user heuristic applies (a user with no agents of their own lands on the
   * public/system catalogue).
   */
  initialTab?: AgentTab;
  /**
   * ADMIN reading of the "All" tab: blend system agents into it instead of
   * keeping them to their own tab. See `makeSelectFilteredAgents`.
   */
  includeSystemInAll?: boolean;
  /**
   * 🚨 THE OWNERSHIP TABS THIS CALL SITE MAY REACH — a HARD restriction, not a
   * default.
   *
   * `AgentListTabs` already hides the buttons this list omits, but hiding a
   * button never emptied the list behind it: the active tab lives in the
   * consumer's REMEMBERED redux state, and `initialTab` is applied exactly once
   * per mount (`defaultTabAppliedRef`). So a person who had been on "Mine" and
   * then moved a control that narrows the picker got the personal catalogue
   * with the tab bar removed — the forbidden list, and no way to see that it
   * was forbidden. That is the defect Arman named on the mandate binding
   * screen's global rung (VISION-RECONCILIATION D2, 2026-08-31: the picker
   * opened on "Mine · 40").
   *
   * Given here, the tab is COERCED into the allowed set on every change of it,
   * not just at mount — so a restriction that arrives later is enforced later.
   * The tab it lands on is `initialTab` when that is itself allowed, otherwise
   * the first allowed tab.
   */
  visibleTabs?: readonly AgentTab[];
  /** Hide records that are invalid for this call site (for example, a seed
   * member cannot also be chosen as an Orchestra conductor). */
  excludeAgentIds?: readonly string[];
}

/**
 * How long the hover-preview detail panel stays open after the cursor leaves
 * an agent row (or the panel itself) before it closes. Generous on purpose:
 * the panel renders to the side of the list, so the user needs ample time to
 * travel the cursor across the gap to reach it without it vanishing. Paired
 * with a reserved, non-resizing popover width so the target never moves.
 */
export const HOVER_GRACE_MS = 900;

/**
 * THE RULE, ALONE AND TESTABLE: which tab a restricted picker must land on.
 *
 * Returns `null` when the current tab is already allowed (nothing to do), and
 * otherwise the tab to switch to — `initialTab` when that is itself allowed,
 * else the first allowed tab. See `AgentListCoreOptions.visibleTabs` for the
 * defect this closes.
 */
export function coerceVisibleTab(
  current: AgentTab,
  allowed: readonly AgentTab[],
  initialTab?: AgentTab,
): AgentTab | null {
  if (allowed.length === 0) return null;
  if (allowed.includes(current)) return null;
  return initialTab && allowed.includes(initialTab) ? initialTab : allowed[0];
}

export function useAgentListCore({
  consumerId,
  onSelect,
  navigateTo,
  activeAgentIdOverride,
  initialTab,
  includeSystemInAll = false,
  visibleTabs,
  excludeAgentIds = [],
}: AgentListCoreOptions) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const hasFetchedRef = useRef(false);
  const [hoveredAgent, setHoveredAgent] =
    useState<AgentDefinitionRecord | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultTabAppliedRef = useRef(false);

  const consumer = useAgentConsumer(consumerId, { unregisterOnUnmount: true });
  const userId = useAppSelector(selectUserId);
  const ownedCount = useAppSelector(selectTotalOwnedAgentsCount);

  const selectFiltered = useMemo(
    () => makeSelectFilteredAgents(consumerId, includeSystemInAll),
    [consumerId, includeSystemInAll],
  );
  const filteredAgents = useAppSelector(selectFiltered);
  const excludedAgentIds = new Set(excludeAgentIds);
  const agents =
    excludedAgentIds.size === 0
      ? filteredAgents
      : filteredAgents.filter((agent) => !excludedAgentIds.has(agent.id));
  const sliceStatus = useAppSelector(selectAgentsSliceStatus);
  const reduxActiveAgentId = useAppSelector(selectActiveAgentId);
  // `null` is an intentional "nothing selected" value for assignment
  // dropdowns. Only an omitted override falls back to the app-wide active
  // agent; otherwise an empty slot would misleadingly show the chat agent.
  const activeAgentId =
    activeAgentIdOverride === undefined
      ? reduxActiveAgentId
      : activeAgentIdOverride;
  const pinnedAgent = useAppSelector((state) =>
    activeAgentId ? selectAgentById(state, activeAgentId) : undefined,
  );
  // Category/tag options follow the ACTIVE TAB's population: user agents on
  // mine/shared/all, builtins on system. Same controls either way.
  const userCategories = useAppSelector(selectAllAgentCategories);
  const userTags = useAppSelector(selectAllAgentTags);
  const systemCategories = useAppSelector(selectAllSystemAgentCategories);
  const systemTags = useAppSelector(selectAllSystemAgentTags);
  const onSystemTab = consumer.tab === "system";
  const allCategories = onSystemTab ? systemCategories : userCategories;
  const allTags = onSystemTab ? systemTags : userTags;
  const tabCounts: AgentListTabCounts = {
    mine: useAppSelector(selectTotalOwnedAgentsCount),
    shared: useAppSelector(selectTotalSharedAgentsCount),
    all: useAppSelector(selectTotalUserAgentsCount),
    system: useAppSelector(selectTotalBuiltinAgentsCount),
  };
  const isLoading = sliceStatus === "loading";
  const agentsLoaded = sliceStatus === "succeeded" || sliceStatus === "failed";

  const ensureLoaded = useCallback(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      dispatch(initializeChatAgents());
    }
  }, [dispatch]);

  useEffect(() => {
    if (defaultTabAppliedRef.current) return;

    // An explicit surface default wins over the heuristic below, but only
    // once — after that the tab belongs to the user.
    if (initialTab) {
      defaultTabAppliedRef.current = true;
      if (consumer.tab !== initialTab) consumer.setTab(initialTab);
      return;
    }

    if (consumer.tab !== "mine") {
      defaultTabAppliedRef.current = true;
      return;
    }

    const wantsPublic = shouldDefaultAgentListToPublicTab({
      userId,
      ownedCount,
      agentsLoaded,
    });

    if (!wantsPublic) {
      if (!userId || agentsLoaded) {
        defaultTabAppliedRef.current = true;
      }
      return;
    }

    consumer.setTab("system");
    defaultTabAppliedRef.current = true;
  }, [
    userId,
    ownedCount,
    agentsLoaded,
    initialTab,
    consumer.tab,
    consumer.setTab,
  ]);

  // 🚨 THE RESTRICTION IS ENFORCED, NOT DECORATED. A hidden tab whose rows are
  // still the ones being listed is worse than an offered one: the person sees a
  // catalogue this call site forbids and no control that explains why. The tab
  // is therefore coerced into the allowed set whenever it falls outside it —
  // including long after mount, when a control elsewhere on the page narrows
  // what this picker may reach. Keyed by the joined list so an inline array
  // literal does not re-fire this every render.
  const allowedTabsKey = visibleTabs ? visibleTabs.join(",") : "";
  useEffect(() => {
    if (!allowedTabsKey) return;
    const next = coerceVisibleTab(
      consumer.tab,
      allowedTabsKey.split(",") as AgentTab[],
      initialTab,
    );
    if (next) consumer.setTab(next);
  }, [allowedTabsKey, initialTab, consumer.tab, consumer.setTab]);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

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
    (consumer.includedCats.length > 0 ? 1 : 0) +
    (consumer.includedTags.length > 0 ? 1 : 0) +
    (consumer.favFilter !== "all" ? 1 : 0);

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
        }, HOVER_GRACE_MS);
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
    }, HOVER_GRACE_MS);
  }, []);

  return {
    agents,
    isLoading,
    activeAgentId,
    pinnedAgent,
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

"use client";

/**
 * agentWorkTurn — turn-level coordination for `AgentWorkGroup`.
 *
 * WHY: the server reserves a new `cx_message` per agentic iteration, so one
 * logical turn (one user prompt → thinking / tools / thinking / tools → answer)
 * renders as SEVERAL adjacent assistant messages, each with its own
 * `EnhancedChatMarkdown` and therefore its own settled-turn fold. Without
 * coordination the transcript shows "Worked for 4s" followed by "Worked for
 * 3s" — two stacked groups where the user should see ONE.
 *
 * `AssistantTurnGroup` (the component that already merges those sub-messages
 * into one seamless block) provides `AgentWorkTurnProvider`; every
 * `AgentWorkGroup` that mounts inside registers itself. The FIRST group in
 * transcript order becomes the turn's single header — "Worked for 7s" with
 * the SUMMED duration/steps of every group in the turn — and all groups share
 * ONE expand state: one click reveals the whole turn's work, in order.
 * Non-primary groups render their children only (no header, no chrome).
 *
 * Outside a provider (other surfaces, single-message renders) `AgentWorkGroup`
 * behaves standalone, exactly as before.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

import {
  getToolCardUserChoice,
  setToolCardUserChoice,
} from "./toolCardUiSession";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { groupCloudBrowserTurnFragments } from "../grouping/groupCloudBrowserRuns";

export interface AgentWorkGroupRegistration {
  /** Unique id for the group (its sessionKey). */
  id: string;
  /** Position of the owning sub-message within the turn. */
  memberIndex: number;
  /** Position of the group within its sub-message. */
  order: number;
  durationMs: number | null;
  stepCount: number;
}

interface CloudBrowserRunRegistration {
  id: string;
  memberIndex: number;
  order: number;
  entries: ToolLifecycleEntry[];
  entryRevision: string;
  breakBefore: boolean;
  breakAfter: boolean;
}

export interface CloudBrowserTurnRun {
  primaryId: string;
  entries: ToolLifecycleEntry[];
  compact: boolean;
}

interface AgentWorkTurnValue {
  register: (info: AgentWorkGroupRegistration) => () => void;
  /** The id of the group that renders the turn's single header. */
  primaryId: string | null;
  /** Summed duration across every registered group (null if none known). */
  totalDurationMs: number | null;
  totalStepCount: number;
  /** Shared expand choice for the whole turn (null = no user choice yet). */
  expandedChoice: boolean | null;
  setExpanded: (open: boolean) => void;
  registerCloudBrowserRun: (info: CloudBrowserRunRegistration) => () => void;
  cloudBrowserRunById: Record<string, CloudBrowserTurnRun>;
}

const AgentWorkTurnContext = createContext<AgentWorkTurnValue | null>(null);
const AgentWorkMemberContext = createContext<number>(0);

export function useAgentWorkTurn(): AgentWorkTurnValue | null {
  return useContext(AgentWorkTurnContext);
}

export function useAgentWorkMemberIndex(): number {
  return useContext(AgentWorkMemberContext);
}

/** Wraps ONE sub-message of a turn, tagging its groups with their position. */
export function AgentWorkMemberScope({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <AgentWorkMemberContext.Provider value={index}>
      {children}
    </AgentWorkMemberContext.Provider>
  );
}

export function AgentWorkTurnProvider({
  turnKey,
  children,
}: {
  /** Stable identity for the turn (anchor messageId) — keys the session-lived
   *  expand memory, so the choice survives remounts. */
  turnKey: string;
  children: React.ReactNode;
}) {
  const [groups, setGroups] = useState<AgentWorkGroupRegistration[]>([]);
  const [browserFragments, setBrowserFragments] = useState<
    CloudBrowserRunRegistration[]
  >([]);

  const register = useCallback((info: AgentWorkGroupRegistration) => {
    setGroups((prev) => [...prev.filter((g) => g.id !== info.id), info]);
    return () => {
      setGroups((prev) => prev.filter((g) => g.id !== info.id));
    };
  }, []);

  const registerCloudBrowserRun = useCallback(
    (info: CloudBrowserRunRegistration) => {
      setBrowserFragments((previous) => [
        ...previous.filter((fragment) => fragment.id !== info.id),
        info,
      ]);
      return () => {
        setBrowserFragments((previous) =>
          previous.filter((fragment) => fragment.id !== info.id),
        );
      };
    },
    [],
  );

  const sessionKey = `agent-work-turn:${turnKey}`;
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(() =>
    getToolCardUserChoice(sessionKey),
  );
  const setExpanded = useCallback(
    (open: boolean) => {
      setToolCardUserChoice(sessionKey, open);
      setExpandedChoice(open);
    },
    [sessionKey],
  );

  const sorted = [...groups].sort(
    (a, b) => a.memberIndex - b.memberIndex || a.order - b.order,
  );
  const primaryId = sorted[0]?.id ?? null;
  const known = sorted.filter((g) => g.durationMs !== null);
  const totalDurationMs =
    known.length > 0
      ? known.reduce((sum, g) => sum + (g.durationMs ?? 0), 0)
      : null;
  const totalStepCount = sorted.reduce((sum, g) => sum + g.stepCount, 0);

  const cloudBrowserRunById: Record<string, CloudBrowserTurnRun> = {};
  const browserGroups = groupCloudBrowserTurnFragments(
    browserFragments.map((fragment) => ({
      ...fragment,
      items: fragment.entries,
    })),
  );
  browserGroups.forEach((browserGroup) => {
    const seenCallIds = new Set<string>();
    const entries = browserGroup.items.filter((entry) => {
      if (seenCallIds.has(entry.callId)) return false;
      seenCallIds.add(entry.callId);
      return true;
    });
    const run = {
      primaryId: browserGroup.primaryId,
      entries,
      compact: browserGroup.compact,
    };
    for (const fragmentId of browserGroup.fragmentIds) {
      cloudBrowserRunById[fragmentId] = run;
    }
  });

  return (
    <AgentWorkTurnContext.Provider
      value={{
        register,
        primaryId,
        totalDurationMs,
        totalStepCount,
        expandedChoice,
        setExpanded,
        registerCloudBrowserRun,
        cloudBrowserRunById,
      }}
    >
      {children}
    </AgentWorkTurnContext.Provider>
  );
}

export function useCloudBrowserTurnRun({
  id,
  order,
  entries,
  entryRevision,
  breakBefore,
  breakAfter,
  enabled,
}: {
  id: string;
  order: number;
  entries: ToolLifecycleEntry[];
  entryRevision: string;
  breakBefore: boolean;
  breakAfter: boolean;
  enabled: boolean;
}): (CloudBrowserTurnRun & { isPrimary: boolean }) | null {
  const turn = useAgentWorkTurn();
  const memberIndex = useAgentWorkMemberIndex();
  const register = turn?.registerCloudBrowserRun;

  useLayoutEffect(() => {
    if (!enabled || !register) return;
    return register({
      id,
      memberIndex,
      order,
      entries,
      entryRevision,
      breakBefore,
      breakAfter,
    });
  }, [
    enabled,
    register,
    id,
    memberIndex,
    order,
    entryRevision,
    breakBefore,
    breakAfter,
    entries,
  ]);

  if (!enabled || !turn) return null;
  const run = turn.cloudBrowserRunById[id];
  if (!run) return { primaryId: id, entries, compact: false, isPrimary: true };
  return { ...run, isPrimary: run.primaryId === id };
}

/**
 * Registration hook for `AgentWorkGroup`. Returns null outside a provider
 * (standalone mode). Inside one, keeps the group registered while mounted.
 */
export function useAgentWorkTurnMembership(
  info: Omit<AgentWorkGroupRegistration, "memberIndex">,
): (AgentWorkTurnValue & { isPrimary: boolean }) | null {
  const turn = useAgentWorkTurn();
  const memberIndex = useAgentWorkMemberIndex();

  const { id, order, durationMs, stepCount } = info;
  const register = turn?.register;
  useLayoutEffect(() => {
    if (!register) return;
    return register({ id, memberIndex, order, durationMs, stepCount });
  }, [register, id, memberIndex, order, durationMs, stepCount]);

  if (!turn) return null;
  // Until the layout-effect pass completes, primaryId may not include this
  // group yet — treat "unknown" as primary so a lone group never flashes
  // headerless.
  return {
    ...turn,
    isPrimary: turn.primaryId === null || turn.primaryId === id,
  };
}

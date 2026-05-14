"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setActiveSection } from "../redux/ui/slice";
import { AGENT_CONNECTIONS_BASE, sectionToHref } from "../routing";
import type { AgentConnectionsSection } from "../types";

interface NavContextValue {
  navigate: (section: AgentConnectionsSection) => void;
}

const AgentConnectionsNavContext = createContext<NavContextValue | null>(null);

interface ProviderProps {
  mode: "route" | "overlay";
  /** Override the base path for "route" mode. Defaults to AGENT_CONNECTIONS_BASE. */
  basePath?: string;
  children: React.ReactNode;
}

/** Provides a single `navigate(section)` callback used by overview cards and
 *  anywhere else inside agent-connections that needs to switch sections.
 *
 *  - `mode="route"` → `router.push(sectionToHref(basePath, section))`
 *  - `mode="overlay"` → `dispatch(setActiveSection(section))`
 *
 *  Both surfaces share the same section components; only this provider
 *  differs, so a single OverviewSection works in both worlds.
 */
export function AgentConnectionsNavProvider({
  mode,
  basePath = AGENT_CONNECTIONS_BASE,
  children,
}: ProviderProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const value = useMemo<NavContextValue>(() => {
    if (mode === "route") {
      return {
        navigate: (section) => router.push(sectionToHref(basePath, section)),
      };
    }
    return {
      navigate: (section) => dispatch(setActiveSection(section)),
    };
  }, [mode, basePath, router, dispatch]);

  return (
    <AgentConnectionsNavContext.Provider value={value}>
      {children}
    </AgentConnectionsNavContext.Provider>
  );
}

/** Read the nearest nav callback. If no provider is mounted above, falls back
 *  to dispatching `setActiveSection` so any direct embed keeps working. */
export function useAgentConnectionsNav(): NavContextValue {
  const ctx = useContext(AgentConnectionsNavContext);
  const dispatch = useAppDispatch();

  return useMemo<NavContextValue>(() => {
    if (ctx) return ctx;
    return {
      navigate: (section) => dispatch(setActiveSection(section)),
    };
  }, [ctx, dispatch]);
}

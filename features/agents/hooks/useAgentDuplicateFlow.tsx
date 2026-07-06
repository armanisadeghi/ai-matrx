"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import {
  AgentDuplicateOutcomeDialog,
  type DuplicateOutcomeState,
} from "@/features/agents/components/shared/AgentDuplicateOutcomeDialog";
import { isAdminSystemAgentsContext } from "@/features/agents/components/shared/agent-route-context";

interface UseAgentDuplicateFlowOptions {
  basePath?: string;
}

/**
 * Shared duplicate flow for agent surfaces (options menu, read-only builder save,
 * floating "create my copy" chip). Returns a trigger + the outcome dialog element.
 */
export function useAgentDuplicateFlow(
  agentId: string,
  options?: UseAgentDuplicateFlowOptions,
) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const basePath = options?.basePath ?? "/agents";
  const agent = useAppSelector((state) => selectAgentById(state, agentId));

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DuplicateOutcomeState>("loading");
  const [newAgentId, setNewAgentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [asSystem, setAsSystem] = useState(false);

  const isAdminContext = isAdminSystemAgentsContext(basePath);
  const isBuiltin = agent?.agentType === "builtin";
  const newAgentName = agent?.name ? `Copy of ${agent.name}` : "";

  const newAgentPath = newAgentId
    ? (() => {
        const sourceSegment = `${basePath}/${agentId}`;
        const suffix =
          pathname && pathname.startsWith(sourceSegment)
            ? pathname.slice(sourceSegment.length)
            : "/build";
        return `${basePath}/${newAgentId}${suffix || "/build"}`;
      })()
    : null;

  const startDuplicate = useCallback(async () => {
    const duplicateAsSystem = isAdminContext && isBuiltin;
    setAsSystem(duplicateAsSystem);
    setNewAgentId(null);
    setErrorMessage("");
    setState("loading");
    setOpen(true);

    try {
      const id = await dispatch(
        duplicateAgent({ agentId, asSystem: duplicateAsSystem }),
      ).unwrap();
      setNewAgentId(id);
      setState("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to duplicate agent.",
      );
      setState("error");
    }
  }, [agentId, dispatch, isAdminContext, isBuiltin]);

  const dialog = (
    <AgentDuplicateOutcomeDialog
      open={open}
      onOpenChange={setOpen}
      state={state}
      newAgentName={newAgentName}
      newAgentPath={newAgentPath}
      errorMessage={errorMessage}
      asSystem={asSystem}
    />
  );

  return {
    startDuplicate,
    dialog,
    isDuplicating: open && state === "loading",
  } as const;
}

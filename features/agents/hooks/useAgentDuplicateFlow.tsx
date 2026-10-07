"use client";

import { useCallback, useState } from "react";
import { usePathname } from "@ai-matrx/chat/host/navigation";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { getBuilderDoor, requireBuilderDoor } from "@ai-matrx/chat/host/builder-door";
import { supabase } from "@ai-matrx/chat/host/db";
import {
  AgentDuplicateOutcomeDialog,
  CURRENT_VERSION_CHOICE,
  type DuplicateOutcomeState,
  type DuplicateVersionOption,
} from "@ai-matrx/chat/agents/components/shared/AgentDuplicateOutcomeDialog";
import { isAdminSystemAgentsContext } from "@ai-matrx/chat/agents/components/shared/agent-route-context";
import { getUserMessage } from "@ai-matrx/agents/matrx";
import { isOrganizationSelectionCancelled } from "@ai-matrx/chat/host/org";

interface UseAgentDuplicateFlowOptions {
  basePath?: string;
  /** Sub-route the copy opens on when the source is not the current page. */
  fallbackSuffix?: string;
}

export interface StartDuplicateOptions {
  /** Copy this saved version (definition_version id). Omitted = the current agent. */
  versionId?: string;
}

/**
 * Shared duplicate flow for agent surfaces (options menu, versions tab,
 * read-only builder save, floating "create my copy" chip). Returns triggers +
 * the one dialog element:
 *   - `startDuplicate()` copies right away (current agent, or `{ versionId }`).
 *   - `openChooser()` first asks which version to copy, defaulting to current.
 */
export function useAgentDuplicateFlow(
  agentId: string,
  options?: UseAgentDuplicateFlowOptions,
) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const basePath = options?.basePath ?? "/agents";
  const fallbackSuffix = options?.fallbackSuffix ?? "/build";
  const agent = useAppSelector((state) => selectAgentById(state, agentId));

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DuplicateOutcomeState>("loading");
  const [newAgentId, setNewAgentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [asSystem, setAsSystem] = useState(false);

  const [versions, setVersions] = useState<DuplicateVersionOption[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(CURRENT_VERSION_CHOICE);

  // The copy's real name (the database picks it — "Name (Copy)", "Name (v3
  // copy)", plus a number when taken); the copy is loaded into state on success.
  const newAgent = useAppSelector((s) =>
    newAgentId ? selectAgentById(s, newAgentId) : undefined,
  );

  const isAdminContext = isAdminSystemAgentsContext(basePath);
  const isBuiltin = agent?.agentType === "builtin";

  const newAgentPath = newAgentId
    ? (() => {
        const sourceSegment = `${basePath}/${agentId}`;
        const here =
          pathname && pathname.startsWith(sourceSegment)
            ? pathname.slice(sourceSegment.length)
            : fallbackSuffix;
        // A copy starts at v1: a source page pinned to a version (/v/3)
        // does not exist on it, so it opens on its default page instead.
        const suffix = /^\/v(\/|$)/.test(here) ? fallbackSuffix : here;
        return `${basePath}/${newAgentId}${suffix || fallbackSuffix}`;
      })()
    : null;

  const startDuplicate = useCallback(
    async (opts?: StartDuplicateOptions) => {
      // From the admin surface a builtin copies into another system agent; on
      // the user surface it is the "fork into my workspace" flow.
      const duplicateAsSystem = isAdminContext && isBuiltin;
      setAsSystem(duplicateAsSystem);
      setNewAgentId(null);
      setErrorMessage("");
      setState("loading");
      setOpen(true);

      try {
        const id = await dispatch(
          requireBuilderDoor().duplicateAgent({
            agentId,
            asSystem: duplicateAsSystem,
            versionId: opts?.versionId,
          }),
        ).unwrap();
        setNewAgentId(id);
        setState("success");
      } catch (err) {
        // Closing the organization picker is "not now", never a failure.
        if (isOrganizationSelectionCancelled(err)) {
          setOpen(false);
          return;
        }
        setErrorMessage(getUserMessage(err));
        setState("error");
      }
    },
    [agentId, dispatch, isAdminContext, isBuiltin],
  );

  const openChooser = useCallback(async () => {
    setSelected(CURRENT_VERSION_CHOICE);
    setNewAgentId(null);
    setErrorMessage("");
    setState("choose");
    setOpen(true);
    setVersionsLoading(true);
    setVersionsError(null);
    const { data, error } = await supabase.rpc("agx_get_version_history", {
      p_agent_id: agentId,
      p_limit: 500,
      p_offset: 0,
    });
    setVersionsLoading(false);
    if (error) {
      setVersions([]);
      setVersionsError(error.message);
      return;
    }
    setVersions(
      (data ?? []).map((row) => ({
        versionId: row.version_id,
        versionNumber: row.version_number,
        changedAt: row.changed_at,
        changeNote: row.change_note ?? null,
      })),
    );
  }, [agentId]);

  const dialog = (
    <AgentDuplicateOutcomeDialog
      open={open}
      onOpenChange={setOpen}
      state={state}
      newAgentName={newAgent?.name ?? ""}
      newAgentPath={newAgentPath}
      errorMessage={errorMessage}
      asSystem={asSystem}
      chooser={{
        currentVersion: agent?.version ?? null,
        versions,
        versionsLoading,
        versionsError,
        selected,
        onSelectedChange: setSelected,
        onConfirm: () =>
          void startDuplicate(
            selected === CURRENT_VERSION_CHOICE ? undefined : { versionId: selected },
          ),
      }}
    />
  );

  return {
    startDuplicate,
    openChooser,
    dialog,
    isDuplicating: open && state === "loading",
    /** False in a host that registered no builder door: nothing offers a duplicate (reported once). */
    available: getBuilderDoor() !== null,
  } as const;
}

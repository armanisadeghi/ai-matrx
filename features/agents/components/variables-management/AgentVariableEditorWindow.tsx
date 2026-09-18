"use client";

/**
 * AgentVariableEditorWindow — the `agentVariableEditorWindow` overlay.
 *
 * Edit-only floating window around AgentVariableEditor. The variable must
 * already exist in Redux when this opens — callers that want to "add" a
 * variable create it via the slice first, then open this window
 * (`useOpenAgentVariableEditorWindow`).
 *
 * It was a blocking Dialog until 2026-09-18. Arman, on the context-item picker
 * inside it: "We have to eliminate this modal from being this awful blocking
 * modal so the user isn't locked in and then offer the ability to create new
 * anywhere we are allowing selection."
 *
 * WHY IT IS A REGISTERED OVERLAY AND NOT PAGE-LOCAL STATE (C1, 2026-09-18):
 * the agent builder swaps to a separate tree below 768px
 * (`AgentBuilderClient` → `AgentBuilderMobile`), which unmounts
 * `AgentVariablesManager` — so "this editor is open" kept in the manager's
 * `useState` died on every phone rotate, and the editor vanished with no
 * notice (the old Dialog died the same way). The open state now lives in the
 * overlay slice, rendered by `OverlayController` at the top of the tree, above
 * any responsive layout switch. One `WindowPanel` owns both presentations
 * (floating on desktop, the registry's `mobilePresentation: "drawer"` below
 * the breakpoint) — never a second hand-rolled Drawer branch.
 *
 * No callbacks cross the overlay boundary: Discard removes the variable
 * through the same slice action the chip's ✕ uses, and a rename re-points the
 * overlay's own data at the new name.
 */

import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/slice";
import { AgentVariableEditor } from "./AgentVariableEditor";

const OVERLAY_ID = "agentVariableEditorWindow" as const;

export interface AgentVariableEditorWindowData {
  agentId: string;
  variableName: string;
  /** True when the variable was just instant-created by the opener. */
  justCreated?: boolean;
}

interface AgentVariableEditorWindowProps {
  isOpen: boolean;
  onClose: () => void;
  data: AgentVariableEditorWindowData;
}

export default function AgentVariableEditorWindow({
  isOpen,
  onClose,
  data,
}: AgentVariableEditorWindowProps) {
  const dispatch = useAppDispatch();
  const { agentId, variableName, justCreated } = data;
  const variables =
    useAppSelector((s) => selectAgentVariableDefinitions(s, agentId)) ?? [];

  // Focus returns to the opener when the editor closes (keyboard and screen-
  // reader users must not be dropped on <body>). The chip that opened it may be
  // a different DOM node by then — the builder swaps trees across the 768px
  // breakpoint — so fall back to finding the chip by the variable it names.
  const openerRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef(variableName);
  useEffect(() => {
    nameRef.current = variableName;
  }, [variableName]);
  useEffect(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    return () => {
      const remembered = openerRef.current;
      const target =
        remembered && remembered.isConnected
          ? remembered
          : document.querySelector<HTMLElement>(
              `button[aria-label^="Edit variable ${CSS.escape(nameRef.current)}"]`,
            );
      // After the window's own teardown, so nothing steals focus back.
      requestAnimationFrame(() => target?.focus());
    };
  }, []);

  if (!isOpen) return null;

  const exists = variables.some((v) => v.name === variableName);
  const existingNames = variables
    .filter((v) => v.name !== variableName)
    .map((v) => v.name);

  const title = justCreated
    ? `New Variable · ${variableName}`
    : `Edit Variable · ${variableName}`;

  const handleDiscard = () => {
    dispatch(
      setAgentVariableDefinitions({
        id: agentId,
        variableDefinitions: variables.filter((v) => v.name !== variableName),
      }),
    );
    onClose();
  };

  const handleRenamed = (newName: string) => {
    // The window's identity is the variable's name — follow the rename.
    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        data: { agentId, variableName: newName, justCreated: false },
      }),
    );
  };

  return (
    <WindowPanel
      id="agent-variable-editor-window"
      overlayId={OVERLAY_ID}
      title={title}
      onClose={onClose}
      width={520}
      height={680}
      minWidth={420}
      minHeight={360}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerRight={
        <div className="flex items-center gap-2">
          {justCreated && exists && (
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          )}
          <Button
            variant={justCreated ? "default" : "outline"}
            size="sm"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {exists ? (
          <AgentVariableEditor
            agentId={agentId}
            variableName={variableName}
            existingNames={existingNames}
            onRenamed={handleRenamed}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            The variable &ldquo;{variableName}&rdquo; no longer exists on this
            agent — it was removed or renamed elsewhere. Close this window and
            pick a variable from the Variables row.
          </p>
        )}
      </div>
    </WindowPanel>
  );
}

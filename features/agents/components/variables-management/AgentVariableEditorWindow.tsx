"use client";

/**
 * @registry-status: inline-window
 * AgentVariableEditorWindow
 *
 * Edit-only floating window around AgentVariableEditor. The variable must
 * already exist in Redux when this opens — callers that want to "add" a
 * variable should create it via the slice first, then open this window.
 *
 * It was a blocking Dialog until 2026-09-18. Arman, on the context-item
 * picker inside it: "We have to eliminate this modal from being this awful
 * blocking modal so the user isn't locked in and then offer the ability to
 * create new anywhere we are allowing selection." A variable editor is a
 * workbench, not a confirmation: while it is open the person may need the
 * scopes page, the context items window, or the agent's other tabs. So on
 * desktop it is a page-local `WindowPanel` (drag / minimize / tray, never a
 * focus trap); on mobile it stays a bottom Drawer.
 *
 * Rendered inline by `AgentVariablesManager` (not a registered overlay): the
 * discard / rename callbacks live in the page's own state. Registering it
 * would need those wrapped in a callback-bus group first (see the
 * ImageUploaderWindow precedent).
 *
 * When `justCreated` is true the footer shows a Discard action (wired via
 * `onDiscard`) to delete the freshly-created entity.
 */

import React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgentVariableEditor } from "./AgentVariableEditor";
import { useIsMobile } from "@/hooks/use-mobile";

export const AGENT_VARIABLE_EDITOR_WINDOW_ID = "agent-variable-editor-window";

interface AgentVariableEditorWindowProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  variableName: string;
  existingNames: string[];
  /** True when the variable was just instant-created by the caller. */
  justCreated?: boolean;
  /** Called when the user clicks the Discard footer button. */
  onDiscard?: () => void;
  /** Called after a successful rename inside the editor. */
  onRenamed?: (newName: string) => void;
}

export function AgentVariableEditorWindow({
  agentId,
  isOpen,
  onClose,
  variableName,
  existingNames,
  justCreated,
  onDiscard,
  onRenamed,
}: AgentVariableEditorWindowProps) {
  const isMobile = useIsMobile();

  const title = justCreated
    ? `New Variable · ${variableName}`
    : `Edit Variable · ${variableName}`;

  const editor = (
    <AgentVariableEditor
      agentId={agentId}
      variableName={variableName}
      existingNames={existingNames}
      onRenamed={onRenamed}
    />
  );

  const footerButtons = (
    <>
      {justCreated && onDiscard && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onDiscard();
            onClose();
          }}
        >
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
    </>
  );

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="px-4 pb-safe max-h-[90dvh]">
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              <span className="sr-only">Variable editor</span>
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="min-w-0 flex-1 overflow-y-auto pb-4">
            {editor}
            <div className="flex justify-end gap-2 pt-4">{footerButtons}</div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <WindowPanel
      id={AGENT_VARIABLE_EDITOR_WINDOW_ID}
      title={title}
      onClose={onClose}
      width={520}
      height={680}
      minWidth={420}
      minHeight={360}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footerRight={<div className="flex items-center gap-2">{footerButtons}</div>}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{editor}</div>
    </WindowPanel>
  );
}

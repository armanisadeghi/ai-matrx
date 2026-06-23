"use client";

/**
 * CreateProjectWindow
 *
 * The draggable WindowPanel chrome around the canonical `ProjectFormCore`.
 * This is the app-wide, overlay-rendered way to create a project from anywhere
 * without leaving the current surface (first consumer: the War Room project
 * picker, which auto-selects the freshly created project via the `onCreated`
 * callback).
 *
 * Open it through the typed opener `useOpenCreateProjectWindow()` — never
 * dispatch `openOverlay` directly. The opener wires the `onCreated` /
 * `onWindowClose` handlers through the callback registry (functions can't
 * travel through Redux).
 */

import React, { useEffect, useRef } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ProjectCreatePanel } from "@/features/projects/components/ProjectCreatePanel";
import type { Project } from "@/features/projects/types";
import {
  emitCreateProjectEvent,
  type CreateProjectWindowData,
} from "./callbacks";

const OVERLAY_ID = "createProjectWindow";
const BASE_WINDOW_ID = "create-project-window";

console.log(
  "[Track New Project] 10b, CreateProjectWindow.tsx — module evaluated (chunk loaded)",
);

export interface CreateProjectWindowProps extends CreateProjectWindowData {
  isOpen: boolean;
  onClose: () => void;
  /** Unique per-open id so several create-project windows can coexist. */
  instanceId: string;
}

export default function CreateProjectWindow({
  isOpen,
  onClose,
  instanceId,
  callbackGroupId,
  initialOrgId,
  initialOrgSlug,
  orgLocked,
  skipRedirect,
}: CreateProjectWindowProps) {
  console.log(
    "[Track New Project] 12, CreateProjectWindow.tsx — component render",
    {
      instanceId,
      isOpen,
    },
  );

  // Track the last project created so the window-close event can report it,
  // and keep a synced ref to the callback group so the unmount cleanup reads a
  // current (not stale-closure) value. callbackGroupId is stable per instance,
  // but syncing in an effect keeps the ref write out of render.
  const lastProjectRef = useRef<Project | null>(null);
  const callbackGroupRef = useRef(callbackGroupId);
  useEffect(() => {
    callbackGroupRef.current = callbackGroupId;
  }, [callbackGroupId]);

  // Emit window-close exactly once, on unmount. The overlay controller
  // unmounts this component when `closeOverlay` flips isOpen → false, so this
  // fires for every close path (X button, Esc, programmatic close).
  useEffect(() => {
    return () => {
      emitCreateProjectEvent(callbackGroupRef.current, {
        type: "window-close",
        windowInstanceId: instanceId,
        lastProject: lastProjectRef.current,
      });
    };
  }, [instanceId]);

  if (!isOpen) return null;

  const windowId = `${BASE_WINDOW_ID}-${instanceId}`;

  const handleSuccess = (project: Project) => {
    lastProjectRef.current = project;
    // handleSuccess runs in an event callback, so closing over the current
    // `callbackGroupId` prop directly is correct here (no ref needed).
    emitCreateProjectEvent(callbackGroupId, {
      type: "created",
      windowInstanceId: instanceId,
      project,
    });
  };

  const handleAiComplete = () => {
    // The AI agent created the project server-side; we have no project object,
    // so just tell consumers to refresh their list.
    emitCreateProjectEvent(callbackGroupId, {
      type: "ai-created",
      windowInstanceId: instanceId,
    });
  };

  console.log(
    "[Track New Project] 13, CreateProjectWindow.tsx — rendering WindowPanel + ProjectCreatePanel",
    { windowId },
  );

  return (
    <WindowPanel
      title="Create Project"
      id={windowId}
      overlayId={OVERLAY_ID}
      minWidth={640}
      minHeight={620}
      width={760}
      height="88vh"
      position="center"
      onClose={onClose}
      bodyClassName="flex-1 min-h-0 overflow-hidden"
    >
      <div className="h-full min-h-0">
        <ProjectCreatePanel
          initialOrgId={initialOrgId ?? null}
          initialOrgSlug={initialOrgSlug ?? null}
          orgLocked={orgLocked ?? false}
          // In an overlay we don't yank the user to a settings route by
          // default — the caller decides. War Room passes skipRedirect.
          skipRedirect={skipRedirect ?? true}
          onSuccess={handleSuccess}
          onAiComplete={handleAiComplete}
          onClose={onClose}
        />
      </div>
    </WindowPanel>
  );
}

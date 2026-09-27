"use client";

/**
 * Opener for the `knowledgeCommandBar` overlay — ⌘K "Search your knowledge".
 *
 * `useOpenKnowledgeCommandBar()` returns an imperative opener. Plain ⌘K (the
 * shell hotkey) passes nothing. A resource picker handing its search step to
 * the bar passes an `attach` target (its composer) and its own `commands`
 * (Upload, URL entry, Voice, Tools…); those functions ride a callback group
 * (`features/overlays/callbacks/knowledgeCommandBar`) and only its id travels
 * through Redux. The overlay owns the group's lifetime, so a transient opener
 * (a popover that closes as the bar takes focus) may unmount while the bar
 * stays open.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createKnowledgeCommandBarCallbackGroup } from "@/features/overlays/callbacks/knowledgeCommandBar";
import type { KnowledgeAttachTarget } from "@/features/knowledge/command-bar/attachTarget";
import type { KnowledgeCommand } from "@/features/knowledge/command-bar/commands";

const OVERLAY_ID = "knowledgeCommandBar" as const;

export interface OpenKnowledgeCommandBarOptions {
  /** Pre-filled search text. */
  initialText?: string;
  /** Receives "Attach to this chat". Omit to use the chat on screen, if any. */
  attach?: KnowledgeAttachTarget;
  /** ↵ on a result: open it (default) or attach it (picker hand-off). */
  primaryAction?: "open" | "attach";
  /** Host commands, listed first in the Commands section. */
  commands?: KnowledgeCommand[];
}

export interface KnowledgeCommandBarOverlayData {
  callbackGroupId: string | null;
  initialText: string | null;
  primaryAction: "open" | "attach";
}

export interface KnowledgeCommandBarHandle {
  close: () => void;
}

export function useOpenKnowledgeCommandBar() {
  const dispatch = useAppDispatch();

  return useCallback(
    (opts: OpenKnowledgeCommandBarOptions = {}): KnowledgeCommandBarHandle => {
      const needsGroup = Boolean(opts.attach || opts.commands?.length);
      const callbackGroupId = needsGroup
        ? createKnowledgeCommandBarCallbackGroup({
            attach: opts.attach,
            commands: opts.commands,
          }).callbackGroupId
        : null;
      const data: KnowledgeCommandBarOverlayData = {
        callbackGroupId,
        initialText: opts.initialText ?? null,
        primaryAction: opts.primaryAction ?? "open",
      };
      dispatch(openOverlay({ overlayId: OVERLAY_ID, data }));
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

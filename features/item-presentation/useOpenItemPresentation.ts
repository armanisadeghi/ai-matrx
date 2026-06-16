"use client";

/**
 * Maps an item-presentation type to its window-panel opener.
 *
 * Openers are React hooks, so this lives in a hook (not the data registry).
 * `getItemConfig(type).config.open` is the discriminant; this hook turns it
 * into an actual `openOverlay` dispatch. Returns a stable function:
 *
 *   const open = useOpenItemPresentation();
 *   const opened = open(type, id);   // false → no panel wired for this type
 *
 * As more entity windows gain clean openers, add a branch here + an `open`
 * discriminant in the registry. Nothing else changes.
 */

import { useCallback } from "react";

import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { useOpenNoteInfoWindow } from "@/features/overlays/openers/noteInfoWindow";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useOpenPicklistManagerV2Window } from "@/features/overlays/openers/picklistManagerV2Window";

import { getItemConfig } from "./registry";
import type { ItemType } from "./types";

export function useOpenItemPresentation() {
  const openAgent = useOpenAgentRunWindow();
  const openNote = useOpenNoteInfoWindow();
  const openFile = useOpenFilePreviewWindow();
  const openPicklist = useOpenPicklistManagerV2Window();

  return useCallback(
    (
      type: ItemType | null | undefined,
      id: string | null | undefined,
    ): boolean => {
      if (!id) return false;
      const { config } = getItemConfig(type);
      if (!config.open) return false;

      switch (config.open.kind) {
        case "agent":
          openAgent({ initialAgentId: id });
          return true;
        case "note":
          openNote({ noteId: id });
          return true;
        case "file":
          openFile({ fileId: id });
          return true;
        case "picklist":
          openPicklist({ forcedListId: id });
          return true;
        // Openers for these types are being built (one branch each lands here
        // as they ship). Until then the card stays informative, non-clickable.
        case "app":
        case "task":
        case "project":
        case "scope":
        case "scope_type":
        case "context_item":
        case "session":
        case "table":
        case "workbook":
        case "document":
        case "message":
        case "email":
        default:
          return false;
      }
    },
    [openAgent, openNote, openFile, openPicklist],
  );
}

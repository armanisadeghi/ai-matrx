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
import { useOpenItemDetailWindow } from "@/features/overlays/openers/itemDetailWindow";

import { getItemConfig } from "./registry";
import type { ItemType } from "./types";

/** Optional display seed so the opened window shows instantly (no fetch wait). */
export interface ItemOpenSeed {
  name?: string | null;
  about?: string | null;
}

export function useOpenItemPresentation() {
  const openAgent = useOpenAgentRunWindow();
  const openNote = useOpenNoteInfoWindow();
  const openFile = useOpenFilePreviewWindow();
  const openPicklist = useOpenPicklistManagerV2Window();
  const openDetail = useOpenItemDetailWindow();

  return useCallback(
    (
      type: ItemType | null | undefined,
      id: string | null | undefined,
      seed?: ItemOpenSeed,
    ): boolean => {
      if (!id) return false;
      const { config } = getItemConfig(type);
      if (!config.open) return false;

      // Generic fallback: any recognized type without a bespoke window opens
      // the shared ItemDetailWindow (fetches the full row when a detailSource
      // is declared, else shows the seed). Closes the gap for every type.
      const openGenericDetail = () => {
        openDetail({
          itemType: type ?? null,
          itemId: id,
          initialName: seed?.name ?? null,
          initialAbout: seed?.about ?? null,
        });
        return true;
      };

      switch (config.open.kind) {
        case "agent":
          openAgent({ initialAgentId: id, initialAgentName: seed?.name ?? null });
          return true;
        case "note":
          openNote({ noteId: id, title: seed?.name ?? null });
          return true;
        case "file":
          openFile({ fileId: id });
          return true;
        case "picklist":
          openPicklist({ forcedListId: id });
          return true;
        // Everything else opens the generic detail window. As a type earns a
        // bespoke window, add its branch above — nothing else changes.
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
          return openGenericDetail();
        default:
          return openGenericDetail();
      }
    },
    [openAgent, openNote, openFile, openPicklist, openDetail],
  );
}

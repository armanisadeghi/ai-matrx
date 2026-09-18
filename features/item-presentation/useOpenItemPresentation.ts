"use client";

/**
 * Maps an item-presentation type to its window-panel opener.
 *
 * Four bespoke openers stay bespoke (agent run, note info, file preview,
 * structured-list manager); everything else goes to the Detail primitive
 * (`lib/detail`, `useOpenDetail`), which yields window / docked / page from
 * the item registry's one entry per type.
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
import { supabase } from "@/utils/supabase/client";
import { toast } from "@/components/ui/use-toast";

import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { useOpenNoteInfoWindow } from "@/features/overlays/openers/noteInfoWindow";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useOpenStructuredListManagerV2Window } from "@/features/overlays/openers/structuredListManagerV2Window";
import { useOpenSiteQuickViewWindow } from "@/features/overlays/openers/siteQuickViewWindow";
import { useOpenDetail } from "@/lib/detail/useOpenDetail";

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
  const openPicklist = useOpenStructuredListManagerV2Window();
  const openSite = useOpenSiteQuickViewWindow();
  const openDetail = useOpenDetail();

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
      // the Detail primitive (lib/detail) — window by default, docked or page
      // per the person's `ui.detail.default_presentation` setting. It fetches
      // the full row when a detailSource is declared, else shows the seed.
      const openGenericDetail = () => {
        void openDetail({
          type: type ?? "",
          id,
          seed: { name: seed?.name ?? null, about: seed?.about ?? null },
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
        case "conversation":
          // The floating Chat window, opened ON this conversation. The window
          // needs the conversation's owning agent to render it, so resolve
          // `initial_agent_id` first; failure is loud, never a dead click.
          void (async () => {
            const { data, error } = await supabase
              .schema("chat")
              .from("conversation")
              .select("initial_agent_id")
              .eq("id", id)
              .maybeSingle();
            if (error || !data) {
              console.error(
                "[useOpenItemPresentation] conversation lookup failed",
                { id, error },
              );
              toast({
                title: "Couldn't open the chat",
                description: error?.message ?? "This chat was not found.",
                variant: "destructive",
              });
              return;
            }
            openAgent({
              initialAgentId: data.initial_agent_id,
              initialSelectedConversationId: id,
            });
          })();
          return true;
        case "file":
          openFile({ fileId: id });
          return true;
        case "structured_list":
        // Legacy read-only alias for pre-rename payloads.
        case "picklist":
          openPicklist({ forcedListId: id });
          return true;
        // A Marketing SITE (F-87): the platform's own site Quick view — the
        // floating panel the Sites portfolio and the Content Plan list already
        // open on a row — wrapped so it can be opened from an id alone. It
        // carries the KPI tiles, the Search Console trend and a door to the
        // full site workspace, which is what a reader meeting a site in a chat
        // answer or a reference chip actually needs. `/detail/web_site/<id>`
        // still resolves through the type map (the registry's `detailSource`),
        // exactly as a file's does beside its bespoke preview window.
        case "web_site":
          openSite({ siteId: id, siteLabel: seed?.name ?? null });
          return true;
        // Everything else opens the Detail primitive. As a type earns a
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
        // An EXISTING Person: the Detail primitive IS its in-place presentation
        // (F-40). The only party window, `CrmCreatePartyWindow`, creates a NEW
        // record — never route an existing one there.
        case "party":
        // A connected Google Doc/Sheet/Slides record and a synced calendar
        // event: both registrations own their detail via `refineDetail`
        // (`features/google-workspace/documents/itemType.tsx` and
        // `calendar/itemType.tsx`) and have no bespoke window (F-63).
        case "google_document":
        case "calendar_event":
        // The third mirror table (V-22 NEW-6). No YouTube surface in this repo
        // is keyed on this row's id, so the Detail primitive IS its
        // presentation, from the one registration in `registry.tsx`.
        case "web_youtube_video":
          return openGenericDetail();
        default:
          return openGenericDetail();
      }
    },
    [openAgent, openNote, openFile, openPicklist, openSite, openDetail],
  );
}

"use client";

/**
 * Shell nav action registry
 *
 * The single place that maps a declarative `ShellNavActionId` (set on a nav
 * entry in `nav-data.ts`) to the client-side handler that runs when an
 * action-aware surface (e.g. the desktop sidebar flyout) activates it. This is
 * how a sidebar entry can trigger an overlay/window IN PLACE instead of
 * navigating to a route.
 *
 * Pattern for adding the next one (this is the first of many):
 *   1. Add the id to `ShellNavActionId` in `constants/nav-data.ts`.
 *   2. Call its opener hook here and return a handler under that id.
 *   3. Set `action: "<id>"` on the nav entry (keep `href` as the fallback).
 * The `Record<ShellNavActionId, …>` return type makes step 1 without step 2 a
 * compile error, so the registry can never drift from the id union.
 *
 * Handlers must be cheap to build every render — they're plain closures over
 * opener hooks (React Compiler handles memoization; do not hand-memoize).
 *
 * BUILD-GRAPH LAW: this file is statically reachable from AppShell → Sidebar,
 * i.e. from EVERY (core)/(admin) route entry. A static import here is
 * multiplied across all of them, server AND client pass. Therefore the only
 * allowed static imports are ids, router, toast, redux hooks, and thin
 * overlay openers (dispatch-only). The machinery a handler needs — thunks,
 * services, anything with a feature graph behind it — MUST be
 * `await import()`ed INSIDE the handler body, so it compiles into its own
 * chunk and loads on first click. One static thunk import here once dragged
 * 420 modules / 3.7 MB into every route (the war-room engine, 2026-07).
 */

import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { useOpenCreateProjectWindow } from "@/features/window-panels/windows/projects/useOpenCreateProjectWindow";
import { useOpenStructuredListManagerV2Window } from "@/features/overlays/openers/structuredListManagerV2Window";
import { useOpenFavoritesManagerWindow } from "@/features/overlays/openers/favoritesManagerWindow";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { isServiceFailure } from "@/features/data-tables/types";
import type { ShellNavActionId } from "../constants/nav-data";

export type ShellNavActionHandlers = Record<ShellNavActionId, () => void>;

export function useNavActions(): ShellNavActionHandlers {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const openCreateProject = useOpenCreateProjectWindow();
  const openPicklistManager = useOpenStructuredListManagerV2Window();
  const openFavoritesManager = useOpenFavoritesManagerWindow();

  return {
    "create-project": () => {
      openCreateProject({});
    },
    "create-task": () => {
      // Opens the non-blocking Task Quick Create window with a blank task.
      dispatch(openOverlay({ overlayId: "taskQuickCreateWindow", data: {} }));
    },
    "create-war-room": () => {
      // Creates the session server-side, then navigates into it. The thunk
      // raises its own error toast on failure (returns null). The war-room
      // engine is the heaviest graph in the app — loaded here, on click only.
      void (async () => {
        const { createWarRoomSession } = await import(
          "@/features/war-room/redux/thunks"
        );
        const session = await dispatch(createWarRoomSession());
        if (session) router.push(`/war-room/${session.id}`);
      })();
    },
    "create-note": () => {
      // Creates a blank draft note in the DB, then opens it. Matches the
      // in-page "New Note" button behavior (create-then-open).
      void (async () => {
        try {
          const { createNewNote } = await import(
            "@/features/notes/redux/thunks"
          );
          const note = await dispatch(createNewNote({})).unwrap();
          if (note?.id) router.push(`/notes/${note.id}`);
        } catch {
          toast.error("Couldn't create the note");
        }
      })();
    },
    "create-document": () => {
      // Mirrors the /documents page "New" button: create a blank cloud doc,
      // then open it.
      void (async () => {
        const { createDocument } = await import(
          "@/features/data-tables/document-service"
        );
        const res = await createDocument({ name: "Untitled document" });
        if (isServiceFailure(res)) {
          toast.error(res.error ?? "Couldn't create the document");
          return;
        }
        router.push(`/documents/${res.data.id}`);
      })();
    },
    "create-workbook": () => {
      // Mirrors the /workbooks page "New" button: create a blank workbook,
      // then open it.
      void (async () => {
        const { createWorkbook } = await import(
          "@/features/data-tables/workbook-service"
        );
        const res = await createWorkbook({ name: "Untitled workbook" });
        if (isServiceFailure(res)) {
          toast.error(res.error ?? "Couldn't create the workbook");
          return;
        }
        router.push(`/workbooks/${res.data.id}`);
      })();
    },
    "create-picklist": () => {
      // Opens the canonical Pick List manager (browse view) where lists are
      // created and edited.
      openPicklistManager({});
    },
    "manage-favorites": () => {
      // Opens the Manage Favorites window (check app areas to pin/unpin).
      openFavoritesManager({});
    },
  };
}

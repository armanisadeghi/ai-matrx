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
 */

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOpenCreateProjectWindow } from "@/features/window-panels/windows/projects/useOpenCreateProjectWindow";
import { useOpenPicklistManagerV2Window } from "@/features/overlays/openers/picklistManagerV2Window";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createWarRoomSession } from "@/features/war-room/redux/thunks";
import { createNewNote } from "@/features/notes/redux/thunks";
import { createDocument } from "@/features/data-tables/document-service";
import { createWorkbook } from "@/features/data-tables/workbook-service";
import { isServiceFailure } from "@/features/data-tables/types";
import type { ShellNavActionId } from "../constants/nav-data";

export type ShellNavActionHandlers = Record<ShellNavActionId, () => void>;

export function useNavActions(): ShellNavActionHandlers {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const openCreateProject = useOpenCreateProjectWindow();
  const openPicklistManager = useOpenPicklistManagerV2Window();

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
      // raises its own error toast on failure (returns null).
      void (async () => {
        const session = await dispatch(createWarRoomSession());
        if (session) router.push(`/war-room/${session.id}`);
      })();
    },
    "create-note": () => {
      // Creates a blank draft note in the DB, then opens it. Matches the
      // in-page "New Note" button behavior (create-then-open).
      void (async () => {
        try {
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
  };
}

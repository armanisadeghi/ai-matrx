"use client";

/**
 * Openers for the two Google import windows (Google-native PLAN §4.5, §4.7).
 *
 * `useOpenGoogleContactsImport()` / `useOpenGoogleTasksImport()` — imperative
 * hooks; each returns a handle with `close()`. Singletons: opening again
 * retargets the one window instead of stacking a second copy.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const CONTACTS_OVERLAY_ID = "googleContactsImportWindow" as const;
const TASKS_OVERLAY_ID = "googleTasksImportWindow" as const;

export interface GoogleImportWindowHandle {
  close: () => void;
}

export interface OpenGoogleContactsImportOptions {
  /** The organization the imported People are written into. Required by the
   *  server: nothing chooses one for the caller. */
  organizationId: string | null;
  /** Opens with one contact preselected — the "Update from Google" door. */
  initialExternalId?: string | null;
}

export function useOpenGoogleContactsImport() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenGoogleContactsImportOptions): GoogleImportWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: CONTACTS_OVERLAY_ID,
          data: {
            organizationId: opts.organizationId ?? null,
            initialExternalId: opts.initialExternalId ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: CONTACTS_OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

export interface OpenGoogleTasksImportOptions {
  organizationId: string | null;
  /** The AI Matrx project imported tasks belong to, when the caller has one. */
  projectId?: string | null;
}

export function useOpenGoogleTasksImport() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenGoogleTasksImportOptions): GoogleImportWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: TASKS_OVERLAY_ID,
          data: {
            organizationId: opts.organizationId ?? null,
            projectId: opts.projectId ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: TASKS_OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

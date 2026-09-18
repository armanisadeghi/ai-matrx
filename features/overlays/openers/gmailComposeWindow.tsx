"use client";

/**
 * Opener for the `gmailComposeWindow` overlay.
 *
 * - `useOpenGmailComposeWindow()` — imperative hook; returns a handle with
 *   `close()`.
 * - `<GmailComposeWindowController />` — declarative wrapper.
 *
 * `onSent` is a FUNCTION, so it never travels through Redux: it is registered
 * with the `callbackManager` and only its id crosses the slice, exactly as the
 * image-uploader window does. The hook hides that from callers — they pass a
 * normal callback.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { callbackManager } from "@/utils/callbackManager";
import type { GmailDraftedBy } from "@/features/crm/gmail/types";

const OVERLAY_ID = "gmailComposeWindow" as const;

/** What the window reports back once the send is on the timeline. */
export interface GmailComposeSentEvent {
  /** The `crm.interaction` row, when it was written. */
  interactionId: string | null;
}

export interface OpenGmailComposeWindowOptions {
  partyId: string;
  organizationId: string;
  partyLabel: string;
  dealId?: string | null;
  dealLabel?: string | null;
  projectId?: string | null;
  initialTo?: string | null;
  initialSubject?: string | null;
  initialBody?: string | null;
  draftedBy?: GmailDraftedBy | null;
  /** Fires after the message is sent AND recorded — refresh the timeline. */
  onSent?: (event: GmailComposeSentEvent) => void;
}

export interface GmailComposeWindowHandle {
  close: () => void;
}

export function useOpenGmailComposeWindow() {
  const dispatch = useAppDispatch();
  const callbackIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = callbackIds.current;
    return () => {
      for (const id of ids) callbackManager.unregister(id);
      ids.clear();
    };
  }, []);

  return (
    options: OpenGmailComposeWindowOptions,
  ): GmailComposeWindowHandle => {
    let sentCallbackId: string | null = null;
    if (options.onSent) {
      const handler = options.onSent;
      sentCallbackId = callbackManager.register<GmailComposeSentEvent>(
        (event) => handler(event),
      );
      callbackIds.current.add(sentCallbackId);
    }

    dispatch(
      openOverlay({
        overlayId: OVERLAY_ID,
        data: {
          partyId: options.partyId,
          organizationId: options.organizationId,
          partyLabel: options.partyLabel,
          dealId: options.dealId ?? null,
          dealLabel: options.dealLabel ?? null,
          projectId: options.projectId ?? null,
          initialTo: options.initialTo ?? null,
          initialSubject: options.initialSubject ?? null,
          initialBody: options.initialBody ?? null,
          draftedBy: options.draftedBy ?? null,
          sentCallbackId,
        },
      }),
    );

    return {
      close: () => {
        if (sentCallbackId) {
          callbackManager.unregister(sentCallbackId);
          callbackIds.current.delete(sentCallbackId);
        }
        dispatch(closeOverlay({ overlayId: OVERLAY_ID }));
      },
    };
  };
}

/**
 * No `<GmailComposeWindowController />` declarative wrapper.
 *
 * Deliberate: the declarative form re-opens on prop identity, and the one prop
 * that changes here is `onSent` — a fresh function on every render of the host.
 * The other callback-aware openers buy their way out of that with an
 * `eslint-disable` on the dependency list; this repo does not clear findings
 * that way (CLAUDE.md § Lint debt). A half-written message being thrown away
 * because the host re-rendered is not a trade worth making, so this overlay is
 * opened from an event handler through the hook, which is the canonical form.
 */

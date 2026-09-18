"use client";

/**
 * useCanvasArtifactUrlState — THE OPEN ARTIFACT IS PART OF THE PAGE'S ADDRESS.
 *
 * The canvas slice is deliberately not persisted (see `FEATURE.md`), so a full
 * page reload empties it. On a CHAT that costs nothing visible: the room
 * re-derives its artifacts from persisted tool-call rows. On a LIST route like
 * `/artifacts` there is no such source — the artifact a person was reading
 * simply vanished on reload, and Back/Forward did nothing at all.
 *
 * Champion: Claude.ai's artifacts gallery. The selected artifact lives in the
 * URL there, so reload, Back, Forward and a pasted link all restore the same
 * open artifact. This hook is that behaviour as a platform primitive: ANY list
 * surface that opens saved canvas items can mount it and inherit the address.
 *
 * It is a MIRROR, not a second store. Nothing new is persisted, nothing is
 * written to `localStorage`; the query parameter is the only new state, and the
 * canvas is opened through the same `useOpenCanvasItem` opener a click uses, so
 * a restored artifact is byte-for-byte the artifact a click produces.
 *
 * 🚨 THE LOOP IS BROKEN BY VALUE, NEVER BY BOOKKEEPING — the rule the
 * `@ai-matrx/kit/url-state` primitive states for exactly this shape. One ref
 * holds the last value the two sides AGREED on; a direction only acts when its
 * own side has moved away from that agreement. Pressing Forward to an artifact
 * that was open before therefore still re-opens it, because the comparison is
 * against the agreed value and not against "a URL we once wrote".
 *
 * 🚨 AVAILABILITY IS AWAITED, NOT ASSUMED. The global `CanvasSideSheet` front
 * door is idle-deferred (`features/shell/islands/DeferredIslands.tsx`), so on a
 * cold load the canvas reports itself unavailable for the first few frames.
 * Restoring immediately would hit `ensureCanvasReachable` and show the person a
 * FALSE "no canvas here" refusal for an artifact that was about to be openable.
 * We wait for the flag — and if it never arrives, we attempt the open anyway
 * after `CANVAS_AVAILABILITY_GRACE_MS` so the request ends in a real announced
 * drop instead of silence (law 4).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { commitUrlParams, useUrlSearchParams } from "@ai-matrx/kit/url-state";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeCanvas,
  selectCanvasIsAvailable,
  selectCanvasIsOpen,
  selectCurrentCanvasItem,
} from "@/features/canvas/redux/canvasSlice";
import { useOpenCanvasItem } from "./useOpenCanvasItem";

/**
 * `/artifacts?open=<canvas_items.id>`. One list per page, so the name is not
 * namespaced — the same choice `lib/entity-list/urlQuery.ts` made for `q`,
 * `page` and `sort`.
 */
export const CANVAS_ARTIFACT_URL_PARAM = "open";

/** How long to wait for the idle-deferred canvas front door before giving up
 *  and letting the opener announce the drop. */
export const CANVAS_AVAILABILITY_GRACE_MS = 8000;

/**
 * The artifact id a canvas item points at, or `""` when the item is not a
 * persisted artifact (a live sandbox pane, a legacy snapshot). Only persisted
 * artifacts are addressable — an address that cannot be reopened is a lie.
 */
export function artifactIdOfOpenCanvasItem(
  item: { content?: { metadata?: { canvasItemId?: string } }; savedItemId?: string } | null,
): string {
  if (!item) return "";
  return item.content?.metadata?.canvasItemId ?? item.savedItemId ?? "";
}

export function useCanvasArtifactUrlState(): void {
  const dispatch = useAppDispatch();
  const { openItem } = useOpenCanvasItem();
  const urlArtifactId =
    useUrlSearchParams().get(CANVAS_ARTIFACT_URL_PARAM) ?? "";
  // Written through the canonical `commitUrlParams` (a module function, so the
  // effect below keeps an honest dependency list) rather than `useUrlState`,
  // whose setter is a fresh closure on every render.
  const setUrlArtifactId = useCallback(
    (next: string, history: "push" | "replace" = "push") => {
      commitUrlParams({ [CANVAS_ARTIFACT_URL_PARAM]: next || null }, history);
    },
    [],
  );

  const isOpen = useAppSelector(selectCanvasIsOpen);
  const isAvailable = useAppSelector(selectCanvasIsAvailable);
  const currentItem = useAppSelector(selectCurrentCanvasItem);
  const canvasArtifactId = isOpen ? artifactIdOfOpenCanvasItem(currentItem) : "";

  /** The last value both sides agreed on. `null` until the first reconcile. */
  const agreedRef = useRef<string | null>(null);
  const [graceExpired, setGraceExpired] = useState(false);

  // The grace timer exists ONLY so a canvas front door that never mounts ends
  // in an announced refusal rather than a URL that quietly means nothing.
  useEffect(() => {
    const timer = setTimeout(
      () => setGraceExpired(true),
      CANVAS_AVAILABILITY_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // FIRST RECONCILE — decide who is right, once.
    if (agreedRef.current === null) {
      if (urlArtifactId) {
        // The address asked for an artifact. Wait for the canvas to exist.
        if (!isAvailable && !graceExpired) return;
        agreedRef.current = urlArtifactId;
        if (urlArtifactId !== canvasArtifactId) {
          void openItem({ artifactId: urlArtifactId });
        }
        return;
      }
      // The address asked for nothing. If the canvas already holds an artifact
      // (a client-side navigation arrived with the pane open), the address is
      // the side that is wrong — correct it WITHOUT a history entry, because
      // nobody pressed anything.
      agreedRef.current = canvasArtifactId;
      if (canvasArtifactId) {
        setUrlArtifactId(canvasArtifactId, "replace");
      }
      return;
    }

    // URL MOVED — reload, Back, Forward, or a pasted link. The address wins.
    if (urlArtifactId !== agreedRef.current) {
      agreedRef.current = urlArtifactId;
      if (urlArtifactId) {
        if (urlArtifactId !== canvasArtifactId) {
          void openItem({ artifactId: urlArtifactId });
        }
      } else if (canvasArtifactId) {
        dispatch(closeCanvas());
      }
      return;
    }

    // CANVAS MOVED — a click opened, switched or closed something. Opening,
    // switching and closing are all discrete decisions, so each PUSHES and Back
    // undoes exactly that one step.
    if (canvasArtifactId !== agreedRef.current) {
      agreedRef.current = canvasArtifactId;
      setUrlArtifactId(canvasArtifactId);
    }
  }, [
    urlArtifactId,
    canvasArtifactId,
    isAvailable,
    graceExpired,
    dispatch,
    openItem,
    setUrlArtifactId,
  ]);
}

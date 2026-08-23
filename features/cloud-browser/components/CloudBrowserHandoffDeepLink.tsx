"use client";

/**
 * CloudBrowserHandoffDeepLink — the LANDING for a handoff notification.
 *
 * The D-14 notice ("Your browser needs you") is only worth sending if the tap
 * arrives somewhere. The server writes its door as
 * `/chat[/{conversationId}]?cloudBrowserHandoff={handoffId}`; until 2026-08-23
 * NOTHING in this repo read that parameter, so the chip navigated to a page
 * that did nothing while a 30-minute window burned. This is the reader.
 *
 * It is mounted globally (`app/DeferredSingletonCore.tsx`) rather than beside
 * the chat composer, because the notification can land on any route the door
 * points at and the person must not have to go find the browser themselves.
 *
 * What it does, in order:
 *   1. reads the parameter;
 *   2. hydrates `cloudBrowserSlice` from the REAL handoff row through the ONE
 *      canonical path (`adoptCloudBrowserRunFromStream` → `loadSnapshotForRun`),
 *      which refuses to start a browser, so a stale link can never conjure one;
 *   3. opens the Cloud Browser canvas on that run through the ONE opener;
 *   4. strips the parameter, so a refresh or a back-navigation does not
 *      re-open the canvas underneath someone who closed it.
 *
 * It renders nothing and fires once per handoff id per session.
 */

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectRun } from "../redux/selectors";
import { adoptCloudBrowserRunFromStream } from "../redux/adoptRunFromStream";
import { useOpenCloudBrowserCanvas } from "../hooks/useOpenCloudBrowserCanvas";
import { CLOUD_BROWSER_HANDOFF_PARAM } from "../constants";

function CloudBrowserHandoffDeepLinkInner(): null {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  // The opener needs the run the slice hydrated DURING this effect, so the
  // store is read imperatively at that moment. Subscribing with a selector
  // would re-fire the effect on every unrelated run tick and re-open the
  // canvas behind the user.
  const store = useAppStore();
  const openCanvas = useOpenCloudBrowserCanvas();
  const handledRef = useRef<string | null>(null);

  const handoffId = params.get(CLOUD_BROWSER_HANDOFF_PARAM);
  // The conversation is in the path the notice chose, so the canvas can bind
  // to it and taking control can steer the running agent.
  const conversationId = pathname.startsWith("/chat/")
    ? pathname.slice("/chat/".length).split("/")[0] || undefined
    : undefined;

  useEffect(() => {
    if (!handoffId) return;
    if (handledRef.current === handoffId) return;
    handledRef.current = handoffId;

    let cancelled = false;
    void (async () => {
      try {
        await dispatch(
          adoptCloudBrowserRunFromStream({ runId: null, handoffId }),
        ).unwrap();
      } catch (error) {
        // Never strand the person on a blank page over a hydration failure —
        // open the canvas anyway; it loads the profile's own state.
        console.error(
          "[cloud-browser] could not hydrate the handoff named by a notification",
          { handoffId, error },
        );
      }
      if (cancelled) return;
      const current = selectRun(store.getState());
      openCanvas({
        initialProfileId: current?.profileId ?? undefined,
        runId: current?.id ?? undefined,
        conversationId,
      });
      // Consume the parameter. The destination has been reached; leaving it in
      // the URL makes every later refresh re-open the canvas.
      const next = new URLSearchParams(params.toString());
      next.delete(CLOUD_BROWSER_HANDOFF_PARAM);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [handoffId, conversationId, dispatch, openCanvas, params, pathname, router, store]);

  return null;
}

export function CloudBrowserHandoffDeepLink() {
  // `useSearchParams` needs a Suspense boundary to avoid forcing client-side
  // rendering on any statically-rendered page this singleton lands on.
  return (
    <Suspense fallback={null}>
      <CloudBrowserHandoffDeepLinkInner />
    </Suspense>
  );
}

export default CloudBrowserHandoffDeepLink;

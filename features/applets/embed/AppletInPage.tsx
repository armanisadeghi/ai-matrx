"use client";

// features/applets/embed/AppletInPage.tsx — ONE APPLET DRAWN LIVE INSIDE A PAGE: a Space page's `applet` block
// (the editor) and records-ui's "page built from tables" (`RecordsUiHost.applets`). Loaded on demand by
// `appletsPort.tsx`, so the Applet host never rides a page's own chunk. The Applet renders through the ONE host
// (`AppletHostMount`), mounted `embedded`: its own pages navigate in place inside the block and its writes stay live.
//
// `height` reserves the frame (no layout shift; the Applet scrolls inside it). `pagePublished`: the page is on the
// web, so an Applet that is not on the web gets one line telling the page's editor that visitors will not see it,
// with the door to publish it (the Applet's own page, where publishing states its consequence first).
// A published page's visitor never mounts this: the Site draws `AppletCard` (editor-live, public-static).

import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { appletManageHref, readAppletCards, type AppletCardInfo } from "./appletsPort";

export interface AppletInPageProps {
  appId: string;
  /** The reserved frame height in px; absent = the Applet's natural height. */
  height?: number;
  /** The page holding the block is published to the web. */
  pagePublished?: boolean;
  /** The Applet as read (name, slug, on the web), once — so the host's menu needs no second read. */
  onInfo?: (app: AppletCardInfo) => void;
}

/** One Applet, in place: read by id under the viewer's session (row security decides). */
export default function AppletInPage({ appId, height, pagePublished = false, onInfo }: AppletInPageProps) {
  const [app, setApp] = useState<AppletCardInfo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setApp(null);
    setFailed(null);
    readAppletCards([appId]).then(
      (cards) => {
        if (cancelled) return;
        const hit = cards.get(appId);
        if (hit) {
          setApp(hit);
          onInfo?.(hit);
        } else setFailed("This Applet has not been shared with you.");
      },
      (err: unknown) => !cancelled && setFailed(err instanceof Error ? err.message : "The Applet could not be read."),
    );
    return () => {
      cancelled = true;
    };
  }, [appId]);
  const frame = height ? { height } : undefined;
  if (failed)
    return (
      <p className="text-xs text-muted-foreground" data-applet-in-page={appId} data-state="refused">
        {failed}
      </p>
    );
  if (!app)
    return (
      <div data-applet-in-page={appId} data-state="reading" className="min-h-24" style={frame}>
        <p className="text-xs text-muted-foreground">Opening the Applet…</p>
      </div>
    );
  return (
    <div data-applet-in-page={appId} data-state="live" className="flex flex-col gap-1">
      {pagePublished && !app.onTheWeb ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-applet-notice="not-on-web">
          <Globe size={12} aria-hidden />
          <span>Visitors cannot see this Applet.</span>
          <a href={appletManageHref(appId)} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
            Publish
          </a>
        </p>
      ) : null}
      <div className={height ? "min-h-0 overflow-auto" : "min-h-24"} style={frame}>
        <AppletHostMount appletId={appId} slug={app.slug} embedded />
      </div>
    </div>
  );
}

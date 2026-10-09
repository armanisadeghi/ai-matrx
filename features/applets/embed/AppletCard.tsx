"use client";

// features/applets/embed/AppletCard.tsx — ONE APPLET SHOWN WITHOUT RUNNING IT: a published Site page's `applet`
// block (and any read-only surface that must not run it). Editor-live, public-static (attack U1/C3, 2026-10-09):
// the Site page reads as its publisher while a live Applet would read as the visitor, so the two would disagree,
// and a guest's own data (G1) is not shipped. FOLLOW-UP — live Applets on published Sites, gated on G1 guest data:
// when it ships, the Space block swaps this card for `AppletInPage` on the Site.
//
// On the web: name, one-line description, "Open this Applet" (the full www link). Not on the web: a viewer who can
// read the Applet (its owner, her organization) sees one line with the Publish door; anyone else (a signed-out
// visitor reads only public Applets) sees nothing — the block takes no room and nothing looks broken.

import { AppWindow, ArrowUpRight, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { appletManageHref, appletWebUrl, readAppletCards, type AppletCardInfo } from "./appletsPort";

export default function AppletCard({ appId }: { appId: string }) {
  const [app, setApp] = useState<AppletCardInfo | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    readAppletCards([appId]).then(
      (cards) => !cancelled && setApp(cards.get(appId) ?? null),
      () => !cancelled && setApp(null),
    );
    return () => {
      cancelled = true;
    };
  }, [appId]);
  if (app === undefined) return <div className="h-16" data-applet-card={appId} data-state="reading" />;
  if (app === null) return null;
  if (!app.onTheWeb)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-applet-card={appId} data-state="not-on-web">
        <Globe size={12} aria-hidden />
        <span>Visitors cannot see {app.name}.</span>
        <a href={appletManageHref(appId)} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
          Publish
        </a>
      </p>
    );
  return (
    <a
      href={appletWebUrl(app.slug)}
      target="_blank"
      rel="noreferrer"
      data-applet-card={appId}
      data-state="on-web"
      data-clickable=""
      className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 no-underline hover:bg-accent/40"
    >
      <AppWindow size={20} className="shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{app.name}</span>
        {app.description ? <span className="truncate text-xs text-muted-foreground">{app.description}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
        Open this Applet <ArrowUpRight size={12} aria-hidden />
      </span>
    </a>
  );
}

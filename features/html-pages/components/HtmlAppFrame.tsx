"use client";

/**
 * The iframe that runs a published html page as an app inside a canvas tab.
 *
 * A cross-origin frame paints white until its document arrives, and a frame
 * that never arrives stays white forever — a blank pane that says nothing
 * (the "Html 4" tab, 2026-10-07: a cold published page took seconds and the
 * tab read as empty). So the frame is covered by a skeleton until its `load`
 * event, and a page that has not loaded after STALL_MS says so with a retry.
 */

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Button, EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { cn } from "@/styles/themes/utils";

/** How long a page may take before the pane stops showing a skeleton and says so. */
export const HTML_FRAME_STALL_MS = 15_000;

export function HtmlAppFrame({
  src,
  title,
  sandbox,
  allow,
  className,
}: {
  src: string | undefined;
  title: string;
  sandbox: string;
  allow: string;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (loaded) return undefined;
    const timer = window.setTimeout(() => setStalled(true), HTML_FRAME_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, attempt]);

  const retry = () => {
    setLoaded(false);
    setStalled(false);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="relative h-full w-full" data-html-app-frame-host="" data-html-frame-state={loaded ? "loaded" : stalled ? "stalled" : "loading"}>
      <iframe
        key={attempt}
        src={src}
        title={title}
        // The title is the frame's accessible name, not a hover tooltip:
        // opt out of the design system's title→tooltip lift so it stays.
        data-native-title=""
        data-html-app-frame=""
        className={cn("block h-full w-full border-0 bg-white", className)}
        sandbox={sandbox}
        allow={allow}
        allowFullScreen
        onLoad={() => {
          setLoaded(true);
          setStalled(false);
        }}
      />
      {loaded ? null : (
        <div className="absolute inset-0 flex flex-col bg-card" data-html-frame-cover="">
          {stalled ? (
            <div className="m-auto">
              <EmptyState
                icon={<Globe className="size-5" />}
                title="This page is taking a long time to load"
                line="It may still arrive. Try again to reload it."
                action={<Button variant="outline" onClick={retry}>Try again</Button>}
              />
            </div>
          ) : (
            <RegionSkeleton shape="cards" count={2} className="p-4" aria-label="Loading page" />
          )}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * SiteCommandRunWindow — the floating home for a marketing site command
 * (analyze, sitemap sync, GSC sync, link check, page fetch).
 *
 * THE FLOATING LAW, applied to a non-agent run. These commands are minutes
 * long and every one of them streams NDJSON progress the UI used to throw
 * away, so the user watched a spinner. The run now floats: the page never
 * shifts, the user keeps working underneath, and closing this window does not
 * cancel anything — the work is server-side and its `web.crawl_session` row is
 * the durable record a reload rejoins.
 *
 * It reads the run from the module store by identity (site + command + target)
 * rather than taking it as data, because `OverlayController` renders it at the
 * root of the tree — outside the marketing site provider that owns the run.
 */

import React, { useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { SiteCommandFeed } from "@/features/marketing/components/crawls/SiteCommandFeed";
import {
  getSiteCommandRun,
  subscribeSiteCommandRun,
} from "@/features/marketing/crawler/command-run-store";
import {
  SITE_COMMAND_COPY,
  isSiteCommandMode,
  siteCommandKey,
} from "@/features/marketing/crawler/site-commands";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/**
 * Narrower than the chat reading column on purpose: this body is a progress
 * ledger of short lines and counters, not content-IR kind components tuned
 * against `/chat`. Tall enough to show the counter grid plus a real run of
 * rows without scrolling.
 */
const COMMAND_WINDOW_WIDTH = 520;
const COMMAND_WINDOW_HEIGHT = "60dvh";

export interface SiteCommandRunWindowProps {
  windowInstanceId: string;
  onClose: () => void;
  siteId: string;
  /**
   * Already narrowed by `OverlayController` before this window renders; the
   * guard below is the second lock, not the first.
   */
  mode: string;
  target?: string | null;
  /** The brand that owns the site, so the session id stays a door. */
  brandId?: string | null;
}

export default function SiteCommandRunWindow({
  windowInstanceId,
  onClose,
  siteId,
  mode,
  target = null,
  brandId = null,
}: SiteCommandRunWindowProps) {
  const valid = isSiteCommandMode(mode);
  const key = valid ? siteCommandKey(siteId, mode, target) : "";
  const run = useSyncExternalStore(
    (listener) => subscribeSiteCommandRun(key, listener),
    () => getSiteCommandRun(key),
    () => null,
  );

  if (!valid) {
    // Unreachable through the controller. Loud rather than an empty frame
    // pretending to be a run, if anything ever opens this window directly.
    throw new Error(`Unknown site command mode: ${mode}`);
  }
  const copy = SITE_COMMAND_COPY[mode];
  const title =
    run === null || run.status === "connecting" || run.status === "running"
      ? copy.runningLabel
      : run.status === "failed"
        ? `${copy.doneLabel} — failed`
        : `${copy.doneLabel} — done`;

  // Page-local by design: the feed's rows are transient stream messages, not
  // a durable identity with its own entity token (see CrawlLogsTable, which
  // draws the same line for the persisted `web.crawl_event` it shows
  // instead). The one real door this window can offer is the session itself.
  const sessionHref = run?.sessionId
    ? marketingRoutes.site(brandId, siteId, `/crawls/${run.sessionId}`)
    : null;
  const extraSections: ContextMenuExtraSection[] = sessionHref
    ? [
        {
          id: "site-command-run",
          label: copy.doneLabel,
          items: [
            {
              kind: "link",
              id: "site-command-open-session",
              label: "Open crawl session",
              icon: ExternalLink,
              href: sessionHref,
            },
          ],
        },
      ]
    : [];

  return (
    <WindowPanel
      id={`site-command-run-window-${windowInstanceId}`}
      title={title}
      overlayId="siteCommandRunWindow"
      minWidth={360}
      minHeight={260}
      width={COMMAND_WINDOW_WIDTH}
      height={COMMAND_WINDOW_HEIGHT}
      onClose={onClose}
    >
      {/* ONE layer: the frame is the chrome, the feed brings its own card. */}
      <NonEditableContextMenu
        sourceFeature="marketing"
        contentSource={{ type: "raw" }}
        contextData={{ content: copy.doneLabel }}
        extraSections={extraSections}
      >
        <div className="h-full min-h-0 overflow-hidden">
          {run ? (
            <SiteCommandFeed
              run={run}
              sessionHref={sessionHref}
              className="h-full"
            />
          ) : (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              {copy.startingMessage}
            </p>
          )}
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}

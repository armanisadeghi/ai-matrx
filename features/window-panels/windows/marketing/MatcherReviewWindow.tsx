"use client";

/**
 * MatcherReviewWindow — what a keyword match actually did, big enough to judge.
 *
 * Arman (2026-08-24): *"when you do run the matcher, instead of just giving a
 * count in a toast, you need to get a nice, beautiful, big UI that's a window
 * panel and shows you a table that shows you all the keywords that match…
 * use colors to show ones that already have matched other qualifiers… give you
 * a way to undo… [and] a way of fixing the things that you've just done by
 * immediately giving you the ones that you just matched."*
 *
 * A WINDOW AND NOT A DIALOG, deliberately: the whole point is to keep the
 * result in front of you WHILE you go on editing the answers and matches that
 * produced it. A modal would force you to dismiss the evidence to act on it.
 *
 * The window is the frame only. Everything it knows lives in
 * `features/marketing/seo/value-system/dimensions/MatcherReviewBody.tsx`, so
 * the same review renders inline anywhere else that wants it without lifting a
 * window out of the registry.
 *
 * NOT PRESERVED across reloads (`ephemeral`): a review is about a run that just
 * happened. Restoring one a day later would present a stale table as a fresh
 * result, which is the exact failure the panel exists to end.
 */

import { useCallback } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MatcherReviewBody } from "@/features/marketing/seo/value-system/dimensions/MatcherReviewBody";

export interface MatcherReviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  matcherId: string;
  pattern?: string | null;
  kindLabel?: string;
  valueLabel?: string;
  dimensionLabel?: string;
}

export default function MatcherReviewWindow({
  onClose,
  siteId,
  matcherId,
  pattern,
  kindLabel,
  valueLabel,
  dimensionLabel,
}: MatcherReviewWindowProps) {
  const collectData = useCallback(
    () => ({
      siteId,
      matcherId,
      pattern: pattern ?? "",
      kindLabel: kindLabel ?? "",
      valueLabel: valueLabel ?? "",
      dimensionLabel: dimensionLabel ?? "",
    }),
    [siteId, matcherId, pattern, kindLabel, valueLabel, dimensionLabel],
  );

  return (
    <WindowPanel
      id="matcher-review-window"
      overlayId="matcherReviewWindow"
      title="What this match caught"
      onClose={onClose}
      width={860}
      height={620}
      minWidth={420}
      minHeight={320}
      position="center"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <MatcherReviewBody
        siteId={siteId}
        matcherId={matcherId}
        pattern={pattern ?? null}
        kindLabel={kindLabel || "Match"}
        valueLabel={valueLabel || "this answer"}
        dimensionLabel={dimensionLabel || "Dimension"}
        // Undo deleted the match — the window's whole subject is gone, so it
        // closes rather than sitting there showing a table of a dead rule.
        onGone={onClose}
      />
    </WindowPanel>
  );
}

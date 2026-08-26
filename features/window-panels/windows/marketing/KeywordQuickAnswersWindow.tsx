"use client";

/**
 * QUICK ANSWERS — the window shell.
 *
 * A WINDOW rather than a takeover on purpose (KI-054): the value table stays
 * live behind it, so the levels visibly move as you answer. A full-screen
 * session would hide the consequence of the very thing it is asking you to do.
 *
 * The body is `QuickAnswers`, which lives beside the ruling session it extends
 * — this file owns the frame and the persisted question, nothing else.
 */

import { useCallback, useState } from "react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { QuickAnswers } from "@/features/marketing/seo/value-system/workbench/session/QuickAnswers";

interface KeywordQuickAnswersWindowProps {
  isOpen: boolean;
  onClose: () => void;
  siteId?: string | null;
  siteLabel?: string | null;
  /** Null lets the server pick the question worth asking next. */
  dimensionSlug?: string | null;
}

export default function KeywordQuickAnswersWindow({
  isOpen,
  onClose,
  siteId,
  siteLabel,
  dimensionSlug,
}: KeywordQuickAnswersWindowProps) {
  if (!isOpen || !siteId) return null;
  return (
    <KeywordQuickAnswersWindowInner
      onClose={onClose}
      siteId={siteId}
      siteLabel={siteLabel ?? null}
      dimensionSlug={dimensionSlug ?? null}
    />
  );
}

function KeywordQuickAnswersWindowInner({
  onClose,
  siteId,
  siteLabel,
  dimensionSlug,
}: {
  onClose: () => void;
  siteId: string;
  siteLabel: string | null;
  dimensionSlug: string | null;
}) {
  const [slug, setSlug] = useState<string | null>(dimensionSlug);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      siteId,
      siteLabel,
      dimensionSlug: slug,
    }),
    [siteId, siteLabel, slug],
  );

  return (
    <WindowPanel
      title={siteLabel ? `Quick Answers — ${siteLabel}` : "Quick Answers"}
      id="keyword-quick-answers-window"
      overlayId="keywordQuickAnswersWindow"
      minWidth={620}
      minHeight={560}
      width={760}
      height={700}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
    >
      <QuickAnswers
        siteId={siteId}
        siteLabel={siteLabel}
        dimensionSlug={slug}
        onDimensionChange={setSlug}
      />
    </WindowPanel>
  );
}

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

import { useCallback, useRef, useState } from "react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  QuickAnswers,
  type QuickAnswersSurfaceHandle,
} from "@/features/marketing/seo/value-system/workbench/session/QuickAnswers";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  KEYWORD_QUICK_ANSWERS_SURFACE_NAME,
  createKeywordQuickAnswersScope,
} from "@/features/surfaces/manifests/keyword-quick-answers.manifest";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

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
  const surfaceHandleRef = useRef<QuickAnswersSurfaceHandle | null>(null);
  const surfaceLabel = getSurfaceDisplayLabel(
    KEYWORD_QUICK_ANSWERS_SURFACE_NAME,
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      siteId,
      siteLabel,
      dimensionSlug: slug,
    }),
    [siteId, siteLabel, slug],
  );

  const getScope = () =>
    surfaceHandleRef.current?.getScope() ??
    createKeywordQuickAnswersScope({
      site_summary: { id: siteId, label: siteLabel },
      site_id: siteId,
      site_label: siteLabel ?? undefined,
      dimension_catalog: [],
      active_dimension_slug: slug ?? undefined,
      active_dimension_choices: [],
      current_keywords: [],
      outstanding_keywords: [],
      answered_results: {},
      reason_draft: "",
      answered_this_session: 0,
      seen_keyword_ids: [],
      all_done: false,
      is_loading: true,
      is_saving: false,
      session_progress: {
        answered: 0,
        seen: 0,
        visible: 0,
        outstanding: 0,
        all_done: false,
        loading: true,
        saving: false,
      },
      content: "",
      context: {
        site: { id: siteId, label: siteLabel },
        active_question: { slug, label: null, why: null, choices: [] },
        current_keywords: [],
        outstanding_keyword_ids: [],
        answered_results: {},
      },
    });

  const getWriteHandlers = () => ({
    reason_draft: (value: unknown) => {
      const handle = surfaceHandleRef.current;
      if (!handle) throw new Error("Quick Answers is not ready to edit yet.");
      handle.setReasonDraft(value);
    },
    active_dimension_slug: (value: unknown) => {
      const handle = surfaceHandleRef.current;
      if (!handle) throw new Error("Quick Answers is not ready to move yet.");
      handle.setActiveDimensionSlug(value);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={KEYWORD_QUICK_ANSWERS_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      <WindowPanel
        titleNode={
          <span data-surface-value="site_summary">
            {surfaceLabel}
            {siteLabel ? (
              <span data-surface-value="site_label"> — {siteLabel}</span>
            ) : null}
          </span>
        }
        id="keyword-quick-answers-window"
        overlayId="keywordQuickAnswersWindow"
        minWidth={620}
        minHeight={620}
        width={760}
        height={760}
        position="center"
        onClose={onClose}
        onCollectData={collectData}
      >
        <QuickAnswers
          siteId={siteId}
          siteLabel={siteLabel}
          dimensionSlug={slug}
          onDimensionChange={setSlug}
          surfaceHandleRef={surfaceHandleRef}
        />
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}

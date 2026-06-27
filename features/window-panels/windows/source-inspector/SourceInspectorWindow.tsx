/**
 * features/window-panels/windows/source-inspector/SourceInspectorWindow.tsx
 *
 * Floating WindowPanel around the [SourceInspectorPane](../../../rag/components/source-inspector/SourceInspectorPane.tsx).
 *
 * Opened from any citation surface (RAG source cards, chat citations, search
 * results) to take the user straight to the cited PAGE of the source document
 * and show everything anchored there — the matched chunk, the page's raw + clean
 * extraction, and page-level extractions. A non-blocking window (modals are out
 * by app convention), so the user can keep the chat/answer in view beside it.
 *
 * Mobile: registry sets `mobilePresentation: "fullscreen"`; the pane stacks the
 * viewer above the tabs on narrow viewports (see SourceInspectorPane).
 */

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SourceInspectorPane } from "@/features/rag/components/source-inspector/SourceInspectorPane";

export interface SourceInspectorWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sourceKind?: string | null;
  sourceId?: string | null;
  chunkId?: string | null;
  pageNumber?: number | null;
  pageNumbers?: number[] | null;
  snippet?: string | null;
  fileName?: string | null;
  score?: number | null;
  query?: string | null;
  href?: string | null;
}

export default function SourceInspectorWindow({
  isOpen,
  onClose,
  sourceKind,
  sourceId,
  chunkId,
  pageNumber,
  pageNumbers,
  snippet,
  fileName,
  score,
  query,
  href,
}: SourceInspectorWindowProps) {
  if (!isOpen || !sourceKind || !sourceId) return null;

  return (
    <WindowPanel
      title={fileName ?? "Source inspector"}
      width={1060}
      height={760}
      minWidth={560}
      onClose={onClose}
      overlayId="sourceInspectorWindow"
      onCollectData={() => ({
        sourceKind,
        sourceId,
        chunkId,
        pageNumber,
        pageNumbers,
        snippet,
        fileName,
        score,
        query,
        href,
      })}
    >
      <SourceInspectorPane
        sourceKind={sourceKind}
        sourceId={sourceId}
        chunkId={chunkId ?? null}
        pageNumber={pageNumber ?? null}
        pageNumbers={pageNumbers ?? null}
        snippet={snippet ?? null}
        fileName={fileName ?? null}
        score={score ?? null}
        query={query ?? null}
        href={href ?? null}
      />
    </WindowPanel>
  );
}

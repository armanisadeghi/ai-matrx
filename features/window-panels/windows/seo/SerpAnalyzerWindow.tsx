"use client";

import { useCallback, useRef } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  MetadataAnalyzer,
  type MetadataAnalyzerValues,
} from "@/features/seo/serp/MetadataAnalyzer";

/**
 * SerpAnalyzerWindow — the canonical Metadata Analyzer in a floating window.
 *
 * Open from anywhere with `useOpenSerpAnalyzerWindow({ url, title,
 * description })` (features/overlays/openers/serpAnalyzerWindow.tsx) to push a
 * page's metadata into the full analyzer: inputs, deterministic pixel/char
 * analysis, Google chrome + desktop + mobile SERP previews, recommendations.
 *
 * Sized so the two-column layout (inputs+analysis | previews) is fully
 * visible when the screen allows; the analyzer's container queries stack it
 * gracefully when the user shrinks the window.
 */
export interface SerpAnalyzerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  initialTitle?: string;
  initialDescription?: string;
}

export default function SerpAnalyzerWindow({
  isOpen,
  onClose,
  initialUrl,
  initialTitle,
  initialDescription,
}: SerpAnalyzerWindowProps) {
  if (!isOpen) return null;
  return (
    <SerpAnalyzerWindowInner
      onClose={onClose}
      initialUrl={initialUrl}
      initialTitle={initialTitle}
      initialDescription={initialDescription}
    />
  );
}

function SerpAnalyzerWindowInner({
  onClose,
  initialUrl,
  initialTitle,
  initialDescription,
}: Omit<SerpAnalyzerWindowProps, "isOpen">) {
  // Live values mirror for persistence — a ref (not state) because the window
  // shell doesn't need to re-render on every keystroke inside the analyzer.
  const valuesRef = useRef<MetadataAnalyzerValues>({
    url: initialUrl ?? "",
    title: initialTitle ?? "",
    description: initialDescription ?? "",
  });

  const handleValuesChange = useCallback((values: MetadataAnalyzerValues) => {
    valuesRef.current = values;
  }, []);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      url: valuesRef.current.url,
      title: valuesRef.current.title,
      description: valuesRef.current.description,
    }),
    [],
  );

  return (
    <WindowPanel
      id="serp-analyzer-window"
      overlayId="serpAnalyzerWindow"
      title="Search Appearance"
      onClose={onClose}
      width={1360}
      height={900}
      minWidth={560}
      minHeight={480}
      position="center"
      urlSyncKey="serp_analyzer"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
    >
      <MetadataAnalyzer
        initialUrl={initialUrl}
        initialTitle={initialTitle}
        initialDescription={initialDescription}
        onValuesChange={handleValuesChange}
      />
    </WindowPanel>
  );
}

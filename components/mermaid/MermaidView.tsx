"use client";

/**
 * Thin chrome-free views over MermaidRenderer (no card, no toolbar):
 *
 *  - MermaidView          — Redux-connected: user preferences + app theme,
 *                           with per-artifact metadata overrides. For app
 *                           surfaces (artifact wrapper, canvas, demos).
 *  - StandaloneMermaidView — Zero Redux: defaults + DOM dark-mode detection.
 *                           For public share pages whose tree has no store.
 */

import React, { useEffect, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectMermaidPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";

import { MermaidRenderer } from "./MermaidRenderer";
import {
  DEFAULT_MERMAID_PREFERENCES,
  resolveMermaidTheme,
  type MermaidArtifactMetadata,
} from "./types";

interface MermaidViewProps {
  source: string;
  /** Per-artifact overrides (canvas_items.content.metadata shape). */
  metadata?: MermaidArtifactMetadata | null;
  isStreamActive?: boolean;
  className?: string;
  hideViewportControls?: boolean;
  onSvgMounted?: (el: SVGSVGElement | null) => void;
  /** Px cap on the diagram frame height (inline/chat). See MermaidViewport. */
  viewportMaxHeight?: number;
  /** Frame fills its parent's height (canvas workbench, fullscreen). */
  fillHeight?: boolean;
}

export function MermaidView({
  source,
  metadata,
  isStreamActive,
  className,
  hideViewportControls,
  onSvgMounted,
  viewportMaxHeight,
  fillHeight,
}: MermaidViewProps) {
  const prefs = useAppSelector(selectMermaidPreferences);
  const appMode = useAppSelector((state) => state.theme.mode);

  const options = {
    theme: resolveMermaidTheme(metadata?.theme ?? prefs.theme, appMode),
    look: metadata?.look ?? prefs.look,
    layout: metadata?.layout ?? prefs.layout,
  };

  return (
    <MermaidRenderer
      source={source}
      options={options}
      isStreamActive={isStreamActive}
      className={className}
      hideViewportControls={hideViewportControls}
      onSvgMounted={onSvgMounted}
      viewportMaxHeight={viewportMaxHeight}
      fillHeight={fillHeight}
    />
  );
}

/** Reactively tracks the `.dark` class on <html> (theme pre-paint target). */
function useDomDarkMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">("light");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setMode(root.classList.contains("dark") ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

export function StandaloneMermaidView({
  source,
  metadata,
  className,
  viewportMaxHeight,
  fillHeight,
}: Pick<MermaidViewProps, "source" | "metadata" | "className" | "viewportMaxHeight" | "fillHeight">) {
  const mode = useDomDarkMode();
  const options = {
    theme: resolveMermaidTheme(metadata?.theme ?? DEFAULT_MERMAID_PREFERENCES.theme, mode),
    look: metadata?.look ?? DEFAULT_MERMAID_PREFERENCES.look,
    layout: metadata?.layout ?? DEFAULT_MERMAID_PREFERENCES.layout,
  };
  return (
    <MermaidRenderer
      source={source}
      options={options}
      className={className}
      viewportMaxHeight={viewportMaxHeight}
      fillHeight={fillHeight}
    />
  );
}

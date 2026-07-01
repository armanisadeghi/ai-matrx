"use client";

/**
 * Thin chrome-free views over MermaidRenderer (no card, no toolbar):
 *
 *  - MermaidView          — Redux-connected: user preferences + app theme,
 *                           with per-artifact metadata overrides. For app
 *                           surfaces (artifact wrapper, canvas, demos).
 *  - StandaloneMermaidView — Defaults + painted DOM theme via useThemeMode().
 *                           For public share pages whose tree has no store.
 */

import React from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectMermaidPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { useThemeMode } from "@/styles/themes/useThemeMode";

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
  const appMode = useThemeMode();

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

export function StandaloneMermaidView({
  source,
  metadata,
  className,
  viewportMaxHeight,
  fillHeight,
}: Pick<MermaidViewProps, "source" | "metadata" | "className" | "viewportMaxHeight" | "fillHeight">) {
  const mode = useThemeMode();
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

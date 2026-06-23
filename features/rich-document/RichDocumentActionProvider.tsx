"use client";

// features/rich-document/RichDocumentActionProvider.tsx
//
// Headless sibling of RichDocument: registers the full RichDocument action
// toolkit for a `surfaceId` WITHOUT rendering the MarkdownStream engine. Renders
// null. Pair it with a <RichDocumentActionSurface surfaceId={...}/> placed
// wherever the actions should appear (a header, a toolbar).
//
// WHY THIS EXISTS: RichDocument couples actions to the content engine — it both
// renders the markdown AND offers the toolbar. Surfaces that draw their OWN
// content (the working document, code editors, any custom editor) still want
// the same copy / save-to-notes/task / html / email / print / TTS / edit
// toolkit, and want it available in EVERY view mode (plain, split, wysiwyg,
// preview), not just the one mode that happens to mount a RichDocument. This
// provider gives them exactly that: one always-mounted registration, content
// fed in as a prop, actions rendered remotely.
//
// It shares `useActionSurfaceProvider` with RichDocument, so the action set,
// the no-functions-in-Redux invariant, and the live-content bridge behave
// identically — there is no second implementation to drift.

import * as React from "react";
import { useActionSurfaceProvider } from "./runtime/useActionSurfaceProvider";
import type {
  ContentSource,
  RichDocumentActionsProp,
} from "./types";

export interface RichDocumentActionProviderProps {
  /** Live content the actions operate on (re-read at click time via the bridge). */
  content: string;
  /** Source identity — drives action visibility + save-to-task parent linking. */
  source: ContentSource;
  /** The surface a <RichDocumentActionSurface/> consumes. Required. */
  surfaceId: string;
  /** Trim/extend the action set + supply host callbacks (same shape as RichDocument). */
  actions?: RichDocumentActionsProp;
}

/**
 * Registers a remote RichDocument action provider for `surfaceId`. Renders
 * nothing. See the file header for when to reach for this over RichDocument.
 */
export function RichDocumentActionProvider(
  props: RichDocumentActionProviderProps,
): React.ReactElement | null {
  const { content, source, surfaceId, actions } = props;

  useActionSurfaceProvider({
    content,
    source,
    actions,
    actionsVariant: "remote",
    actionsSurfaceId: surfaceId,
  });

  return null;
}

export default RichDocumentActionProvider;

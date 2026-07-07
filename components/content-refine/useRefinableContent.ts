"use client";

// useRefinableContent — canonical transform pipeline for "take a blob of
// content and let the user refine it before saving somewhere".
//
// Owns: strip-thinking toggle, start/end trim, free-text edit override, and
// the derived working content. Pure content state — no persistence, no
// destination knowledge. Pair with <RefinableContentEditor> for the standard
// toolbar + trim sliders + editor UI, and keep save/target state in the
// consuming feature's own hook (see useQuickNoteSave for the reference).

import { useMemo, useState } from "react";
import {
  stripThinking,
  hasThinkingTags,
} from "@/components/content-refine/utils/stripThinking";
import { applyTrim } from "@/components/content-refine/utils/trimContent";

export interface UseRefinableContentArgs {
  initialContent: string;
}

export interface RefinableContent {
  /** Coerced-to-string source content (transforms always derive from this). */
  initialContent: string;
  /** Content after transforms + any user edit — what consumers should save. */
  workingContent: string;
  /** User-edit override. `null` = derive from transforms; string = edited. */
  setEditedContent: (value: string | null) => void;
  stripThinkingEnabled: boolean;
  setStripThinkingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  canStripThinking: boolean;
  trimStart: number;
  setTrimStart: (value: number) => void;
  trimEnd: number;
  setTrimEnd: (value: number) => void;
  /** Trim sliders operate on the original content length. */
  maxTrim: number;
  /** Reset every transform + edit override back to the raw source. */
  resetTransforms: () => void;
  /**
   * Changes whenever a transform invalidates in-editor state — feed to the
   * editor's `resetKey` (append your own suffix for external resets).
   */
  resetKey: string;
  rawLength: number;
  charCount: number;
}

export function useRefinableContent({
  initialContent: rawInitialContent,
}: UseRefinableContentArgs): RefinableContent {
  // Coerce at the boundary — a null/undefined leak from overlay data or stale
  // props would crash every `.length` / `.trim()` / `.slice()` below.
  const initialContent =
    typeof rawInitialContent === "string" ? rawInitialContent : "";

  const [stripThinkingEnabled, setStripThinkingEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // A user edit is stored WITH the transform snapshot it was made against.
  // When any transform (or the source) changes, the stored edit no longer
  // matches and is ignored — invalidation happens by derivation, not by a
  // setState-in-effect reset.
  const [edited, setEdited] = useState<{
    value: string;
    src: string;
    strip: boolean;
    ts: number;
    te: number;
  } | null>(null);

  // Trim applies to the raw input first; strip-thinking then operates on the
  // trimmed slice.
  const basePostTransform = useMemo(() => {
    const trimmed = applyTrim(initialContent, trimStart, trimEnd);
    return stripThinkingEnabled ? stripThinking(trimmed) : trimmed;
  }, [initialContent, stripThinkingEnabled, trimStart, trimEnd]);

  const editActive =
    edited !== null &&
    edited.src === initialContent &&
    edited.strip === stripThinkingEnabled &&
    edited.ts === trimStart &&
    edited.te === trimEnd;

  const workingContent = editActive ? edited.value : basePostTransform;

  const setEditedContent = (value: string | null) => {
    setEdited(
      value == null
        ? null
        : {
            value,
            src: initialContent,
            strip: stripThinkingEnabled,
            ts: trimStart,
            te: trimEnd,
          },
    );
  };

  const resetTransforms = () => {
    setStripThinkingEnabled(false);
    setTrimStart(0);
    setTrimEnd(0);
    setEdited(null);
  };

  return {
    initialContent,
    workingContent,
    setEditedContent,
    stripThinkingEnabled,
    setStripThinkingEnabled,
    canStripThinking: hasThinkingTags(initialContent),
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    maxTrim: initialContent.length,
    resetTransforms,
    resetKey: `${stripThinkingEnabled}:${trimStart}:${trimEnd}`,
    rawLength: initialContent.length,
    charCount: workingContent.length,
  };
}

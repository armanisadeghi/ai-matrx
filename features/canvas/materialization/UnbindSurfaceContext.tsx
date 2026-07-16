"use client";

/**
 * UnbindSurfaceContext — how a NON-CHAT surface (notes, transcripts, tasks)
 * gives its rendered artifact refs an unbind ("Detach as text") path.
 *
 * Chat needs no provider: `useUnbindArtifact` derives the message content +
 * `cx_message_set_content` rewriter from `messageId`/`conversationId`. Any
 * other surface that renders artifact refs through MarkdownStream wraps its
 * render tree in this provider, supplying its OWN canonical content reader +
 * rewrite writer (never a parallel write path — notes go through
 * updateNoteContent + saveNote, exactly like content cleanup).
 */

import { createContext } from "react";
import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import type { PersistRewrite } from "./materializeBlocks";

export interface UnbindSurface {
  /** Live committed content of the source record, as content blocks. */
  getContent: () => CxContentBlock[] | null;
  /** The surface's canonical rewrite writer (all-or-nothing). */
  persistRewrite: PersistRewrite;
  /** Human word for the surface in confirm copy ("note", "message"). */
  surfaceNoun: string;
}

export const UnbindSurfaceContext = createContext<UnbindSurface | null>(null);

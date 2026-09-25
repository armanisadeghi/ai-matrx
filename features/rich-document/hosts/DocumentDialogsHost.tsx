"use client";

// features/rich-document/hosts/DocumentDialogsHost.tsx
//
// The host half of the registry actions whose dialog must OUTLIVE the menu
// that asked: convert-to-study (the ONE convert-source dialog), save a table
// as a data table (the canonical SaveTableModal a rendered table opens), and
// save as flashcard (the reader writes the question; the passage is the
// answer). The actions only ask through `ctx.callbacks`; the SURFACE owns the
// dialogs — RichDocument for every document, the chat bars for a chat turn.
// Every dialog is code-split and mounted only after its first request.

import * as React from "react";
import dynamic from "next/dynamic";
import type { ConvertOrigin } from "@/features/education/convert/ConvertContentDialog";
import type { ContentSource, RichDocumentActionContextCallbacks } from "../types";

// ONE dynamic edge for all three dialogs (the Fragmentation Law — a set that
// belongs to one surface compiles as one piece behind one front door), mounted
// only after the first request.
const DocumentDialogsImpl = dynamic(() => import("./DocumentDialogsImpl"), {
  ssr: false,
  loading: () => null,
});

/**
 * The lineage origin a converted artifact points back at. Null when the
 * source has no registered entity to link — convert is then absent there.
 */
export function convertOriginForSource(
  source: ContentSource,
  title: string,
): ConvertOrigin | null {
  switch (source.type) {
    case "chat-message":
      return {
        kind: "paste",
        entityType: "conversation",
        entityId: source.conversationId,
        title,
      };
    case "note":
      return { kind: "note", entityType: "note", entityId: source.noteId, title };
    default:
      return null;
  }
}

export interface DocumentDialogsHost {
  /** Merge into the actions' `callbacks`; a key is absent when unsupported. */
  callbacks: Pick<
    RichDocumentActionContextCallbacks,
    "onRequestConvert" | "onRequestSaveTable" | "onRequestFlashcard"
  >;
  /** Render once, anywhere in the host's tree. */
  dialogs: React.ReactNode;
}

export function useDocumentDialogsHost(args: {
  /** Lineage origin for convert; null leaves convert absent. */
  convertOrigin: ConvertOrigin | null;
  text: string;
}): DocumentDialogsHost {
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [convertMounted, setConvertMounted] = React.useState(false);
  const [table, setTable] = React.useState<
    { headers: string[]; rows: string[][] } | null
  >(null);
  const [cardAnswer, setCardAnswer] = React.useState<string | null>(null);

  const origin = args.convertOrigin;
  return {
    callbacks: {
      onRequestConvert: origin
        ? () => {
            setConvertMounted(true);
            setConvertOpen(true);
          }
        : undefined,
      onRequestSaveTable: (t) => setTable(t),
      onRequestFlashcard: (answer) => setCardAnswer(answer),
    },
    dialogs:
      (origin && convertMounted) || table || cardAnswer !== null ? (
        <DocumentDialogsImpl
          convert={
            origin && convertMounted
              ? { origin, text: args.text, open: convertOpen, onOpenChange: setConvertOpen }
              : null
          }
          table={table}
          onTableClose={() => setTable(null)}
          cardAnswer={cardAnswer}
          onCardClose={() => setCardAnswer(null)}
        />
      ) : null,
  };
}

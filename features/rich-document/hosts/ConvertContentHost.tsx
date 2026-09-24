"use client";

// features/rich-document/hosts/ConvertContentHost.tsx
//
// The host half of the registry's `convert-to-study` action. The action only
// asks (`ctx.callbacks.onRequestConvert`); the dialog must outlive the menu
// that asked, so the SURFACE owns it — RichDocument for every document, the
// chat bar for a chat turn. One hook, one dynamic edge (the education convert
// stack is heavy: entitlement guard + compliance gate + eight generator rows),
// mounted only after the first request — nothing is fetched until a reader
// actually converts.

import * as React from "react";
import dynamic from "next/dynamic";
import type { ConvertOrigin } from "@/features/education/convert/ConvertContentDialog";
import type { ContentSource } from "../types";

const ConvertContentDialog = dynamic(
  () =>
    import("@/features/education/convert/ConvertContentDialog").then(
      (m) => m.ConvertContentDialog,
    ),
  { ssr: false, loading: () => null },
);

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

export interface ConvertContentHost {
  /** Pass as `callbacks.onRequestConvert`; undefined when there is no origin. */
  onRequestConvert: (() => void) | undefined;
  /** Render once, anywhere in the host's tree. */
  dialog: React.ReactNode;
}

export function useConvertContentHost(args: {
  origin: ConvertOrigin | null;
  text: string;
}): ConvertContentHost {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  if (!args.origin) return { onRequestConvert: undefined, dialog: null };
  return {
    onRequestConvert: () => {
      setMounted(true);
      setOpen(true);
    },
    dialog: mounted ? (
      <ConvertContentDialog
        open={open}
        onOpenChange={setOpen}
        origin={args.origin}
        text={args.text}
      />
    ) : null,
  };
}

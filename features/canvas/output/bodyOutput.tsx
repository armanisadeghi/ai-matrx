"use client";

/**
 * A live body's rendered output, offered to the canvas tab it sits in. Bodies
 * deep inside an artifact tab (a cloud browser's latest screenshot, a document
 * editor's live text) know what to print and capture; the tab
 * (ArtifactCanvasView) knows its item id. The tab provides this context and
 * forwards the body's handlers to `useCanvasOutput`; outside a canvas tab
 * (the same body on its own page or in chat) the hook does nothing.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useCanvasOutput, type CanvasOutputHandlers } from "@ai-matrx/canvas/react";

type Holder = { current: CanvasOutputHandlers };

const BodyOutputContext = createContext<Holder | null>(null);

/** Wraps an artifact tab's body; the body's offers reach the pane menu of `itemId`. */
export function ArtifactBodyOutputProvider({ itemId, children }: { itemId: string; children: ReactNode }) {
  const holder = useRef<CanvasOutputHandlers>({});
  // Read through getters each time the menu opens — always the body's latest offer.
  const forwarded = useRef<CanvasOutputHandlers>({
    get print() {
      return holder.current.print;
    },
    get savePdf() {
      return holder.current.savePdf;
    },
    get capture() {
      return holder.current.capture;
    },
    get unavailable() {
      return holder.current.unavailable;
    },
  });
  useCanvasOutput(itemId, forwarded.current);
  return <BodyOutputContext.Provider value={holder}>{children}</BodyOutputContext.Provider>;
}

/** A body offers print / capture (or an honest reason it cannot right now) to its canvas tab. */
export function useArtifactBodyOutput(handlers: CanvasOutputHandlers): void {
  const holder = useContext(BodyOutputContext);
  useEffect(() => {
    if (!holder) return undefined;
    holder.current = handlers;
  });
  useEffect(() => {
    if (!holder) return undefined;
    return () => {
      holder.current = {};
    };
  }, [holder]);
}

"use client";

/**
 * host/markdown-slots — the app's rich-document rendering engine, registered into the package
 * (chat-package-move P14).
 *
 * `MarkdownStream` and `BasicMarkdownContent` are the host's ONE rendering pipeline (block
 * registry, kind routing, code highlighting, app-owned blocks that read app data). The package
 * draws through these slots and never imports that engine. The app registers them in
 * `providers/chatMarkdownRegistration.ts`; a bare host shows the text exactly as written,
 * marked `data-chat-slot-fallback`, and the missing renderer is reported once (Law 4).
 *
 * The slot names extend `ChatUiSlots` by augmentation, so `registerChatUi` accepts them.
 */

import { createElement, type ComponentType } from "react";
import { hostFn, hostSlot } from "./ui-slots";
import type { MessageCitationSource } from "../agents/redux/execution-system/messages/message-citations";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The engine's props the package's call sites rely on being typed; the rest pass through as written. */
export interface MarkdownStreamSlotProps {
  content?: string;
  className?: string;
  /** `previousContent` is the text the edit applied to; `remark` names an answer edit. */
  onContentChange?: (newContent: string, previousContent: string, remark?: any) => void;
  [prop: string]: any;
}

declare module "./ui-slots" {
  interface ChatUiSlots {
    /** The streaming rich-document engine (the host's `MarkdownStream`), same props. */
    MarkdownStream: ComponentType<MarkdownStreamSlotProps>;
    /** The host's plain markdown leaf (`BasicMarkdownContent`), same props. */
    BasicMarkdownContent: ComponentType<any>;
    /** The placeholder while a spoken answer's audio is being made. */
    AudioOutputBlockSkeleton: ComponentType<any>;
    /** Opens one numbered message source (the host's Source Inspector): returns `(source) => void`. */
    useOpenCitationSource: () => (source: MessageCitationSource) => void;
    /** Draws every mermaid diagram under a root (print / DOM capture); resolves when done. */
    renderAllDiagrams: (...args: any[]) => Promise<{ release: () => void }>;
    /** One mermaid source drawn for print (SVG markup), the host's lazy diagram engine. */
    drawMermaidForPrint: (...args: any[]) => Promise<any>;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The text as written, marked as the stand-in: never a blank, never a guess at formatting. */
function plainText(name: string) {
  const PlainText = ({ content, className }: { content?: unknown; className?: string }) =>
    createElement(
      "div",
      { className: `whitespace-pre-wrap break-words text-sm ${className ?? ""}`, "data-chat-slot-fallback": name },
      typeof content === "string" ? content : "",
    );
  PlainText.displayName = `PlainText(${name})`;
  return PlainText;
}

export const MarkdownStream = hostSlot("MarkdownStream", plainText("MarkdownStream"));
export const BasicMarkdownContent = hostSlot("BasicMarkdownContent", plainText("BasicMarkdownContent"));
/** A host with no audio placeholder shows nothing while the audio is made (reported once). */
export const AudioOutputBlockSkeleton = hostSlot("AudioOutputBlockSkeleton");

/** A host with no Source Inspector opens a web source in a new tab; a file source has no target here. */
export const useOpenCitationSource = hostFn("useOpenCitationSource", () => (source: MessageCitationSource) => {
  if (source.url && typeof window !== "undefined") window.open(source.url, "_blank", "noopener,noreferrer");
});

/** A host with no diagram engine draws nothing extra: diagrams stay as drawn (or as source). */
export const renderAllDiagrams = hostFn("renderAllDiagrams", async () => ({ release: () => undefined }));
/** A host with no diagram engine cannot draw for print; the print path prints the source and says so. */
export const drawMermaidForPrint = hostFn("drawMermaidForPrint", async () => {
  throw new Error("This host has no diagram engine (registerChatUi drawMermaidForPrint)");
});

export default MarkdownStream;

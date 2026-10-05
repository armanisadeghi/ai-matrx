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
import { hostSlot } from "./ui-slots";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "./ui-slots" {
  interface ChatUiSlots {
    /** The streaming rich-document engine (the host's `MarkdownStream`), same props. */
    MarkdownStream: ComponentType<any>;
    /** The host's plain markdown leaf (`BasicMarkdownContent`), same props. */
    BasicMarkdownContent: ComponentType<any>;
    /** The placeholder while a spoken answer's audio is being made. */
    AudioOutputBlockSkeleton: ComponentType<any>;
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

export default MarkdownStream;

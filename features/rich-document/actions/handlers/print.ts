// features/rich-document/actions/handlers/print.ts
//
// Print / PDF actions. `print` is source-agnostic; `full-print` requires
// the host to wire an `onFullPrint` callback (full-page render that
// includes all blocks, currently a chat-specific renderer feature).

import { Printer, ScanLine } from "lucide-react";
import { printMarkdownContent } from "@ai-matrx/chat/conversation/utils/markdown-print";
import { hasContentActions } from "@ai-matrx/rich-content/copy/content-view-store";
import { registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { contentForDestination } from "../utils";

registerAction({
  id: "print",
  label: "Print / Save PDF",
  icon: Printer,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  // The ContentActions set in this item's bar already shows it — once per surface.
  visible: (ctx) => !hasContentActions(ctx.instanceKey("alchemy")),
  order: 10,
  run: (ctx) => {
    const title =
      ctx.source.type === "note"
        ? "Note"
        : ctx.source.type === "chat-message"
          ? "Message"
          : ctx.source.type === "prompt-result"
            ? "Prompt result"
            : ctx.source.type === "artifact"
              ? "Artifact"
              : ctx.source.type === "scraper-result"
                ? "Scraper result"
                : "Content";
    printMarkdownContent(contentForDestination(ctx), title);
  },
});

registerAction({
  id: "full-print",
  label: (ctx) => {
    const ext =
      ctx.extensions?.type === "chat-message"
        ? ctx.extensions
        : null;
    return ext?.isCapturing ? "Generating PDF…" : "Full Print (all blocks)";
  },
  icon: ScanLine,
  iconColor: "text-slate-600 dark:text-slate-300",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 11,
  visible: (ctx) => {
    if (!ctx.callbacks?.onFullPrint) return false;
    if (ctx.extensions?.type === "chat-message") {
      return ctx.extensions.showFullPrint;
    }
    // Non-chat hosts can opt in by providing onFullPrint without the chat
    // extension — assume they meant it.
    return true;
  },
  disabled: (ctx) => {
    if (ctx.extensions?.type === "chat-message" && ctx.extensions.isCapturing) {
      return { reason: "PDF generation in progress" };
    }
    return false;
  },
  run: (ctx) => {
    const isCapturing =
      ctx.extensions?.type === "chat-message"
        ? ctx.extensions.isCapturing
        : false;
    if (!isCapturing) {
      ctx.callbacks?.onFullPrint?.();
    }
  },
});

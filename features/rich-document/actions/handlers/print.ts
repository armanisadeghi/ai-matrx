// features/rich-document/actions/handlers/print.ts
//
// Print / PDF actions. `print` is source-agnostic; `full-print` requires
// the host to wire an `onFullPrint` callback (full-page render that
// includes all blocks, currently a chat-specific renderer feature).

import { Printer, ScanLine } from "lucide-react";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";
import { registerAction } from "../registry";

registerAction({
  id: "print",
  label: "Print / Save PDF",
  icon: Printer,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
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
    printMarkdownContent(ctx.content, title);
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

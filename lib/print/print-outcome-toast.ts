/**
 * notifyPrintOutcome — the ONE host-side handler for @ai-matrx/print's
 * PrintOutcome.
 *
 * When a print surface's popup is blocked, the package downloads the print
 * document as an .html file instead (the contract's fallback) and reports
 * "downloaded". Without this toast that fallback is indistinguishable from
 * "nothing happened" — exactly how QA filed F5/F6/F8 on 2026-08-30 (silent
 * no-output on chat print, flashcards, and commerce labels in an automated
 * browser that blocked the popup AND swallowed the download).
 *
 * Every print call site passes its outcome here: the PrintOptionsDialog /
 * usePrintOptions `onPrinted` prop, or the direct return value of
 * printMarkdownContent / printQrLabelSheet / openPrintWindow.
 */
import type { PrintOutcome } from "@ai-matrx/print";
import { toast } from "@/lib/toast";

export function notifyPrintOutcome(outcome: void | PrintOutcome): void {
  if (outcome !== "downloaded") return;
  toast.info("Print window was blocked — downloaded the print file instead", {
    description:
      "Your browser blocked the pop-up, so the printable page was saved as an .html download. Open it and print from there, or allow pop-ups for this site.",
  });
}

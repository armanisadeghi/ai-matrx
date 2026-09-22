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

/**
 * THE ONE SOURCE OF TRUTH for the words this fallback says. Every suite that
 * pins this toast — the unit test here and the whole-path Chat print test in
 * `features/conversation/utils/markdown-print.test.ts` — asserts against these
 * two constants, so the sentence exists in exactly one place and a copy change
 * cannot leave one surface saying something else.
 *
 * The title states what actually happened (a screen never lies) and the
 * description names the remedy, in that order and in that many words: the copy
 * sweep of 2026-09-20 shortened the description from a sentence that repeated
 * the title back at the reader.
 */
export const PRINT_BLOCKED_TOAST = {
  title: "Print window was blocked — downloaded the print file instead",
  description: "Open the downloaded file to print it, or allow pop-ups for this site.",
} as const;

export function notifyPrintOutcome(outcome: void | PrintOutcome): void {
  if (outcome !== "downloaded") return;
  toast.info(PRINT_BLOCKED_TOAST.title, {
    description: PRINT_BLOCKED_TOAST.description,
  });
}

"use client";

// features/agents/components/inputs/smart-input/ComposerChip.tsx
//
// A SUGGESTED-REPLY CHIP THAT LEAVES YOU ABLE TO SEND.
//
// 🚨 THE DEFECT (Masterwork cold walk 5, finding 6b, 2026-09-16). In the
// Conductor ("Build with me"), clicking the `Build it` chip filled the composer
// with the real message — and then nothing worked. Enter did not send it.
// Clicking the chip again did not send it. The ONLY thing that sent the message
// was hunting for the round send-arrow with the mouse.
//
// The state was never the problem: the text was really in the composer. FOCUS
// was. A native `<button>` takes focus on mousedown, so after the click the
// focused element was the chip, not the textarea — and the Enter keystroke was
// delivered to the button, where it fires a synthetic click (re-staging the same
// text, a no-op) instead of reaching the composer's own key handler. Every
// suggested-reply UI worth copying — Slack, Linear, Superhuman — solves this the
// same two ways, and this component does both:
//
//   1. It does not STEAL focus: `mousedown` is prevented, so a caret already in
//      the composer never leaves it.
//   2. It PUTS focus back: after staging, the marked composer input is focused
//      with the caret at the end, so the next keystroke — including Enter —
//      goes where the person is looking.
//
// Any surface that offers a chip which fills the composer uses THIS, never its
// own `<button onClick={stage}>`: a chip that fills a box you then cannot send
// from is the same defect wherever it is re-typed.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The attribute `AgentTextarea` stamps on the real composer input. */
export const AGENT_MAIN_INPUT_ATTR = "data-agent-main-input";

/**
 * Put the caret back in the agent composer. Returns false — honestly — when
 * there is no composer on screen to focus, so a caller can say so rather than
 * assume it worked.
 */
export function focusAgentComposer(root: ParentNode | null = null): boolean {
  const scope: ParentNode | null =
    root ?? (typeof document === "undefined" ? null : document);
  if (!scope) return false;
  const input = scope.querySelector<HTMLTextAreaElement | HTMLInputElement>(
    `[${AGENT_MAIN_INPUT_ATTR}]`,
  );
  if (!input) return false;
  input.focus();
  try {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  } catch {
    // Some input types refuse a selection range; the focus is what matters.
  }
  return true;
}

export function ComposerChip({
  label,
  onStage,
  title = "Puts the request in the message box — you can edit it before sending.",
  className,
}: {
  label: ReactNode;
  /** Stage the text. Called before focus returns to the composer. */
  onStage: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      // 1. Never steal the caret out of the composer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onStage();
        // 2. Put it back, so Enter sends what the chip just wrote.
        focusAgentComposer();
      }}
      className={cn(
        "rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
        className,
      )}
      title={title}
    >
      {label}
    </button>
  );
}

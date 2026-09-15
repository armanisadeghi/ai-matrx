/**
 * GatedActionButton — a primary action that is never dead.
 *
 * ## The wall this closes (2026-09-15, `teach-recent-practitioner` W2)
 *
 * A non-technical Expert reached the payoff moment of the whole product — the
 * "Build the Masterwork" button — and it was **silently disabled**. No red
 * text, no tooltip, no validation message, no console error. Clicking it did
 * nothing, twice, by ref and by coordinate. The reason was one empty required
 * field whose placeholder read like a real value, so the screen told the user
 * everything was filled in and then refused to move.
 *
 * That is a LAW 4 violation — *nothing fails silently; a screen is absent or
 * honest, never dead, disabled-looking, or wearing a false state.* A disabled
 * button that says nothing is a screen telling a lie.
 *
 * ## The contract
 *
 * A gated action takes a `reason`, not a boolean. When a reason is present the
 * button is disabled AND the reason is rendered beside it, in plain words a
 * non-technical person can act on ("Name your Masterwork to build it"), wired
 * to the button by `aria-describedby` so a screen reader gets it too. When
 * there is no reason, the button is a normal `<Button>` and renders no chrome.
 *
 * **`disabled` for a reason that is not a blocker is still allowed** — a
 * button already running its own action (`disabled={running}` with the label
 * "Building…") is honest about itself, so it needs no sentence. Use `reason`
 * for every state where the user must DO something first.
 *
 * ## Usage
 *
 * ```tsx
 * <GatedActionButton
 *   reason={firstBlockingReason([
 *     { when: !name.trim(), reason: "Name your Masterwork to build it" },
 *     { when: approved === 0, reason: "Approve at least one rule to build it" },
 *   ])}
 *   disabled={running}
 *   onClick={build}
 * >
 *   Build the Masterwork
 * </GatedActionButton>
 * ```
 *
 * `firstBlockingReason` returns the FIRST unmet check, so order the list the
 * way you want the user to fix things: one sentence at a time, never a wall of
 * validation errors.
 *
 * @official-component
 */

"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One reason an action cannot fire yet, and the condition that makes it true. */
export interface BlockingCheck {
  /** True when this check is currently blocking the action. */
  when: boolean;
  /**
   * What the user must do, in plain words, phrased as an instruction — not a
   * validation complaint. "Name your Masterwork to build it", never
   * "name is required".
   */
  reason: string;
}

/**
 * The first blocking reason in the list, or `null` when nothing blocks.
 *
 * Order the checks in the order you want the user to fix them. Returning ONE
 * reason is deliberate: a non-technical person acts on a single next step, not
 * on a list of everything wrong at once.
 */
export function firstBlockingReason(
  checks: ReadonlyArray<BlockingCheck | null | undefined | false>,
): string | null {
  for (const check of checks) {
    if (check && check.when) return check.reason;
  }
  return null;
}

export interface GatedActionButtonProps extends ButtonProps {
  /**
   * Why this action cannot fire yet. When set, the button is disabled and this
   * sentence is rendered next to it. `null`/`undefined` means nothing blocks.
   */
  reason?: string | null;
  /** Layout escape hatch for the wrapper that holds the reason and the button. */
  wrapperClassName?: string;
  /** Layout escape hatch for the reason text itself (e.g. `max-w-[16rem]`). */
  reasonClassName?: string;
}

/**
 * @see {@link GatedActionButtonProps} for the full prop contract.
 */
export function GatedActionButton({
  reason,
  wrapperClassName,
  reasonClassName,
  disabled,
  title,
  children,
  ...buttonProps
}: GatedActionButtonProps) {
  const reactId = React.useId();
  const blocked = Boolean(reason && reason.trim());
  const reasonId = `gated-action-reason-${reactId}`;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center justify-end gap-2",
        wrapperClassName,
      )}
    >
      {blocked ? (
        <span
          id={reasonId}
          role="status"
          data-slot="gated-action-reason"
          className={cn(
            "min-w-0 text-xs font-medium text-destructive",
            reasonClassName,
          )}
        >
          {reason}
        </span>
      ) : null}
      <Button
        {...buttonProps}
        disabled={disabled || blocked}
        title={blocked ? (reason ?? undefined) : title}
        aria-describedby={blocked ? reasonId : buttonProps["aria-describedby"]}
      >
        {children}
      </Button>
    </span>
  );
}

GatedActionButton.displayName = "GatedActionButton";

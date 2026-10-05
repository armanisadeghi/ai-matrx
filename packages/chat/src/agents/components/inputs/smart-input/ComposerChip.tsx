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

import type {
  ButtonHTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  Ref,
} from "react";
import { Loader2, X } from "lucide-react";

import { cn } from "@ai-matrx/design-system";

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

// ── THE composer chip (Arman, 2026-10-05: ONE version of anything) ─────────
//
// Every chip the Smart Agent Input draws — rail pills, attachment chips
// (resources, documents, the pending document), connection chips, repo chips,
// the Cloud chip, the connect promo, the "+N" overflow, shape picks and the
// suggested-reply chip — is THIS component. One 24px height, one 6px radius,
// one 12px/500 label, 14px glyphs, 6px inner gap, one hover / open / pressed
// face. A call site passes meaning (tone, pressed, busy, remove, parts) and
// placement classes, never a face of its own.
//
// Why not `Chip` from @ai-matrx/design-system: it takes a string label only,
// has no remove control, no second segment and no trailing slot, so the
// attachment and connection chips could not ride it.

export type ComposerChipTone = "neutral" | "quiet" | "primary" | "warning";

const CHIP_GEOMETRY =
  "inline-flex h-6 min-w-0 shrink-0 items-center rounded-md border text-xs font-medium transition-colors";

const CHIP_TONE: Record<ComposerChipTone, string> = {
  neutral: "border-border bg-card text-foreground",
  quiet: "border-border bg-card text-muted-foreground",
  primary: "border-primary/30 bg-primary/5 text-foreground [&_svg]:text-primary",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const PART_HOVER: Record<ComposerChipTone, string> = {
  neutral: "hover:bg-accent",
  quiet: "hover:bg-accent hover:text-foreground",
  primary: "hover:bg-primary/10",
  warning: "hover:bg-amber-500/20",
};

// A 24px chip is too small to hit on a phone: on a coarse pointer every press
// target grows an unseen 44px-tall hit box without adding a pixel of height.
const TOUCH_HIT_BOX =
  "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-['']";

const PART_CONTENT = cn(
  "inline-flex h-full min-w-0 items-center gap-1.5 px-2 [&>svg]:size-3.5 [&>svg]:shrink-0",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
  TOUCH_HIT_BOX,
);

/** A segment's own corners inside a split chip (the shell's 6px minus its border). */
const PART_CORNERS = "first:rounded-l-[5px] last:rounded-r-[5px]";

function chipFace({
  tone,
  pressed,
  open,
  error,
}: {
  tone: ComposerChipTone;
  pressed?: boolean;
  open?: boolean;
  error?: boolean;
}): string {
  return cn(
    CHIP_GEOMETRY,
    CHIP_TONE[tone],
    open && "bg-accent text-foreground",
    pressed && "border-primary/60 bg-primary/10 text-foreground",
    error && "ring-1 ring-destructive/50",
  );
}

/** The one label slot: one line, ellipsis, one max width for every chip. */
function ChipLabel({ children }: { children: ReactNode }) {
  return <span className="max-w-[12rem] truncate">{children}</span>;
}

export interface ComposerChipRemove {
  /** The aria name of the X, e.g. "Remove notes.md". */
  label: string;
  onRemove: () => void;
  disabled?: boolean;
  /**
   * `show` (default): on a touch screen the X is always visible.
   * `hide`: the chip opens its own touch menu instead, so the X stays off.
   */
  touch?: "show" | "hide";
}

export interface ComposerChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  ref?: Ref<HTMLButtonElement>;
  /** The one line of text. */
  label: ReactNode;
  /** Leading glyph (drawn 14px). A spinner stands in while `busy`. */
  icon?: ReactNode;
  /** After the label: a count, a status word, a chevron. */
  trailing?: ReactNode;
  tone?: ComposerChipTone;
  /** A toggle chip: `true` = its item is the one shown. Sets `aria-pressed`. */
  pressed?: boolean;
  /** Its menu is open (the open face). */
  open?: boolean;
  busy?: boolean;
  /** The spinner's spoken name while `busy` (e.g. "Attaching"). */
  busyLabel?: string;
  /** The thing it names failed (a red ring). */
  error?: boolean;
  /** A floating X in the top-right corner (hover/focus reveal). */
  remove?: ComposerChipRemove;
  /**
   * Further segments of the SAME chip (`ComposerChipPart`) after the main
   * press target — a settings trigger, a count door, an editable toggle.
   */
  parts?: ReactNode;
  /**
   * A suggested reply that fills the composer: never steals the caret, and
   * puts it back after staging so Enter sends what the chip just wrote.
   */
  onStage?: () => void;
  /** Placement classes for the outer element. */
  wrapperClassName?: string;
}

export function ComposerChip({
  ref,
  label,
  icon,
  trailing,
  tone: toneProp,
  pressed,
  open,
  busy = false,
  busyLabel,
  error = false,
  remove,
  parts,
  onStage,
  wrapperClassName,
  className,
  onClick,
  onMouseDown,
  title,
  ...buttonProps
}: ComposerChipProps) {
  const split = parts != null;
  // A suggested reply is a quiet chip with its own default tooltip.
  const tone: ComposerChipTone = toneProp ?? (onStage ? "quiet" : "neutral");
  const resolvedTitle =
    title ??
    (onStage
      ? "Puts the request in the message box — you can edit it before sending."
      : undefined);
  const glyph = busy ? (
    <Loader2
      className="animate-spin"
      aria-hidden={busyLabel ? undefined : true}
      aria-label={busyLabel}
    />
  ) : (
    icon
  );

  const handleMouseDown = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // 1. Never steal the caret out of the composer.
    if (onStage) event.preventDefault();
    onMouseDown?.(event);
  };
  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (onStage) {
      onStage();
      // 2. Put it back, so Enter sends what the chip just wrote.
      focusAgentComposer();
    }
  };

  const main = (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      data-composer-chip={split ? "part" : ""}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      title={resolvedTitle}
      className={cn(
        PART_CONTENT,
        PART_HOVER[tone],
        split && PART_CORNERS,
        !split && chipFace({ tone, pressed, open, error }),
        !split && !remove && wrapperClassName,
        className,
      )}
      {...buttonProps}
    >
      {glyph}
      <ChipLabel>{label}</ChipLabel>
      {trailing != null ? (
        <span className="inline-flex shrink-0 items-center gap-1">{trailing}</span>
      ) : null}
    </button>
  );

  const body = split ? (
    <span
      data-composer-chip=""
      className={cn(
        chipFace({ tone, pressed, open, error }),
        "items-stretch",
        !remove && wrapperClassName,
      )}
    >
      {main}
      {parts}
    </span>
  ) : (
    main
  );

  if (!remove) return body;
  return (
    <span className={cn("group relative inline-flex shrink-0", wrapperClassName)}>
      {body}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!remove.disabled) remove.onRemove();
        }}
        disabled={remove.disabled}
        aria-label={remove.label}
        className={cn(
          "absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full",
          "border border-border bg-background text-muted-foreground shadow-sm",
          "transition-opacity hover:bg-destructive hover:text-destructive-foreground",
          "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
          remove.touch === "hide"
            ? "max-lg:hidden pointer-coarse:hidden"
            : "pointer-coarse:opacity-100",
        )}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

export interface ComposerChipPartProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  ref?: Ref<HTMLButtonElement>;
  tone?: ComposerChipTone;
  /** A part that is lit on its own (e.g. a count of chosen items). */
  lit?: boolean;
}

/** A further segment of a `ComposerChip` (pass it in `parts`). */
export function ComposerChipPart({
  ref,
  tone = "neutral",
  lit = false,
  className,
  children,
  ...props
}: ComposerChipPartProps) {
  return (
    <button
      ref={ref}
      type="button"
      data-composer-chip="part"
      className={cn(
        PART_CONTENT,
        PART_CORNERS,
        "shrink-0 border-l border-border",
        lit ? "bg-primary/10 text-primary hover:bg-primary/20" : PART_HOVER[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

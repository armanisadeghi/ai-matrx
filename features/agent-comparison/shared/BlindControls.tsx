"use client";

/**
 * BlindControls
 *
 * Shared toolbar widget for the blind-test feature. Self-contained —
 * reads + writes the cross-mode blind state, no mode-specific props.
 * Every mode's toolbar drops `<BlindControls />` next to its Submit
 * All button.
 *
 * Three visual states:
 *   - idle (no blind run): a "Blind test" checkbox the user ticks
 *     before submitting. On submit the toolbar's handler shuffles +
 *     activates (see useBlindSubmit).
 *   - active (submitted, not revealed): a violet "Blind" badge + a
 *     "Reveal" button (always available per product decision).
 *   - revealed: a subtle "revealed" tag; ticking the box again is
 *     blocked until the comparison is cleared / re-submitted.
 */

import { Eye, EyeOff, Check } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  selectBlindEnabled,
  selectBlindSessionExists,
  selectBlindRevealed,
} from "../redux/selectors";
import { revealBlind, setBlindEnabled } from "../redux/battleSlice";

export function BlindControls() {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectBlindEnabled);
  const sessionExists = useAppSelector(selectBlindSessionExists);
  const revealed = useAppSelector(selectBlindRevealed);

  // Active blind run, not yet revealed → show badge + reveal button.
  if (sessionExists && !revealed) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-violet-500/15 text-violet-500 border border-violet-500/30 text-[11px] font-semibold uppercase tracking-wider">
          <EyeOff className="w-3 h-3" />
          Blind
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch(revealBlind())}
          className="h-7 border-violet-500/40 text-violet-500 hover:bg-violet-500/10"
          title="Reveal which column was which"
        >
          <Eye className="w-3.5 h-3.5" />
          Reveal
        </Button>
      </div>
    );
  }

  // Revealed → subtle indicator (run stays revealed until clear / re-submit).
  if (sessionExists && revealed) {
    return (
      <span className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-muted text-muted-foreground text-[11px] font-medium">
        <Eye className="w-3 h-3" />
        Revealed
      </span>
    );
  }

  // Idle → the pre-submit checkbox.
  return (
    <button
      type="button"
      onClick={() => dispatch(setBlindEnabled(!enabled))}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium border transition-colors",
        enabled
          ? "bg-violet-500/15 text-violet-500 border-violet-500/40"
          : "text-muted-foreground border-border hover:bg-muted/50",
      )}
      title={
        enabled
          ? "Blind test ON — on Submit, columns shuffle and all identifying info (model, settings, prompt, tokens, cost, speed) hides until you Reveal"
          : "Blind test: shuffle + hide everything identifying so you evaluate responses without bias. Reveal when done."
      }
    >
      <EyeOff className="w-3.5 h-3.5" />
      Blind test
      <span
        className={cn(
          "ml-0.5 w-3 h-3 rounded-sm border flex items-center justify-center",
          enabled
            ? "bg-violet-500 border-violet-500 text-white"
            : "border-muted-foreground/40",
        )}
      >
        {enabled && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

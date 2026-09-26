"use client";

/**
 * BattleHeader — the ONE route header every Agent Battle mode mounts.
 *
 * Every mode used to draw its own three-row chrome (a title bar, a strip of
 * mode chips, a wide button toolbar) and they had drifted apart. This is the
 * single layout: the battle's name on the left, the mode switcher pinned in
 * the center, and on the right the mode's secondary actions (folding into
 * "…"), the blind-test control, any mode-specific node, the battle-wide
 * Alchemy menu, and "Submit all" as the primary action that never folds.
 *
 * It owns chrome ONLY. Each mode still owns its handlers, dialogs and thunks —
 * what each action DOES is decided by the mode that passes it, because every
 * mode moves its request, variables and settings differently.
 */

import type { ReactNode } from "react";
import { Loader2, Play } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import HeaderActions from "@/features/shell/components/header/variants/shared/HeaderActions";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { BattleModeNav } from "./ModePicker";
import { BlindControls } from "./BlindControls";
import { BattleAlchemy } from "./BattleAlchemy";
import { selectBlindActive } from "../redux/selectors";

interface BattleHeaderProps {
  /** Name of the battle on screen (the saved comparison), or null before its first run. */
  battleName: string | null;
  /** What this mode calls itself when the battle has no name yet, e.g. "Model battle". */
  fallbackTitle: string;
  /** Secondary actions, most used first. The first `inlineCount` stay visible on desktop. */
  actions: HeaderAction[];
  inlineCount?: number;
  /** Mode-specific control that cannot be expressed as a plain action (e.g. a preset menu). */
  extra?: ReactNode;
  onSubmit: () => void;
  submitting: boolean;
  canSubmit: boolean;
  /** Tooltip + accessible name for Submit all, stating what it runs. */
  submitTitle: string;
}

export function BattleHeader({
  battleName,
  fallbackTitle,
  actions,
  inlineCount = 1,
  extra,
  onSubmit,
  submitting,
  canSubmit,
  submitTitle,
}: BattleHeaderProps) {
  const blindActive = useAppSelector(selectBlindActive);
  // A blind run hides everything that could identify a column; the battle's
  // own name never identifies a column, but it is kept neutral while blind so
  // the header matches every other masked surface.
  const title = blindActive
    ? "Blind comparison"
    : (battleName ?? fallbackTitle);

  return (
    <RouteHeader
      left={
        <span
          className="text-sm font-medium truncate"
          title={title}
          data-testid="battle-header-title"
        >
          {title}
        </span>
      }
      center={<BattleModeNav />}
      right={
        <div className="flex items-center gap-1">
          {extra}
          <HeaderActions
            actions={actions}
            maxInline={inlineCount}
            sheetTitle={title}
          />
          <BlindControls compact />
          <BattleAlchemy />
          <Button
            size="sm"
            onClick={onSubmit}
            // Never dead: when the battle is not ready the button stays
            // clickable and the mode's handler says what is missing.
            variant={canSubmit ? "default" : "outline"}
            disabled={submitting}
            aria-label={submitTitle}
            title={submitTitle}
            className="h-8 max-sm:h-11 max-sm:w-11 max-sm:p-0 shrink-0"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span className="max-sm:sr-only">Submit all</span>
          </Button>
        </div>
      }
    />
  );
}

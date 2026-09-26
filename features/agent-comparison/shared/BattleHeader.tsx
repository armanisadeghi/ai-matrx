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

import { useRef, type ReactNode } from "react";
import type { ContentTransferController } from "@ai-matrx/design-system/content-transfer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2, Play } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import HeaderActions from "@/features/shell/components/header/variants/shared/HeaderActions";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { BattleModeNav } from "./ModePicker";
import { BlindControls } from "./BlindControls";
import { BattleAlchemy } from "./BattleAlchemy";
import { selectActiveBattleColumns } from "./activeBattleColumns";
import {
  selectBlindActive,
  selectBlindEnabled,
  selectBlindSessionExists,
} from "../redux/selectors";
import { setBlindEnabled } from "../redux/battleSlice";

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
  const dispatch = useAppDispatch();
  const blindActive = useAppSelector(selectBlindActive);
  const blindEnabled = useAppSelector(selectBlindEnabled);
  const blindSession = useAppSelector(selectBlindSessionExists);
  const isMobile = useIsMobile();
  const alchemyRef = useRef<ContentTransferController>(null);
  const hasColumns = useAppSelector(selectActiveBattleColumns).length > 0;
  // A blind run hides everything that could identify a column; the battle's
  // own name never identifies a column, but it is kept neutral while blind so
  // the header matches every other masked surface.
  const title = blindActive
    ? "Blind comparison"
    : (battleName ?? fallbackTitle);

  // On a phone the bar holds only the actions button and Submit all, so the
  // mode switcher has room; Blind test and the battle Alchemy move into the
  // actions sheet (the Alchemy control stays mounted, hidden, and opens its
  // own prepare-and-export workspace from there).
  const allActions: HeaderAction[] = isMobile
    ? [
        ...actions,
        ...(blindSession
          ? []
          : [
              {
                icon: "EyeOff",
                label: blindEnabled ? "Blind test: on (tap to turn off)" : "Blind test: off (tap to turn on)",
                onPress: () => dispatch(setBlindEnabled(!blindEnabled)),
              },
            ]),
        ...(hasColumns
          ? [
              {
                icon: "FileOutput",
                label: "Copy, prepare or export this battle",
                onPress: () => {
                  void alchemyRef.current?.preparePrimary();
                },
              },
            ]
          : []),
      ]
    : actions;

  return (
    <RouteHeader
      left={
        isMobile ? (
          // A phone's header zone is ~200px: the centered mode switcher only
          // gets the width left after the WIDER flank, so the actions button
          // sits on the (otherwise empty) left to balance Submit all.
          <BattleActionsMenu
            ariaLabel="Battle actions"
            actions={allActions}
            inlineCount={inlineCount}
            sheetTitle={title}
          />
        ) : (
          <span
            className="text-sm font-medium truncate"
            title={title}
            data-testid="battle-header-title"
          >
            {title}
          </span>
        )
      }
      center={<BattleModeNav />}
      // Siblings, never one wrapper: RouteHeader folds each item on its own
      // at narrow widths and always keeps the LAST one (Submit all) visible.
      // One wrapper made the whole cluster — Submit all included — a single
      // item that folded away on a phone.
      right={
        <>
          {extra}
          {!isMobile && (
            <BattleActionsMenu
              ariaLabel="Battle actions"
              actions={allActions}
              inlineCount={inlineCount}
              sheetTitle={title}
            />
          )}
          {!isMobile && (
            <span aria-label="Blind test">
              <BlindControls compact />
            </span>
          )}
          {/* Stays mounted on a phone (hidden) so the sheet item can open it. */}
          <span
            className={isMobile ? "hidden" : undefined}
            aria-label="Copy, transform or export this battle"
          >
            <BattleAlchemy controllerRef={alchemyRef} />
          </span>
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
        </>
      }
    />
  );
}

/**
 * The mode's actions as ONE header item: a few inline icons plus "…" on
 * desktop, a sheet on a phone. It deliberately does not expose its buttons to
 * RouteHeader one by one — the page keeps the compact Model-page layout.
 * `ariaLabel` names the item when RouteHeader folds it into its own "…".
 */
function BattleActionsMenu({
  actions,
  inlineCount,
  sheetTitle,
}: {
  ariaLabel: string;
  actions: HeaderAction[];
  inlineCount: number;
  sheetTitle: string;
}) {
  return (
    <div className="flex items-center">
      <HeaderActions
        actions={actions}
        maxInline={inlineCount}
        sheetTitle={sheetTitle}
      />
    </div>
  );
}

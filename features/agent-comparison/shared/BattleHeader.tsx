"use client";

/**
 * BattleHeader — the ONE header + action bar every Agent Battle mode mounts.
 *
 * Two pieces, one component:
 * - The route header (portaled into the shell): the battle's name, the mode
 *   switcher, and the battle-wide copy/export menu — side things only.
 * - The action bar, in the page right where this component is mounted (the
 *   top of every mode's body): every real action as a small labelled or
 *   icon-only button with its full name as the tooltip, Blind test, and Run.
 *   (Arman, 2026-10-02: the page's primary actions were hidden in a "…" menu
 *   in the header; the header is for side things, not the page's work.)
 *
 * It owns chrome ONLY. Each mode still owns its handlers, dialogs and thunks —
 * what each action DOES is decided by the mode that passes it, because every
 * mode moves its request, variables and settings differently.
 */

import { Fragment, useRef, type ReactNode } from "react";
import type { ContentTransferController } from "@ai-matrx/design-system/content-transfer";
import { Loader2, Play } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import LucideIcon from "@/features/shell/components/header/variants/shared/LucideIcon";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { BattleModeNav } from "./ModePicker";
import { BlindControls } from "./BlindControls";
import { BattleAlchemy } from "./BattleAlchemy";
import { selectBlindActive } from "../redux/selectors";

/**
 * A battle action. `label` is the full name — the tooltip and accessible name.
 * `short` is the visible text: omitted → the icon's standard short word,
 * `null` → icon only.
 */
export type BattleAction = HeaderAction & { short?: string | null };

type ActionGroup = "add" | "view" | "file" | "reset";

/** Every battle icon's standard short word and group, so all nine modes read the same. */
const ICON_DEFAULTS: Record<string, { short: string | null; group: ActionGroup }> = {
  Plus: { short: "Add", group: "add" },
  Expand: { short: "Show all", group: "add" },
  Activity: { short: "Runs", group: "view" },
  Zap: { short: "Master input", group: "view" },
  SlidersHorizontal: { short: "Run settings", group: "view" },
  Scale: { short: "Decisions", group: "view" },
  Layers: { short: "Context", group: "view" },
  PencilLine: { short: "Edit", group: "view" },
  Library: { short: "Open", group: "file" },
  Save: { short: "Save", group: "file" },
  Pencil: { short: null, group: "file" },
  Copy: { short: null, group: "file" },
  Eraser: { short: "Clear", group: "reset" },
  RotateCcw: { short: "Reset", group: "reset" },
  SquarePlus: { short: "New", group: "reset" },
};
const GROUP_ORDER: ActionGroup[] = ["add", "view", "file", "reset"];

interface BattleHeaderProps {
  /** Name of the battle on screen (the saved comparison), or null before its first run. */
  battleName: string | null;
  /** What this mode calls itself when the battle has no name yet, e.g. "Model battle". */
  fallbackTitle: string;
  /** Every action the mode offers; all are shown in the action bar. */
  actions: BattleAction[];
  /** Mode-specific control that cannot be expressed as a plain action (e.g. a preset menu). */
  extra?: ReactNode;
  /**
   * Run. Omitted by a mode whose columns each send their own turn
   * (Conversation): Run and Blind test (which starts on Run) are then absent
   * rather than dead.
   */
  onSubmit?: () => void;
  submitting?: boolean;
  canSubmit?: boolean;
  /** Tooltip + accessible name for Run, stating what it runs. */
  submitTitle?: string;
}

export function BattleHeader({
  battleName,
  fallbackTitle,
  actions,
  extra,
  onSubmit,
  submitting = false,
  canSubmit = false,
  submitTitle = "Run every column",
}: BattleHeaderProps) {
  const hasSubmit = Boolean(onSubmit);
  const blindActive = useAppSelector(selectBlindActive);
  const alchemyRef = useRef<ContentTransferController>(null);
  // A blind run hides everything that could identify a column; the battle's
  // own name never identifies a column, but it is kept neutral while blind so
  // the header matches every other masked surface.
  const title = blindActive
    ? "Blind comparison"
    : (battleName ?? fallbackTitle);

  const grouped = GROUP_ORDER.map((group) =>
    actions.filter((a) => (ICON_DEFAULTS[a.icon]?.group ?? "view") === group),
  ).filter((list) => list.length > 0);

  return (
    <>
      <RouteHeader
        // On a phone RouteHeader moves the mode switcher into the ⋮ sheet and
        // gives the title the row (platform rule, 2026-09-27).
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
          <span aria-label="Copy, prepare or export this battle">
            <BattleAlchemy controllerRef={alchemyRef} />
          </span>
        }
      />
      <div
        role="toolbar"
        aria-label="Battle actions"
        className="flex items-center h-9 px-2 border-b border-border shrink-0 min-w-0"
      >
        {/* Only the secondary actions scroll; Blind test and Run stay pinned
            on screen at every width (a phone included). */}
        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-none">
        {grouped.map((list, gi) => (
          <Fragment key={gi}>
            {gi > 0 && (
              <span aria-hidden className="mx-1 h-4 w-px bg-border shrink-0" />
            )}
            {list.map((action) => (
              <BattleActionButton key={action.label} action={action} />
            ))}
          </Fragment>
        ))}
        {extra}
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0 pl-2 border-l border-border">
          {hasSubmit && <BlindControls compact />}
          {hasSubmit && (
            <Button
              icon={submitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Play />
              )}
              onClick={onSubmit}
              // Never dead: when the battle is not ready the button stays
              // clickable and the mode's handler says what is missing.
              variant={canSubmit ? "primary" : "outline"}
              disabled={submitting}
              aria-label={submitTitle}
              title={submitTitle}
              className="shrink-0"
            >
              Run
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function BattleActionButton({ action }: { action: BattleAction }) {
  const short =
    action.short === undefined
      ? (ICON_DEFAULTS[action.icon]?.short ?? null)
      : action.short;
  return (
    <button
      type="button"
      onClick={action.onPress}
      title={action.label}
      aria-label={action.label}
      className={cn(
        "inline-flex items-center gap-1 h-7 rounded-md text-xs shrink-0 transition-colors",
        short ? "px-2 max-sm:w-7 max-sm:px-0 max-sm:justify-center" : "w-7 justify-center",
        "text-muted-foreground hover:text-foreground hover:bg-muted",
        action.destructive && "hover:text-destructive",
      )}
    >
      <LucideIcon name={action.icon} size={14} />
      {/* Icon-only on a phone, so the whole bar fits beside Run. */}
      {short && <span className="whitespace-nowrap max-sm:hidden">{short}</span>}
    </button>
  );
}

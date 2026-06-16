"use client";

/**
 * E3 stacked-rows attachment tile — adaptive light/dark chrome, transparent icon.
 * Canonical chip for agent input bar + sent user messages (+ dev gallery).
 *
 * When `onRemove` (and/or the editable toggle) is present, the controls live in
 * a dedicated right column: remove (X) on top, the agent-editable toggle on the
 * bottom. The toggle swaps two explicit icons — Lock (read-only) ↔ Pencil
 * (editable) — in a strong foreground color with no background fill.
 *
 * Touch targets are tiny, so on touch devices a long-press opens a popover menu
 * with full-size options (toggle editability + remove). All controls stop
 * propagation so they never trigger the tile's own click/hover-preview.
 */

import {
  createElement,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AlertCircle, Loader2, Lock, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  resolveResourceAttachmentTileTheme,
  resourceAttachmentTileAdaptiveSurface,
  RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
} from "./resourceAttachmentTile.theme";

/** Tri-state editability. `null` = the type doesn't support the toggle. */
export type ResourceEditableState = "readonly" | "editable" | null;

export interface ResourceAttachmentTileProps {
  /** Short type label, e.g. "Note", "Task". */
  typeLabel: string;
  /** Display title — truncated on one line. */
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** Block type or demo id for theme lookup. */
  themeKey: string;
  onClick?: () => void;
  /** Input bar: small remove control in the tile corner. */
  onRemove?: () => void;
  /**
   * Editability state for agent write-back. `null`/undefined hides the toggle
   * entirely (the type isn't editable-capable). Pair with `onToggleEditable`.
   */
  editableState?: ResourceEditableState;
  /** Flip read-only ↔ editable. Only wired when `editableState` is non-null. */
  onToggleEditable?: () => void;
  pending?: boolean;
  error?: boolean;
  className?: string;
}

export function ResourceAttachmentTile({
  typeLabel,
  title,
  icon: Icon,
  themeKey,
  onClick,
  onRemove,
  editableState = null,
  onToggleEditable,
  pending = false,
  error = false,
  className,
}: ResourceAttachmentTileProps) {
  const theme = resolveResourceAttachmentTileTheme(themeKey);

  const showToggle = editableState !== null && Boolean(onToggleEditable);
  const editable = editableState === "editable";
  const hasControls = Boolean(onRemove) || showToggle;

  // ── Long-press → popover menu (touch only) ──────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch" || !hasControls) return;
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setMenuOpen(true);
    }, 450);
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    // Swallow the click that follows a long-press so it doesn't also fire the
    // tile's onClick / open a hover preview.
    if (longPressFired.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFired.current = false;
    }
  };

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const toggleEditable = () => {
    onToggleEditable?.();
  };

  const editableTooltip = editable
    ? "Editable: Click to avoid agent changes"
    : "Read Only: Click to allow agent editing";

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE,
            "w-[7.5rem] inline-flex items-stretch text-left min-w-0",
            resourceAttachmentTileAdaptiveSurface(theme),
            error && "ring-1 ring-destructive/50",
            className,
          )}
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPress}
          onPointerMove={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onClickCapture={handleClickCapture}
        >
          <button
            type="button"
            title={title}
            onClick={onClick}
            className="flex min-w-0 flex-1 flex-col gap-0.5 px-1.5 py-1 text-left"
          >
            <span className="flex items-center gap-1 min-w-0 w-full">
              <span className="h-[1.125rem] w-[1.125rem] shrink-0 flex items-center justify-center">
                {pending ? (
                  <Loader2
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 animate-spin",
                      theme.icon,
                    )}
                  />
                ) : error ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  createElement(Icon, {
                    className: cn("h-3.5 w-3.5 shrink-0", theme.icon),
                  })
                )}
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[9px] font-semibold leading-none text-muted-foreground uppercase tracking-wide">
                {typeLabel}
              </span>
            </span>
            <span className="block w-full min-w-0 truncate whitespace-nowrap text-[10px] leading-none text-foreground font-medium">
              {title}
            </span>
          </button>

          {hasControls ? (
            <div className="flex flex-col items-center justify-between py-0.5 pl-0.5 pr-[3px]">
              {onRemove ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${title}`}
                  onClick={(e) => {
                    stop(e);
                    onRemove();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      stop(e);
                      onRemove();
                    }
                  }}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full p-0.5",
                    "text-muted-foreground/80 hover:bg-black/10 hover:text-foreground",
                    "dark:hover:bg-white/10 transition-colors",
                  )}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              ) : (
                <span />
              )}

              {showToggle ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-pressed={editable}
                      aria-label={editableTooltip}
                      onClick={(e) => {
                        stop(e);
                        toggleEditable();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          stop(e);
                          toggleEditable();
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-full p-0.5 text-foreground"
                    >
                      {editable ? (
                        <Pencil className="h-2.5 w-2.5" />
                      ) : (
                        <Lock className="h-2.5 w-2.5" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {editableTooltip}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
        </div>
      </PopoverAnchor>

      {hasControls ? (
        <PopoverContent
          side="top"
          align="end"
          sideOffset={6}
          className="w-52 p-1"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-xs font-semibold text-foreground">
              {title}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {typeLabel}
            </p>
          </div>
          {showToggle ? (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                toggleEditable();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-accent"
            >
              {editable ? (
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span>{editable ? "Make read-only" : "Allow agent editing"}</span>
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                setMenuOpen(false);
                onRemove();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <X className="h-4 w-4 shrink-0" />
              <span>Remove</span>
            </button>
          ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

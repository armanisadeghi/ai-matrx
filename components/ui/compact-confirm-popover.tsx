"use client";

import { useId, useRef } from "react";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface CompactConfirmAnchorPoint {
  x: number;
  y: number;
}

export interface CompactConfirmPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorPoint: CompactConfirmAnchorPoint;
  title: string;
  itemLabel?: string;
  description: string;
  reassurance?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
}

/**
 * Lightweight, non-modal confirmation beside the action that requested it.
 * Outside-click and Escape cancel; there is no backdrop or focus trap.
 */
export function CompactConfirmPopover({
  open,
  onOpenChange,
  anchorPoint,
  title,
  itemLabel,
  description,
  reassurance,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy = false,
  error = null,
  onConfirm,
}: CompactConfirmPopoverProps) {
  const isMobile = useIsMobile();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed z-[10000] h-px w-px"
          style={{ left: anchorPoint.x, top: anchorPoint.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        role="alertdialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        side={isMobile ? "bottom" : "right"}
        align="start"
        sideOffset={10}
        collisionPadding={12}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-0 text-popover-foreground shadow-xl backdrop-blur-glass backdrop-saturate-glass"
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                variant === "destructive"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary",
              )}
            >
              <Trash2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-sm font-semibold text-foreground"
              >
                {title}
              </h2>
              {itemLabel ? (
                <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-5 text-foreground/80">
                  {itemLabel}
                </p>
              ) : null}
            </div>
          </div>

          <div
            id={descriptionId}
            className="space-y-1.5 rounded-xl bg-muted/55 px-3 py-2.5 text-xs leading-5 text-muted-foreground"
          >
            <p>{description}</p>
            {reassurance ? (
              <p className="flex items-start gap-1.5 text-foreground/75">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                <span>{reassurance}</span>
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-xs leading-5 text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              ref={cancelRef}
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="h-11 flex-1"
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === "destructive" ? "destructive" : "default"}
              size="sm"
              disabled={busy}
              onClick={() => void onConfirm()}
              className="h-11 flex-1"
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

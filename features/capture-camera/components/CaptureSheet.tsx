"use client";

/**
 * CaptureSheet — the iOS-style system sheet used over the camera: a light,
 * heavily-rounded card sliding over the lower portion of the screen with a
 * circular ✕ close top-right; content is an icon + bold title + body text
 * with a filled primary action and a tinted secondary one. `variant="busy"`
 * is the transient state (small spinner + label, like the OS "Connecting…"
 * sheet). Deliberately light-on-dark regardless of app theme — it mirrors
 * the OS presentation over camera chrome.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CaptureSheetAction {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
}

export interface CaptureSheetProps {
  open: boolean;
  onClose: () => void;
  /** Standard content sheet by default; "busy" renders spinner + label. */
  variant?: "content" | "busy";
  icon?: React.ReactNode;
  title?: string;
  body?: React.ReactNode;
  actions?: CaptureSheetAction[];
  /** The busy variant's label ("Connecting…"). */
  busyLabel?: string;
}

export function CaptureSheet({
  open,
  onClose,
  variant = "content",
  icon,
  title,
  body,
  actions = [],
  busyLabel = "Working…",
}: CaptureSheetProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative mx-2 mb-2 mb-safe rounded-[2rem] bg-[#f2f2f7] px-6 pb-6 pt-5 text-black shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-black/70 transition-colors hover:bg-black/10"
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>
        {variant === "busy" ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2.5">
            <Loader2 className="h-5 w-5 animate-spin text-black/50" />
            <span className="text-[17px] font-medium text-black/80">
              {busyLabel}
            </span>
          </div>
        ) : (
          <div className="pt-4">
            {icon && <div className="mb-5 text-[#0a84ff]">{icon}</div>}
            {title && (
              <h2 className="mb-2 text-[26px] font-bold leading-tight">
                {title}
              </h2>
            )}
            {body && (
              <div className="text-[17px] leading-snug text-black/85">
                {body}
              </div>
            )}
            {actions.length > 0 && (
              <div className="mt-7 flex flex-col gap-3">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onPress}
                    className={cn(
                      "h-[50px] w-full touch-manipulation rounded-full text-[17px] font-semibold transition-transform active:scale-[0.98]",
                      (action.kind ?? "primary") === "primary"
                        ? "bg-[#0a84ff] text-white"
                        : "bg-black/[0.06] text-[#0a84ff]",
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

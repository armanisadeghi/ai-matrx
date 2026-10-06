"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeprecationBannerProps {
  replacedBy?: string;
  note?: string;
  className?: string;
}

export function DeprecationBanner({
  replacedBy,
  note,
  className,
}: DeprecationBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const message =
    note ??
    (replacedBy
      ? `Deprecated — moved to "${replacedBy}". This window will be removed soon.`
      : "Deprecated — this window will be removed soon.");

  return (
    <div
      className={cn(
        "shrink-0 flex items-start gap-2 px-2 py-1 border-b border-destructive/40 bg-destructive/10 text-destructive-ink text-[11px] leading-tight",
        className,
      )}
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-[1px] shrink-0" />
      <span className="flex-1 break-words">{message}</span>
      <button
        type="button"
        aria-label="Dismiss deprecation notice"
        className="shrink-0 rounded hover:bg-destructive/20 p-0.5 transition-colors"
        onClick={() => setDismissed(true)}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

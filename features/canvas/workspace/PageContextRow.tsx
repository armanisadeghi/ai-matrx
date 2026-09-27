"use client";

/**
 * What a chat beside a page can see of it, said plainly, with the switch
 * beside it (the helper-context choice: visible, switchable, on by default).
 * On an unregistered page it says there is nothing to share — never a toggle
 * that pretends to do something.
 */

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageContextRow({
  label,
  on,
  onToggle,
}: {
  label: string | null;
  on: boolean;
  onToggle: () => void;
}) {
  if (!label) {
    return (
      <p className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        This page shares nothing with the chat yet.
      </p>
    );
  }
  const Icon = on ? Eye : EyeOff;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={
        on
          ? `The chat receives the live values from ${label} with every message — click to stop`
          : `Click to let the chat see ${label}`
      }
      className="flex w-full shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", on && "text-primary")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {on ? (
          <>
            Sees <span className="font-medium text-foreground">{label}</span>
          </>
        ) : (
          <>Not seeing this page</>
        )}
      </span>
      <span className="shrink-0 text-muted-foreground">{on ? "On" : "Off"}</span>
    </button>
  );
}

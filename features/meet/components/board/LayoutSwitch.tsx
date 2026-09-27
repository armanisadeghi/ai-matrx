"use client";

import { LayoutDashboard, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export type MeetingLayoutChoice = "room" | "board";

/** Room | Board — the two layouts a person can pick while in a meeting. */
export function LayoutSwitch({
  value,
  onChange,
  className,
}: {
  value: MeetingLayoutChoice;
  onChange: (next: MeetingLayoutChoice) => void;
  className?: string;
}) {
  const options: { id: MeetingLayoutChoice; label: string; hint: string; Icon: typeof LayoutGrid }[] = [
    { id: "room", label: "Room", hint: "Everyone's video on the stage", Icon: LayoutGrid },
    { id: "board", label: "Board", hint: "Your board fills the screen; people float in a strip", Icon: LayoutDashboard },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Meeting layout"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur",
        className,
      )}
    >
      {options.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={hint}
          aria-label={label}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

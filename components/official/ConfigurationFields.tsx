"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

/** Field-attached help, reachable by pointer, keyboard and touch. */
export function FieldHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dismissed = useRef(false);
  const changeOpen = (next: boolean) => {
    dismissed.current = !next;
    setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Help: ${label}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") changeOpen(true);
          }}
          onFocus={() => {
            if (!dismissed.current) setOpen(true);
          }}
          onBlur={() => {
            dismissed.current = false;
          }}
          onClick={(event) => {
            event.preventDefault();
            changeOpen(true);
          }}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-sm"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{label}</span>
          <button
            type="button"
            aria-label={`Close help: ${label}`}
            onClick={() => changeOpen(false)}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="whitespace-pre-wrap break-words text-foreground">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const STATUS = {
  neutral: {
    label: "Not evaluated",
    Icon: Circle,
    color: "text-foreground",
  },
  ok: { label: "Passed", Icon: CircleCheck, color: "text-success" },
  caution: { label: "Attention", Icon: TriangleAlert, color: "text-warning" },
  error: { label: "Failed", Icon: CircleX, color: "text-destructive" },
  unknown: {
    label: "Unknown",
    Icon: CircleHelp,
    color: "text-foreground",
  },
} as const;

/** A named severity with both text and an icon; never a color-only verdict. */
export function StatusToken({
  status,
  label,
}: {
  status: keyof typeof STATUS;
  label?: string;
}) {
  const { Icon, color, label: defaultLabel } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 text-xs",
        color,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="break-words">{label ?? defaultLabel}</span>
    </span>
  );
}

/** One property and its explicit value, optionally attributed to a source and state. */
export function PropertyRow({
  label,
  value,
  source,
  state,
  help,
  className,
}: {
  label: string;
  value: ReactNode;
  source?: ReactNode;
  state?: ReactNode;
  help?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 border-b border-border py-2 text-sm last:border-b-0 sm:flex-row sm:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 shrink-0 items-start gap-1 font-semibold text-foreground sm:w-44">
        <span className="break-words">{label}:</span>
        {help != null ? <FieldHelp label={label}>{help}</FieldHelp> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1 font-normal">
        <div className="break-words text-foreground">{value}</div>
        {source != null || state != null ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
            {source != null ? (
              <span>
                <span className="font-semibold">Source:</span> {source}
              </span>
            ) : null}
            {state != null ? (
              <span>
                <span className="font-semibold">State:</span> {state}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

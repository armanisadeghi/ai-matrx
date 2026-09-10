"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
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
import styles from "./ConfigurationFields.module.css";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

/** Source-selector dimensions shared by configuration choices and pickers. */
export const CONFIGURATION_CHOICE_SIZE =
  "h-[34px] min-h-[34px] rounded-lg px-2.5 text-[11.5px] font-medium";

const FIELD_HELP_OPEN = "matrx:field-help-open";

/** Field-attached help, reachable by pointer, keyboard and touch. */
export function FieldHelp({
  label,
  children,
  triggerIcon,
  triggerLabel,
  unavailable = false,
}: {
  label: string;
  children: ReactNode;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
  unavailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const dismissed = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(false);
  const keyboardFocus = useRef(false);
  const pointerFocus = useRef(false);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const changeOpen = (next: boolean) => {
    cancelClose();
    dismissed.current = !next;
    // A close notification coordinates independent local popovers without a
    // second store of their open state. Opening one dismisses its siblings.
    if (next)
      document.dispatchEvent(new CustomEvent(FIELD_HELP_OPEN, { detail: id }));
    setOpen(next);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!hovered.current && !keyboardFocus.current) changeOpen(false);
    }, 200);
  };
  const leaveFocus = (next: EventTarget | null) => {
    if (
      next instanceof Node &&
      (trigger.current?.contains(next) || content.current?.contains(next))
    )
      return;
    keyboardFocus.current = false;
    pointerFocus.current = false;
    dismissed.current = false;
    scheduleClose();
  };
  useEffect(() => {
    const closeSibling = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) return;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      dismissed.current = true;
      setOpen(false);
    };
    document.addEventListener(FIELD_HELP_OPEN, closeSibling);
    return () => {
      document.removeEventListener(FIELD_HELP_OPEN, closeSibling);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [id]);
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={triggerLabel ?? `Help: ${label}`}
          aria-disabled={unavailable || undefined}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              hovered.current = true;
              changeOpen(true);
            }
          }}
          onPointerLeave={() => {
            hovered.current = false;
            scheduleClose();
          }}
          onPointerDown={() => {
            pointerFocus.current = true;
            keyboardFocus.current = false;
          }}
          onKeyDownCapture={(event) => {
            if (event.key === "Tab") pointerFocus.current = false;
          }}
          onFocus={() => {
            if (!dismissed.current) {
              keyboardFocus.current = !pointerFocus.current;
              changeOpen(true);
            }
          }}
          onBlur={(event) => leaveFocus(event.relatedTarget)}
          onClick={(event) => {
            event.preventDefault();
            changeOpen(true);
          }}
        >
          {triggerIcon ?? (
            <CircleHelp className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        align="start"
        onPointerEnter={() => {
          hovered.current = true;
          cancelClose();
        }}
        onPointerLeave={() => {
          hovered.current = false;
          scheduleClose();
        }}
        onPointerDownCapture={() => {
          pointerFocus.current = true;
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "Tab") pointerFocus.current = false;
        }}
        onFocusCapture={() => {
          keyboardFocus.current = !pointerFocus.current;
          cancelClose();
        }}
        onBlurCapture={(event) => leaveFocus(event.relatedTarget)}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => {
          changeOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        className={cn(
          styles.help,
          "w-80 max-w-[calc(100vw-2rem)] space-y-2 text-sm",
        )}
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
    Icon: null,
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

/** Status always has text. Only meaningful severity icons accompany it. */
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
        styles.status,
        "inline-flex max-w-full items-center gap-1.5 text-xs",
        color,
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
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
        "flex min-w-0 flex-col gap-1 border-b border-border py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1 font-semibold text-foreground sm:w-44">
        <span className="break-words">{label}:</span>
        {help != null ? <FieldHelp label={label}>{help}</FieldHelp> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1 font-normal">
        <div className="min-w-0 flex-1 break-words text-foreground">
          {value}
        </div>
        {source != null || state != null ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
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

export interface ConfigurationColumn {
  key: string;
  label: string;
  help?: ReactNode;
}

/** Repeated configuration data: table on desktop, labeled records on phones. */
export function ConfigurationTable({
  label,
  columns,
  children,
}: {
  label: string;
  columns: readonly ConfigurationColumn[];
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card">
      <Table
        wrap={false}
        aria-label={label}
        className={cn(styles.table, "text-sm text-foreground")}
      >
        <TableHeader className={styles.head}>
          <TableRow className="bg-accent/40 hover:bg-accent/40">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                scope="col"
                className="whitespace-normal align-middle font-semibold text-foreground"
              >
                <span className={styles.heading}>
                  {column.label}
                  {column.help ? (
                    <FieldHelp label={column.label}>{column.help}</FieldHelp>
                  ) : null}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className={styles.body}>{children}</TableBody>
      </Table>
    </div>
  );
}

export function ConfigurationTableRow({
  columns,
  cells,
}: {
  columns: readonly ConfigurationColumn[];
  cells: Record<string, ReactNode>;
}) {
  return (
    <TableRow
      className={cn(styles.row, "border-b border-border last:border-b-0")}
    >
      {columns.map((column) => (
        <TableCell
          key={column.key}
          className={cn(styles.cell, "min-w-0 whitespace-normal align-middle")}
        >
          <span
            className={cn(
              styles.mobileLabel,
              "mb-1 items-center gap-1 font-semibold",
            )}
          >
            {column.label}:
            {column.help ? (
              <FieldHelp label={column.label}>{column.help}</FieldHelp>
            ) : null}
          </span>
          <div className={styles.cellContent}>
            {cells[column.key] ?? "Not specified"}
          </div>
        </TableCell>
      ))}
    </TableRow>
  );
}

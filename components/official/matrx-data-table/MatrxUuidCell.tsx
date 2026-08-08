"use client";

/**
 * MatrxUuidCell — canonical UUID / FK display for dense tables.
 *
 * Port of aidream `UuidDisplay` + AI Models `UuidCell` + tool-call `ShortId`:
 * short head/tail (8…4 chars), full value on hover, always-visible copy of the full
 * id. Optional FK open: in-app WindowPanel (`onOpen`) and/or route (`href`).
 * Forbidden targets stay copyable but are not navigable.
 */

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Check, Copy, ExternalLink, PanelRight, ShieldOff } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SHORT_LEN = 8;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function shortUuid(id: string, len = SHORT_LEN): string {
  if (id.length <= len + 5) return id;
  return `${id.slice(0, len)}…${id.slice(-4)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export type MatrxUuidOpenResult = void | "forbidden";

export interface MatrxUuidCellProps {
  value: string | null | undefined;
  /** Tooltip / copy label prefix (e.g. column name). */
  label?: string;
  /**
   * Open the referenced record in-app (prefer WindowPanel).
   * Return `"forbidden"` to block navigation and show a muted state.
   */
  onOpen?: (id: string) => MatrxUuidOpenResult | Promise<MatrxUuidOpenResult>;
  /** Optional real href (new tab / cmd-click). Used when navigation is allowed. */
  href?: string | null;
  /** Force non-navigable (still copyable). */
  forbidden?: boolean;
  className?: string;
  trailing?: ReactNode;
}

export function MatrxUuidCell({
  value,
  label,
  onOpen,
  href,
  forbidden = false,
  className,
  trailing,
}: MatrxUuidCellProps) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!value) {
    return <span className="text-muted-foreground/40">—</span>;
  }

  const display = shortUuid(value);
  const tip = label ? `${label}: ${value}` : value;

  const stop = (e: MouseEvent) => {
    e.stopPropagation();
  };

  const onCopy = (e: MouseEvent) => {
    stop(e);
    e.preventDefault();
    void copyText(value).then((ok) => {
      if (!ok) {
        toast.error("Couldn't copy ID");
        return;
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleOpen = async (e: MouseEvent) => {
    stop(e);
    e.preventDefault();
    if (!onOpen || forbidden || opening) return;
    setOpening(true);
    try {
      const result = await onOpen(value);
      if (result === "forbidden") {
        toast.error("You don't have access to open this record");
      }
    } catch (err) {
      toast.error(
        `Couldn't open: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setOpening(false);
    }
  };

  const idNode = (() => {
    if (forbidden) {
      return (
        <span className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground/70 tabular-nums">
          <span className="min-w-0 truncate">{display}</span>
          <ShieldOff className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </span>
      );
    }

    if (onOpen) {
      return (
        <button
          type="button"
          aria-label={`Open ${label ?? "record"} ${display}`}
          onClick={(e) => void handleOpen(e)}
          disabled={opening}
          className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-sky-600 hover:underline dark:text-sky-400 disabled:opacity-60"
        >
          <span className="min-w-0 truncate tabular-nums">{display}</span>
          <PanelRight className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      );
    }

    if (href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label ?? "record"} ${display} in a new tab`}
          onClick={stop}
          className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-sky-600 hover:underline dark:text-sky-400"
        >
          <span className="min-w-0 truncate tabular-nums">{display}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
        </a>
      );
    }

    return (
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground tabular-nums select-all">
        {display}
      </span>
    );
  })();

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-0.5 whitespace-nowrap",
        className,
      )}
      onClick={stop}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex min-w-0 max-w-full items-center">
              {idNode}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm break-all font-mono">
            {forbidden ? `No access · ${tip}` : tip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : `Copy ${label ?? "id"}`}
        title={`Copy ${label ?? "id"}: ${value}`}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none",
          copied && "text-primary",
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
      {onOpen && href && !forbidden ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          aria-label={`Open ${label ?? "record"} in a new tab`}
          title={`Open ${label ?? "record"} in a new tab`}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      {trailing}
    </span>
  );
}

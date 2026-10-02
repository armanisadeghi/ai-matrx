"use client";

/**
 * What the model READ for one context value — fetched from the viewer
 * (`context-viewer.ts`) when the detail opens, never pushed (RULES.md §5b):
 * its own element (`delivered`), the blocks it rode with (the Organization's
 * catalog) and, for an on-request value, what the `context` tool returns.
 * Verbatim from the server; never the client's pre-send copy. A value whose
 * content the agent reads through a tool (`FETCHABLE_ROWS` — the
 * Organization's selected scopes via `scope_system`) also shows what that tool
 * returns now (`kind: "fetchable"`), sized once loaded.
 *
 * The package renders the same in its panel detail from @ai-matrx/agents
 * 0.29.0 (`ContextDeliveredValue` / `DeliveredSection`); this host copy serves
 * the sent-message view and older installed package builds — retire it with
 * the 0.29.0 adoption.
 */

import { useEffect, useState } from "react";
import { Skeleton, cn } from "@ai-matrx/design-system";
import { formatChars } from "@ai-matrx/agents/context";
import type {
  ContextViewLoader,
  ContextViewTarget,
} from "../../redux/execution-system/context-rules/context-viewer";

/** Size + hash of a viewed text (the receipt's ref). */
export interface DeliveredRef {
  chars: number;
  sha256: string;
}

export interface DeliveredRefBlock {
  id: string;
  label: string;
  delivered: DeliveredRef;
}

/** Rows whose values the agent reads through a tool rather than receiving them (RULES.md §5b). */
export const FETCHABLE_ROWS: ReadonlySet<string> = new Set(["organization"]);

export function ContextDeliveredBlock({
  rowKey,
  delivered,
  onRequest,
  blocks,
  load,
  className,
}: {
  rowKey: string;
  delivered?: DeliveredRef | null;
  onRequest?: DeliveredRef | null;
  blocks?: readonly DeliveredRefBlock[];
  load?: ContextViewLoader;
  className?: string;
}) {
  if (!delivered && !onRequest && !blocks?.length) return null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {delivered ? (
        <DeliveredText
          title="Agent received"
          target={{ kind: "delivered", key: rowKey }}
          size={delivered}
          load={load}
        />
      ) : null}
      {(blocks ?? []).map((block) => (
        <DeliveredText
          key={block.id}
          title={block.label}
          target={{ kind: "block", key: block.id }}
          size={block.delivered}
          load={load}
        />
      ))}
      {onRequest ? (
        <DeliveredText
          title="Returned on request"
          target={{ kind: "on_request", key: rowKey }}
          size={onRequest}
          load={load}
        />
      ) : null}
      {delivered && FETCHABLE_ROWS.has(rowKey) ? (
        <DeliveredText
          title="Agent can fetch"
          target={{ kind: "fetchable", key: rowKey }}
          load={load}
        />
      ) : null}
    </div>
  );
}

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "done"; text: string; chars: number };

export function DeliveredText({
  title,
  target,
  size,
  load,
}: {
  title: string;
  target: ContextViewTarget;
  /** The receipt's size; absent for a `fetchable` text, sized once it loads. */
  size?: DeliveredRef;
  load?: ContextViewLoader;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { kind, key } = target;
  useEffect(() => {
    if (!load) return;
    let live = true;
    setLoaded({ state: "loading" });
    load({ kind, key }).then(
      (viewed) => {
        if (live) setLoaded({ state: "done", text: viewed.text, chars: viewed.chars });
      },
      (error: unknown) => {
        if (live)
          setLoaded({
            state: "error",
            message: error instanceof Error && error.message ? error.message : "Couldn't load",
          });
      },
    );
    return () => {
      live = false;
    };
  }, [load, kind, key, attempt]);

  return (
    <section className="flex flex-col gap-1" aria-label={title} data-view-kind={kind} data-view-key={key}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium">{title}</span>
        {size || loaded.state === "done" ? (
          <span className="tabular-nums text-muted-foreground">
            {`${formatChars(size ? size.chars : loaded.state === "done" ? loaded.chars : 0)} chars`}
          </span>
        ) : null}
      </div>
      {!load ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : loaded.state === "loading" ? (
        <Skeleton data-testid="context-delivered-loading" className="h-16 w-full" />
      ) : loaded.state === "error" ? (
        <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
          <span className="min-w-0 truncate" title={loaded.message}>
            {loaded.message}
          </span>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="shrink-0 rounded px-1.5 py-0.5 text-foreground hover:bg-accent"
          >
            Retry
          </button>
        </div>
      ) : loaded.text === "" ? (
        <span data-testid="context-delivered-empty" className="text-xs text-muted-foreground">
          None
        </span>
      ) : (
        <pre
          data-testid="context-delivered-text"
          className={cn(
            "max-h-[min(50dvh,22rem)] cursor-text select-text overflow-auto",
            "whitespace-pre-wrap break-words rounded border border-border",
            "bg-muted/40 p-2 font-mono text-[11px] text-foreground",
          )}
        >
          {loaded.text}
        </pre>
      )}
    </section>
  );
}

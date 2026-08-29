"use client";

/**
 * A single quiet JSON toggle for any structured value the kind system
 * renders through a fallback view (Arman, 2026-08-25: "when the kind
 * component renders something it doesn't recognize, it should be giving us
 * … an option to see the JSON. And that's for everyone, even when it's a
 * user").
 *
 * ONE GHOST BUTTON, NOT A PILL (Arman, 2026-08-25: "It's ugly … It's just
 * horrible."). The segmented Preview/JSON control this replaced was a
 * bordered pill sitting in chrome that was never meant to carry a visible
 * "Preview" button — preview IS the default, so there is nothing to toggle
 * INTO by default. What's left: one small `Braces` icon button with no
 * border and no background. Click it and the body swaps to JSON; the same
 * button gets a subtle active look and a Copy button appears beside it.
 * Click it again (or the button, now meaning "back") to return.
 *
 * SMALL, AND IN THE HEADER (Arman, 2026-08-26): when the host provides a
 * header slot (`TileActionsProvider` / `useTileActionsTarget`) the control
 * renders THERE — on the tile's existing title line, flush with it — instead
 * of spending a body row of the most valuable space on the page. Hosts
 * without a slot get the same tiny control positioned in the top-right
 * corner of the content area itself (no reserved row at all): the fallback
 * bodies this wraps (`GenericStructuredView`, `KindInstanceRender`,
 * `SettledOutputBody`) start their content top-left, so a corner-anchored
 * button costs nothing.
 *
 * The JSON is not a debug easter egg: when the reader is looking at a
 * fallback rendering, the raw payload IS the ground truth, and hiding it
 * meant nobody could check what actually arrived.
 */

import React, { useState } from "react";
import { Braces, Check, Copy, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KindProblem } from "@/features/content-ir/react/kind-problems";
import { hasKindErrors } from "@/features/content-ir/react/kind-problems";
import { IntoTileActions, useHasTileActionsSlot } from "./tile-actions-slot";

type Tab = "preview" | "json" | "errors";

function GhostIconButton({
  active,
  label,
  icon: Icon,
  onClick,
  iconClassName,
}: {
  active: boolean;
  label: string;
  icon: typeof Braces;
  onClick: () => void;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} />
    </button>
  );
}

/**
 * `value` feeds the JSON tab (pretty-printed, copyable); `raw` is the
 * zero-loss fallback when no structured value survived. `header` renders any
 * host status line (kind drift note, "still arriving") above the content.
 */
export function StructuredValueTabs({
  value,
  raw,
  header,
  problems,
  children,
}: {
  value: unknown;
  raw?: string | null;
  header?: React.ReactNode;
  /**
   * What the parser/route recorded about this value being a BROKEN or
   * unroutable kind instance (`collectKindProblems`). Non-empty adds the
   * Errors tab — the exact problems, in-band, for everyone (Arman,
   * 2026-08-29: a `__kind` that isn't kind-rendered must be acknowledged as
   * a kind, with its exact errors — never an anonymous JSON dump).
   */
  problems?: KindProblem[];
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);
  const hasSlot = useHasTileActionsSlot();

  const json =
    value !== undefined && value !== null
      ? JSON.stringify(value, null, 2)
      : (raw ?? "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the text is still selectable below */
    }
  };

  const jsonActive = tab === "json";
  const errorsActive = tab === "errors";
  const shownProblems = problems ?? [];
  const hasErrors = hasKindErrors(shownProblems);

  const controls = (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {shownProblems.length > 0 ? (
        <GhostIconButton
          active={errorsActive}
          label={
            errorsActive
              ? "Back to preview"
              : `View ${shownProblems.length} problem${shownProblems.length === 1 ? "" : "s"}`
          }
          icon={TriangleAlert}
          onClick={() => setTab(errorsActive ? "preview" : "errors")}
          iconClassName={
            errorsActive
              ? undefined
              : hasErrors
                ? "text-destructive"
                : "text-amber-600 dark:text-amber-400"
          }
        />
      ) : null}
      <GhostIconButton
        active={jsonActive}
        label={jsonActive ? "Back to preview" : "View JSON"}
        icon={Braces}
        onClick={() => setTab(jsonActive ? "preview" : "json")}
      />
      {jsonActive ? (
        <GhostIconButton
          active={false}
          label={copied ? "Copied" : "Copy JSON"}
          icon={copied ? Check : Copy}
          onClick={copy}
          iconClassName={copied ? "text-emerald-600 dark:text-emerald-400" : undefined}
        />
      ) : null}
    </span>
  );

  return (
    <div className={cn(!hasSlot && "relative")}>
      <IntoTileActions>
        {hasSlot ? (
          controls
        ) : (
          // No header slot and no reserved row: the button sits in the
          // content area's own top-right corner (see file header for why
          // that's safe for the bodies this wraps).
          <span className="absolute right-0 top-0 z-10">{controls}</span>
        )}
      </IntoTileActions>
      {header}
      {tab === "preview" ? (
        children
      ) : tab === "errors" ? (
        <div className="max-h-[28rem] space-y-2 overflow-auto rounded-md border border-border bg-muted/30 p-3">
          {shownProblems.map((problem, i) => (
            <div key={i} className="flex items-start gap-2 text-xs leading-relaxed">
              <TriangleAlert
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  problem.severity === "error"
                    ? "text-destructive"
                    : problem.severity === "warning"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {problem.code}
                  {problem.path ? ` @ ${problem.path}` : ""}
                </span>
                <span className="text-foreground">{problem.message}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <pre className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
          {json}
        </pre>
      )}
    </div>
  );
}

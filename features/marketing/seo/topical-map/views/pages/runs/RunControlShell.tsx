"use client";

// features/marketing/seo/topical-map/views/pages/runs/RunControlShell.tsx
//
// THE CHROME EVERY MAP RUN CONTROL WEARS — one trigger button, one popover,
// and the three things a durable run owes the person watching it: what stage it
// is on, how long it has been going, and a way back to the floating window.
//
// 🚨 A SPINNER IS NEVER THE ANSWER WHILE AI WORKS. The run itself does not
// render here: `useSeoCommandRun` adopts the stream and floats it in the
// canonical `LiveRunWindow` (`live: { label }`), so this shell narrates and
// never parses. "Show run" re-opens that window by the hook's own instance id
// convention (`seo-command:<key>`) — the run survives a reload, so the door back
// to it must survive the popover being closed.
//
// 🚨 THE SERVER'S SENTENCE REACHES THE PERSON UNALTERED. `error` is printed as
// it arrived; `retry` is offered only when the hook actually has one (a run this
// tab did not launch has no body to repeat, and a button that cannot act is the
// dead-control defect).

import { useState, type ReactNode } from "react";
import { RotateCcw, SquareArrowOutUpRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

import { Button } from "@/components/ui/button";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { formatElapsed } from "@/lib/durable-run/useDurableRun";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * The slice of `DurableRunHandle` this shell renders. Deliberately not the
 * handle itself: the shell is the same for all three runs, whose results are
 * three different documents, and narrowing here keeps the generic out of every
 * call site.
 */
export interface RunShellState {
  running: boolean;
  /** A pointer was found and this mount cannot describe the run yet. */
  restoring: boolean;
  stage: string | null;
  waitMessage: string | null;
  elapsedMs: number;
  /** The server's own sentence, verbatim. */
  error: string | null;
  retry: (() => Promise<void>) | null;
  /** `seo-command:<key>` — how the floating window is re-opened. */
  instanceId: string;
}

export interface RunControlShellProps {
  /** The words on the trigger, e.g. "Map the pages". */
  label: string;
  /** The Lucide icon element — `BrainCircuit` for the two agent runs. */
  icon: ReactNode;
  state: RunShellState;
  /** Parameters, the consequence sentence, Start, and the result summary. */
  children: ReactNode;
  /** The three popovers hold different amounts; default fits two columns of chips. */
  contentClassName?: string;
}

export function RunControlShell({
  label,
  icon,
  state,
  children,
  contentClassName,
}: RunControlShellProps) {
  const [open, setOpen] = useState(false);
  const working = state.running || state.restoring;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          {icon}
          <span>{label}</span>
          {working ? (
            <>
              {/* The run is going even with this popover shut — the trigger
                  itself has to say so, or closing it reads as stopping it. */}
              <span
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                aria-hidden
              />
              <span className="max-w-[12rem] truncate text-muted-foreground">
                {state.stage ?? state.waitMessage ?? "Working"}
              </span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sizing="content"
        className={contentClassName ?? "p-3 text-xs"}
      >
        <div className="space-y-3">
          {children}
          {working ? <RunLiveBlock state={state} /> : null}
          {state.error ? (
            <RunErrorBlock error={state.error} retry={state.retry} />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * What the run is doing right now. `waitMessage` is the hook's one honest
 * sentence — it stops promising and starts reporting once the run overruns what
 * runs of its kind take — so it is never replaced with a sentence of our own.
 */
function RunLiveBlock({ state }: { state: RunShellState }) {
  const openLiveRun = useOpenLiveRunWindow();
  return (
    <div className="rounded-md border border-border bg-muted/40 p-2">
      <p className="flex items-center gap-1.5 font-medium">
        <span
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary"
          aria-hidden
        />
        {state.stage ?? state.waitMessage ?? "Working"}
      </p>
      {state.waitMessage && state.waitMessage !== state.stage ? (
        <p className="mt-1 text-muted-foreground">{state.waitMessage}</p>
      ) : null}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          {formatElapsed(state.elapsedMs)} so far
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 text-xs"
          onClick={() => openLiveRun({ instanceId: state.instanceId })}
        >
          <SquareArrowOutUpRight className="h-3 w-3" aria-hidden />
          Show run
        </Button>
      </div>
    </div>
  );
}

/**
 * The failure, in the server's words. Nothing is reworded and nothing is
 * summarised: these sentences are written for the person making the change and
 * a paraphrase destroys the only explanation they will get.
 */
function RunErrorBlock({
  error,
  retry,
}: {
  error: string;
  retry: (() => Promise<void>) | null;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-2"
    >
      <p className="whitespace-pre-wrap text-destructive">{error}</p>
      {retry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 h-6 gap-1 text-xs"
          onClick={() => void retry()}
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Run it again
        </Button>
      ) : null}
      <ErrorAlchemyMenu className="ml-auto" />
    </div>
  );
}

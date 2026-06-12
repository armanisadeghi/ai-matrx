"use client";

// app/(core)/podcast/studio/run-c/_components/RunView.tsx
//
// Run-c redesign — the live generation page. Modeled after a Vercel deploy /
// CI run console: a two-column layout where the left pane materializes the
// finished artifact piece-by-piece (StreamingResults) and the right pane is the
// live build console (BuildConsole) with per-kind animated loaders. Plays a
// mock event stream through the REAL reduce() in ~45s; "Replay" re-runs it.

import Link from "next/link";
import { ArrowLeft, Podcast, Plus, RotateCcw, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMockRun } from "./useMockRun";
import { BuildConsole } from "./BuildConsole";
import { StreamingResults } from "./StreamingResults";

export function RunView() {
  const { state, startedAt, playing, replay } = useMockRun();
  const done = state.status === "done";

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 pr-14 sm:py-7">
      {/* ── Header — one row: back, title, status, polished actions ───────── */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/podcast/studio"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          aria-label="Back to studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
          <Podcast className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
            {done ? "Episode ready" : "Generating episode"}
          </h1>
        </div>

        {/* Status pill */}
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex",
            done
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500"
              : "bg-primary/10 text-primary",
          )}
        >
          {done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {done ? "Complete" : "Live"}
        </span>

        {/* Polished, properly-placed top actions */}
        <button
          type="button"
          onClick={replay}
          disabled={playing}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors",
            playing
              ? "cursor-not-allowed opacity-50"
              : "hover:bg-accent/50",
          )}
          title="Replay the generation"
        >
          <RotateCcw className="h-4 w-4" />
          Replay
        </button>
        <Link
          href="/podcast/studio/create-c"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New episode</span>
        </Link>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* LEFT — the artifact, revealed as it streams */}
        <div className="order-2 min-w-0 lg:order-1">
          <StreamingResults state={state} />
        </div>
        {/* RIGHT — the live build console */}
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-4">
            <BuildConsole state={state} startedAt={startedAt} />
          </div>
        </div>
      </div>
    </div>
  );
}

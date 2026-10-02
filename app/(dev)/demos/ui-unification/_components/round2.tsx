"use client";

/**
 * Round 2 specimens (2026-10-02), built on the one-control prototype
 * (`one-control.tsx`) so every option already obeys the shared geometry.
 *
 * Design rules every specimen here holds (Apple HIG + the owner's notes):
 * - Space goes where it helps reading (between groups), never as padding
 *   stacked inside padding. One surface level; rows separated by hairlines.
 * - Content first: the thing you care about gets the width.
 * - Colour is a token role (primary / success / warning / destructive), used
 *   sparingly as a tint, never raw palette classes.
 */

import { useState, type ReactNode } from "react";
import { Skeleton } from "@ai-matrx/design-system";
import { TapTargetButtonSolid } from "@ai-matrx/tap-target";
import {
  MoreHorizontalTapButton,
  PencilTapButton,
  TrashTapButton,
} from "@ai-matrx/tap-target/buttons";
import { FolderOpen, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MeasuredBare, Scale } from "./one-control";

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

function Frame({ width = 560, children }: { width?: number; children: ReactNode }) {
  return (
    <div
      className="max-w-full overflow-hidden rounded-lg border border-border bg-background"
      style={{ width }}
    >
      {children}
    </div>
  );
}

const ROWS = [
  { name: "Quarterly client report", meta: "Updated 2h ago · Ana Ruiz", status: "draft" },
  { name: "Intake form — dental", meta: "Updated yesterday · Ben Ortiz", status: "live" },
  { name: "Weekly check-in agenda", meta: "Updated 3d ago · Ana Ruiz", status: "review" },
  { name: "Old onboarding checklist", meta: "Updated 1w ago · Dana Reyes", status: "failed" },
] as const;

type Tone = "neutral" | "success" | "warning" | "destructive" | "info";
const STATUS_TONE: Record<string, Tone> = { draft: "neutral", live: "success", review: "warning", failed: "destructive" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", live: "Live", review: "In review", failed: "Failed" };

/* ------------------------------ Form height ------------------------- */

function DenseForm() {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-2.5 py-1">
      <div className="flex flex-col gap-1">
        <span className="px-[3px] text-xs font-medium text-muted-foreground">Project name</span>
        <label className="uc-field" style={{ width: "calc(100% - var(--matrx-tap-gap))" }}>
          <input defaultValue="Launch plan" aria-label="Project name" />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="px-[3px] text-xs font-medium text-muted-foreground">Owner</span>
        <button type="button" className="uc-select" style={{ width: "calc(100% - var(--matrx-tap-gap))" }}>
          Ana Ruiz <span aria-hidden>⌄</span>
        </button>
      </div>
      <MeasuredBare>
        <span className="flex-1" />
        <button type="button" className="uc-btn uc-btn-quiet">Cancel</button>
        <button type="button" className="uc-btn uc-btn-primary">Save</button>
      </MeasuredBare>
    </div>
  );
}

export const FormAt28 = () => (
  <Scale scale={28}>
    <DenseForm />
  </Scale>
);
export const FormAt32 = () => (
  <Scale scale={32}>
    <DenseForm />
  </Scale>
);

/* ------------------------------ Icon size --------------------------- */

function IconRow() {
  return (
    <MeasuredBare>
      <button type="button" className="uc-btn uc-btn-primary">
        <Plus aria-hidden /> New
      </button>
      <label className="uc-field" style={{ width: "10rem" }}>
        <Search aria-hidden />
        <input placeholder="Search" aria-label="Search" />
      </label>
      <PencilTapButton variant="transparent" ariaLabel="Rename" />
      <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
    </MeasuredBare>
  );
}

export const Glyph12 = () => (
  <Scale scale={28} icon={12}>
    <IconRow />
  </Scale>
);
export const Glyph14 = () => (
  <Scale scale={28} icon={14}>
    <IconRow />
  </Scale>
);
export const Glyph16 = () => (
  <Scale scale={28} icon={16}>
    <IconRow />
  </Scale>
);

/* ------------------------------ Micro text -------------------------- */

function MetaList({ meta }: { meta: "10" | "11" }) {
  return (
    <Frame width={420}>
      <div className="divide-y divide-border">
        {ROWS.slice(0, 3).map((r) => (
          <div key={r.name} className="flex min-h-9 items-center gap-2 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] font-medium leading-4">{r.name}</div>
              <div
                className={cn(
                  "truncate leading-4 text-muted-foreground",
                  meta === "10" ? "text-[0.625rem]" : "text-[0.6875rem]",
                )}
              >
                {r.meta}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export const Meta10 = () => <MetaList meta="10" />;
export const Meta11 = () => <MetaList meta="11" />;

/* ------------------------------ Status badge ------------------------ */

function StatusPill({ status, mode }: { status: string; mode: "raw" | "token" }) {
  const tone = STATUS_TONE[status]!;
  const raw: Record<Tone, string> = {
    neutral: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    destructive: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  };
  // The SAME tinted look, expressed as token roles: one place to change,
  // correct in dark mode, and no agent ever types a palette class.
  const token: Record<Tone, string> = {
    neutral: "border-border bg-muted text-muted-foreground",
    success: "border-success/40 bg-success/10 text-success",
    warning: "border-warning/60 bg-warning/15 text-foreground",
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    info: "border-info/40 bg-info/10 text-info",
  };
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] items-center rounded-md border px-1.5 text-[0.6875rem] font-medium",
        mode === "raw" ? raw[tone] : token[tone],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function StatusList({ mode }: { mode: "raw" | "token" }) {
  return (
    <Frame width={420}>
      <div className="divide-y divide-border">
        {ROWS.map((r) => (
          <div key={r.name} className="flex min-h-9 items-center gap-2 px-3 py-1.5">
            <div className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{r.name}</div>
            <StatusPill status={r.status} mode={mode} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export const StatusRaw = () => <StatusList mode="raw" />;
export const StatusTinted = () => <StatusList mode="token" />;

/* ------------------------------ Destructive row --------------------- */

function DeleteRows({ solid }: { solid: boolean }) {
  return (
    <Scale scale={28}>
      <Frame width={420}>
        <div className="divide-y divide-border">
          {ROWS.slice(0, 2).map((r) => (
            <div key={r.name} className="flex min-h-9 items-center gap-1 pl-3 pr-1">
              <div className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{r.name}</div>
              {solid ? (
                <TapTargetButtonSolid icon={<Trash2 />} label="Delete" ariaLabel="Delete" tone="destructive" />
              ) : (
                <TrashTapButton variant="transparent" ariaLabel="Delete" iconColor="text-destructive" />
              )}
            </div>
          ))}
        </div>
      </Frame>
    </Scale>
  );
}

export const DestructiveSolidRow = () => <DeleteRows solid />;
export const DestructiveQuietRow = () => <DeleteRows solid={false} />;

/* ------------------------------ Tabs ------------------------------- */

function UnderlineTabs({ items }: { items: string[] }) {
  const [on, setOn] = useState(items[0]);
  return (
    <div role="tablist" className="flex items-end gap-4 border-b border-border px-3">
      {items.map((i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={on === i}
          onClick={() => setOn(i)}
          className={cn(
            "-mb-px h-8 border-b-2 text-[0.8125rem] font-medium",
            on === i ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function CapsuleTabs({ items }: { items: string[] }) {
  const [on, setOn] = useState(items[0]);
  return (
    <div className="uc-seg matrx-glass-thin-border" role="group">
      {items.map((i) => (
        <button key={i} type="button" className="uc-seg-item" data-on={on === i ? "" : undefined} onClick={() => setOn(i)}>
          {i}
        </button>
      ))}
    </div>
  );
}

const SECTIONS = ["Overview", "Runs", "Settings"];
const FILTERS = ["All", "Mine", "Shared"];

export const TabsAllUnderline = () => (
  <Scale scale={28}>
    <Frame>
      <UnderlineTabs items={SECTIONS} />
      <div className="uc-row px-1.5 py-1.5">
        <UnderlineTabs items={FILTERS} />
      </div>
    </Frame>
  </Scale>
);

export const TabsAllCapsule = () => (
  <Scale scale={28}>
    <Frame>
      <div className="uc-row px-1.5 py-1.5">
        <CapsuleTabs items={SECTIONS} />
      </div>
      <div className="uc-row border-t border-border px-1.5 py-1.5">
        <CapsuleTabs items={FILTERS} />
      </div>
    </Frame>
  </Scale>
);

export const TabsByPurpose = () => (
  <Scale scale={28}>
    <Frame>
      <UnderlineTabs items={SECTIONS} />
      <div className="uc-row px-1.5 py-1.5">
        <CapsuleTabs items={FILTERS} />
        <span className="flex-1" />
        <label className="uc-field" style={{ width: "9rem" }}>
          <Search aria-hidden />
          <input placeholder="Search" aria-label="Search" />
        </label>
      </div>
    </Frame>
  </Scale>
);

/* ------------------------------ Cards ------------------------------ */
/* The same content three ways. All dense, all one surface level: a      */
/* header row, hairline rows, no card inside the card.                   */

const DETAILS = [
  ["Owner", "Ana Ruiz"],
  ["Members", "6 people"],
  ["Last run", "Today, 9:41"],
] as const;

function CardBody() {
  return (
    <>
      <div className="flex min-h-9 items-center gap-2 border-b border-border pl-3 pr-1">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Users className="size-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">Client onboarding</div>
        <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
      </div>
      <dl className="divide-y divide-border">
        {DETAILS.map(([k, v]) => (
          <div key={k} className="flex min-h-8 items-center justify-between gap-3 px-3 text-[0.8125rem]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function CardGrid({ surface }: { surface: string }) {
  return (
    <Scale scale={28}>
      <div className="w-[560px] max-w-full rounded-lg bg-muted/40 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={cn("overflow-hidden rounded-lg bg-card", surface)}>
            <CardBody />
          </div>
          <div className={cn("overflow-hidden rounded-lg bg-card", surface)}>
            <CardBody />
          </div>
        </div>
      </div>
    </Scale>
  );
}

export const CardInset = () => <CardGrid surface="" />;
export const CardBordered = () => <CardGrid surface="border border-border" />;
export const CardElevated = () => <CardGrid surface="shadow-sm ring-1 ring-border/50" />;

/* ------------------------------ Loading ---------------------------- */

/** The owner's rule: every region loads on its own with a skeleton shaped
 *  exactly like what will render there. */
export function LoadingMatched() {
  return (
    <Scale scale={28}>
      <Frame>
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Skeleton className="h-4 w-24" />
          <span className="flex-1" />
          <Skeleton className="h-7 w-40 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
        <div className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex min-h-9 items-center gap-2 px-3 py-1.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-2.5 w-1/4" />
              </div>
              <Skeleton className="h-[1.125rem] w-12 rounded-md" />
              <Skeleton className="size-7 rounded-full" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[0.8125rem]">
          <span className="text-muted-foreground">An action in progress:</span>
          <button type="button" className="uc-btn uc-btn-primary" disabled>
            <Loader2 className="animate-spin" aria-hidden /> Saving
          </button>
        </div>
      </Frame>
    </Scale>
  );
}

export function LoadingPageBlob() {
  return (
    <Frame>
      <div className="p-3">
        <Skeleton className="h-48 w-full" />
      </div>
    </Frame>
  );
}

export function LoadingCenterSpinner() {
  return (
    <Frame>
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    </Frame>
  );
}

/* ------------------------------ Empty state ------------------------ */
/* The structure of "icon + title + action" with the colour of           */
/* EmptyStateCard (a tinted icon disc), at dense sizes, token colours.   */

function EmptyCombined({ size }: { size: "inline" | "block" }) {
  const block = size === "block";
  return (
    <div className={cn("flex flex-col items-center text-center", block ? "gap-2 py-8" : "gap-1.5 py-4")}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 text-primary",
          block ? "size-10" : "size-8",
        )}
      >
        <FolderOpen className={block ? "size-5" : "size-4"} aria-hidden />
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="text-[0.8125rem] font-semibold">No projects yet</div>
        <div className="text-xs text-muted-foreground">Projects group your agents and files.</div>
      </div>
      <button type="button" className="uc-btn uc-btn-primary mt-1">
        <Plus aria-hidden /> New project
      </button>
    </div>
  );
}

export const EmptyCombinedSpecimen = () => (
  <Scale scale={28}>
    <div className="grid w-[560px] max-w-full items-start gap-3 sm:grid-cols-2">
      <Frame width={272}>
        <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          In a list
        </div>
        <EmptyCombined size="inline" />
      </Frame>
      <Frame width={272}>
        <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
          A whole page
        </div>
        <EmptyCombined size="block" />
      </Frame>
    </div>
  </Scale>
);


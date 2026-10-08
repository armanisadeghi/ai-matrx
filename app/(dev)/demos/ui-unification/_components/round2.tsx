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
import { TapTargetButtonSolid } from "@ai-matrx/design-system/tap-target";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import {
  LayoutGridTapButton,
  ListTapButton,
  MoreHorizontalTapButton,
  PencilTapButton,
  TrashTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { FolderOpen, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alt, MeasuredBare } from "./one-control";
import { Badge, Button, ControlRow, ControlScope, DangerZone, DeleteButton, EmptyState, Field, SearchField, SegmentedControl, Select, SettingRow, Tabs } from "@ai-matrx/design-system/controls";

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

export type Tone = "neutral" | "success" | "warning" | "destructive" | "info";

const STATUS_TONE: Record<string, Tone> = { draft: "neutral", live: "success", review: "warning", failed: "destructive" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", live: "Live", review: "In review", failed: "Failed" };

/* ------------------------------ Form height ------------------------- */

function DenseForm() {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-2.5 py-1">
      <div className="flex flex-col gap-1">
        <span className="px-[3px] text-xs font-medium text-muted-foreground">Project name</span>
        <Field style={{ width: "calc(100% - var(--matrx-control-gap))" }} defaultValue="Launch plan" aria-label="Project name" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="px-[3px] text-xs font-medium text-muted-foreground">Owner</span>
        <Select aria-label="Owner" style={{ width: "calc(100% - var(--matrx-control-gap))" }} value="ana" onValueChange={() => {}} options={[{ value: "ana", label: "Ana Ruiz" }]} />
      </div>
      <MeasuredBare>
        <span className="flex-1" />
        <Button variant="quiet">Cancel</Button>
        <Button variant="primary">Save</Button>
      </MeasuredBare>
    </div>
  );
}

export const FormAt28 = () => (
  <Alt size={28}>
    <DenseForm />
  </Alt>
);
export const FormAt32 = () => (
  <Alt size={32}>
    <DenseForm />
  </Alt>
);

/* ------------------------------ Icon size --------------------------- */

function IconRow() {
  return (
    <MeasuredBare>
      <Button variant="primary">
        <Plus aria-hidden /> New
      </Button>
      <SearchField style={{ width: "10rem" }} placeholder="Search" aria-label="Search" />
      <PencilTapButton variant="transparent" ariaLabel="Rename" />
      <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
    </MeasuredBare>
  );
}

export const Glyph12 = () => (
  <Alt size={28} icon={12}>
    <IconRow />
  </Alt>
);
export const Glyph14 = () => (
  <Alt size={28} icon={14}>
    <IconRow />
  </Alt>
);
export const Glyph16 = () => (
  <Alt size={28} icon={16}>
    <IconRow />
  </Alt>
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
  if (mode === "token") return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
  return (
    <span className={cn("inline-flex h-[1.125rem] items-center rounded-md border px-1.5 text-[0.6875rem] font-medium", raw[tone])}>
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
    <Alt size={28}>
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
    </Alt>
  );
}

export const DestructiveSolidRow = () => <DeleteRows solid />;
export const DestructiveQuietRow = () => <DeleteRows solid={false} />;

/* ------------------------------ Tabs ------------------------------- */

function UnderlineTabs({ items }: { items: string[] }) {
  const [on, setOn] = useState(items[0]!);
  return <Tabs aria-label="Sections" value={on} onValueChange={setOn} data={items.map((i) => ({ value: i, label: i }))} />;
}

function CapsuleTabs({ items }: { items: string[] }) {
  const [on, setOn] = useState(items[0]!);
  return <Tabs variant="capsule" aria-label="Filter" value={on} onValueChange={setOn} data={items.map((i) => ({ value: i, label: i }))} />;
}

const SECTIONS = ["Overview", "Runs", "Settings"];
const FILTERS = ["All", "Mine", "Shared"];

export const TabsAllUnderline = () => (
  <Alt size={28}>
    <Frame>
      <UnderlineTabs items={SECTIONS} />
      <ControlRow className="px-1.5 py-1.5">
        <UnderlineTabs items={FILTERS} />
      </ControlRow>
    </Frame>
  </Alt>
);

export const TabsAllCapsule = () => (
  <Alt size={28}>
    <Frame>
      <ControlRow className="px-1.5 py-1.5">
        <CapsuleTabs items={SECTIONS} />
      </ControlRow>
      <ControlRow className="border-t border-border px-1.5 py-1.5">
        <CapsuleTabs items={FILTERS} />
      </ControlRow>
    </Frame>
  </Alt>
);

export const TabsByPurpose = () => (
  <Alt size={28}>
    <Frame>
      <UnderlineTabs items={SECTIONS} />
      <ControlRow className="px-1.5 py-1.5">
        <CapsuleTabs items={FILTERS} />
        <span className="flex-1" />
        <SearchField style={{ width: "9rem" }} placeholder="Search" aria-label="Search" />
      </ControlRow>
    </Frame>
  </Alt>
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
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
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
    <Alt size={28}>
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
    </Alt>
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
    <Alt size={28}>
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
          <Button variant="primary" disabled>
            <Loader2 className="animate-spin" aria-hidden /> Saving
          </Button>
        </div>
      </Frame>
    </Alt>
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

export function EmptyCombined(_props: { size: "inline" | "block" }) {
  return (
    <EmptyState
      icon={<FolderOpen aria-hidden />}
      title="No projects yet"
      line="Projects group your agents and files."
      action={
        <Button variant="primary" icon={<Plus aria-hidden />}>
          New project
        </Button>
      }
    />
  );
}

export const EmptyCombinedSpecimen = () => (
  <Alt size={28}>
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
  </Alt>
);


/* ------------------------------ Delete tiers ----------------------- */
/* One system, three tiers — each with a one-line rule for when to use it.  */

function TierLabel({ n, title, rule }: { n: number; title: string; rule: string }) {
  return (
    <div className="flex items-baseline gap-2 px-3 pt-2 text-xs">
      <span className="font-mono text-muted-foreground">{n}</span>
      <span className="font-semibold text-foreground">{title}</span>
      <span className="truncate text-muted-foreground">{rule}</span>
    </div>
  );
}

export function DeleteTiers() {
  return (
    <ControlScope>
      <Frame width={560}>
        <TierLabel n={1} title="Quiet" rule="Default. Archived, undo in the toast" />
        <div className="flex min-h-9 items-center gap-1 pl-3 pr-1">
          <div className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">Quarterly client report</div>
          <DeleteButton aria-label="Delete Quarterly client report" />
        </div>
        <div className="border-t border-border" />
        <TierLabel n={2} title="Confirm" rule="Permanent or affects others. Names the cost" />
        <div className="mx-3 mb-2 mt-1 flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <div className="text-[0.8125rem] font-semibold">Delete “Intake form — dental”?</div>
          <div className="text-xs text-muted-foreground">Removes 214 responses for 3 people. This can't be undone.</div>
          <ControlRow className="justify-end">
            <Button variant="quiet">Cancel</Button>
            <Button variant="danger">Delete form</Button>
          </ControlRow>
        </div>
        <div className="border-t border-border" />
        <TierLabel n={3} title="Danger zone" rule="Irreversible, account-level. Settings only" />
        <div className="px-3 pb-3 pt-1">
          <DangerZone>
            <SettingRow label="Delete this organization" line="Every project, agent and file, for everyone.">
              <Button variant="danger" icon={<Trash2 aria-hidden />}>
                Delete
              </Button>
            </SettingRow>
          </DangerZone>
        </div>
      </Frame>
    </ControlScope>
  );
}

/* ------------------------------ Selected inside a group ------------- */
/* The real tap group with its first toggle pressed, beside the prototype
   segmented control — the selected thumb must sit evenly inside the track on
   every side, with one outline, not two. */

export function SelectedInGroup() {
  const [view, setView] = useState<"list" | "grid">("list");
  const [scope, setScope] = useState("all");
  return (
    <Alt size={28}>
      <MeasuredBare>
        <TapTargetButtonGroup surface="solid">
          <ListTapButton variant="group" ariaLabel="List view" pressed={view === "list"} onClick={() => setView("list")} />
          <LayoutGridTapButton variant="group" ariaLabel="Grid view" pressed={view === "grid"} onClick={() => setView("grid")} />
        </TapTargetButtonGroup>
        <SegmentedControl
        aria-label="Scope"
        value={scope}
        onValueChange={setScope}
        data={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
          { value: "shared", label: "Shared" },
        ]}
      />
      </MeasuredBare>
    </Alt>
  );
}

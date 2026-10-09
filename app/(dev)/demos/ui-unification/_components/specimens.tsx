"use client";

/**
 * Specimens for the UI-unification decision board.
 *
 * Every specimen renders the REAL component exactly the way the competing call
 * sites in the app render it today. Raw colour classes and size overrides are
 * allowed here ONLY because the override itself is the option being judged
 * (e.g. the raw-amber status badge, the hand-rolled tab bar). Counts quoted in
 * `decisions.tsx` come from the 2026-10-01 AST census of 9,761 .tsx files.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { Input, Skeleton, Button as SurfaceButton } from "@ai-matrx/design-system";
import {
  Copy,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsListLegacy as TabsList, TabsTriggerLegacy as TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/ui/loading-spinner";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import EmptyStateCard from "@/components/official/cards/EmptyStateCard";
import {
  MoreHorizontalTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { toast } from "@/lib/toast";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Measured row: prints the rendered height of every direct child so a */
/* height mismatch is a number, not a squint.                           */
/* ------------------------------------------------------------------ */

function MeasuredRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<number[]>([]);

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      // Radix Select renders a visually-hidden native <select> beside its
      // trigger; it is not a control the person sees, so it is not measured.
      const next = Array.from(row.children)
        .filter(
          (child) =>
            child.getAttribute("aria-hidden") !== "true" &&
            child.getBoundingClientRect().width > 2,
        )
        // A tap-target button's box is the invisible 38px footprint; what
        // the eye lines up is its visible pill (or the group's capsule).
        .map((child) => {
          const visible =
            child.querySelector(".matrx-tap-group-capsule, .matrx-tap-pill") ??
            child;
          return Math.round(visible.getBoundingClientRect().height);
        });
      setHeights((prev) =>
        prev.length === next.length && prev.every((h, i) => h === next[i])
          ? prev
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    Array.from(row.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);

  const mixed = new Set(heights).size > 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={ref}
        className="flex flex-wrap items-center gap-1.5 py-1"
      >
        {children}
      </div>
      <div
        className={cn(
          "font-mono text-xs",
          mixed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {heights.length ? heights.map((h) => `${h}`).join(" · ") + " px" : "—"}
      </div>
    </div>
  );
}



/* ------------------------------ D1b ----------------------------- */
/* What a phone does to the row. Today Button grows its LAYOUT to 44px on a */
/* coarse pointer; the tap system grows an invisible hit area instead.      */

export function TouchGrows() {
  return (
    <MeasuredRow>
      <Button icon={<Plus />} type="submit" variant="primary"> New
      </Button>
      <Button type="submit" variant="outline">
        Export
      </Button>
      <Button icon={<MoreHorizontal />} type="submit" variant="quiet" aria-label="More" />
    </MeasuredRow>
  );
}

export function TouchHitArea() {
  return (
    <MeasuredRow>
      <Button icon={<Plus />} type="submit" variant="primary"> New
      </Button>
      <Button type="submit" variant="outline">
        Export
      </Button>
      <div className="flex items-center">
        <MoreHorizontalTapButton variant="transparent" ariaLabel="More" />
      </div>
    </MeasuredRow>
  );
}

/* ------------------------------ D4 ------------------------------ */

function MetaSpecimen({ textClass }: { textClass: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          Quarterly report
        </span>
        <Badge variant="outline" className={textClass}>
          Draft
        </Badge>
      </div>
      <div className={cn("text-muted-foreground", textClass)}>
        Updated 2h ago · 14 items · Ana Ruiz
      </div>
    </div>
  );
}

export const Micro10 = () => <MetaSpecimen textClass="text-[10px]" />;
export const Micro11 = () => <MetaSpecimen textClass="text-[11px]" />;
export const Micro12 = () => <MetaSpecimen textClass="text-xs" />;

/* ------------------------------ D5 ------------------------------ */

const BADGE_WORDS = ["Draft", "Active", "Archived"];

export function BadgeOutline() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BADGE_WORDS.map((w) => (
        <Badge key={w} variant="outline">
          {w}
        </Badge>
      ))}
    </div>
  );
}

export function BadgeSmallOverride() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BADGE_WORDS.map((w) => (
        <Badge
          key={w}
          variant="outline"
          className="h-4 px-1.5 py-0 text-[10px]"
        >
          {w}
        </Badge>
      ))}
    </div>
  );
}

export function BadgePill() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BADGE_WORDS.map((w) => (
        <span
          key={w}
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]"
        >
          {w}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ D5b ----------------------------- */

export function StatusVariants() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="success">Live</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="info">Queued</Badge>
      <Badge variant="destructive">Failed</Badge>
    </div>
  );
}

export function StatusRawPalette() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        Live
      </Badge>
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      >
        Pending
      </Badge>
      <Badge
        variant="outline"
        className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
      >
        Queued
      </Badge>
      <Badge
        variant="outline"
        className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
      >
        Failed
      </Badge>
    </div>
  );
}

/* ------------------------------ D6 ------------------------------ */

function QuietRow({
  variant,
  className,
}: {
  variant: "ghost" | "subtle";
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5">
      <span className="truncate text-sm text-foreground">Launch plan</span>
      <div className="flex items-center gap-0.5">
        <SurfaceButton size="icon-sm" variant={variant} className={className} aria-label="Edit">
          <Pencil />
        </SurfaceButton>
        <SurfaceButton size="icon-sm" variant={variant} className={className} aria-label="Copy">
          <Copy />
        </SurfaceButton>
        <SurfaceButton size="icon-sm" variant={variant} className={className} aria-label="More">
          <MoreHorizontal />
        </SurfaceButton>
      </div>
    </div>
  );
}

export const QuietGhost = () => <QuietRow variant="ghost" />;
export const QuietMuted = () => (
  <QuietRow
    variant="ghost"
    className="text-muted-foreground hover:text-foreground"
  />
);
export const QuietSubtle = () => <QuietRow variant="subtle" />;

/* ------------------------------ D6b ----------------------------- */

function DeleteRow({ action }: { action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">Old draft</div>
        <div className="text-xs text-muted-foreground">3 days ago</div>
      </div>
      {action}
    </div>
  );
}

export const DestructiveSolid = () => (
  <DeleteRow
    action={
      <Button icon={<Trash2 />} type="submit" variant="danger"> Delete
      </Button>
    }
  />
);

export const DestructiveGhost = () => (
  <DeleteRow
    action={
      <Button
        icon={<Trash2 />}
        type="submit"
        variant="quiet"
      > Delete
      </Button>
    }
  />
);

/* ------------------------------ D8 ------------------------------ */

export function TabsPill() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

const LINE_TRIGGER =
  "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";

export function TabsLine() {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="overview" className={LINE_TRIGGER}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="runs" className={LINE_TRIGGER}>
          Runs
        </TabsTrigger>
        <TabsTrigger value="settings" className={LINE_TRIGGER}>
          Settings
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function TabsSegmented() {
  const [value, setValue] = useState("overview");
  return (
    <SegmentedControl aria-label="Section"
      value={value}
      onValueChange={setValue}
      data={[
        { value: "overview", label: "Overview" },
        { value: "runs", label: "Runs" },
        { value: "settings", label: "Settings" },
      ]}
    />
  );
}

export function TabsHandRolled() {
  const [value, setValue] = useState("overview");
  return (
    <div className="flex items-center gap-1">
      {["overview", "runs", "settings"].map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setValue(v)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
            value === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ D9 ------------------------------ */

function DigestBody() {
  return (
    <>
      <p className="text-sm text-muted-foreground">12 new runs this week.</p>
      <p className="text-sm text-muted-foreground">2 need review.</p>
      <Button type="submit" variant="outline" className="mt-2">
        Open
      </Button>
    </>
  );
}

export const CardHostDefault = () => (
  <Card>
    <CardHeader>
      <CardTitle>Weekly digest</CardTitle>
    </CardHeader>
    <CardContent>
      <DigestBody />
    </CardContent>
  </Card>
);

export const CardMd = () => (
  <Card size="md">
    <CardHeader>
      <CardTitle>Weekly digest</CardTitle>
    </CardHeader>
    <CardContent>
      <DigestBody />
    </CardContent>
  </Card>
);

export const CardPadded = () => (
  <Card className="p-4">
    <CardHeader>
      <CardTitle>Weekly digest</CardTitle>
    </CardHeader>
    <CardContent>
      <DigestBody />
    </CardContent>
  </Card>
);

export const CardHandRolled = () => (
  <div className="rounded-lg border border-border bg-card p-4">
    <h3 className="mb-1 text-sm font-semibold text-foreground">
      Weekly digest
    </h3>
    <DigestBody />
  </div>
);

/* ------------------------------ D10 ----------------------------- */

function WidthDialog({ widthClass }: { widthClass: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          Open {widthClass}
        </Button>
      </DialogTrigger>
      <DialogContent className={widthClass}>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
        </DialogHeader>
        <Input defaultValue="Launch plan" aria-label="Project name" />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="primary">Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const DialogMd = () => <WidthDialog widthClass="sm:max-w-md" />;
export const DialogLg = () => <WidthDialog widthClass="max-w-lg" />;
export const Dialog2xl = () => <WidthDialog widthClass="max-w-2xl" />;
export const Dialog3xl = () => <WidthDialog widthClass="max-w-3xl" />;

/* ------------------------------ D11 ----------------------------- */

function LoadBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-md border border-border bg-background p-3">
      {children}
    </div>
  );
}

export const LoadSpin = () => (
  <LoadBox>
    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  </LoadBox>
);
export const LoadSpinner = () => (
  <LoadBox>
    <LoadingSpinner size="sm" />
  </LoadBox>
);
export const LoadMini = () => (
  <LoadBox>
    <MatrxMiniLoader />
  </LoadBox>
);
export const LoadSkeleton = () => (
  <LoadBox>
    <div className="flex w-full flex-col gap-2">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </LoadBox>
);

/* ------------------------------ D12 ----------------------------- */

function EmptyBox({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-48 items-center justify-center rounded-md border border-border bg-background p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const EmptyText = () => (
  <EmptyBox>
    <p className="text-sm text-muted-foreground">No projects yet</p>
  </EmptyBox>
);

export const EmptyComposed = () => (
  <EmptyBox>
    <div className="flex flex-col items-center gap-2 text-center">
      <FolderOpen className="h-8 w-8 text-muted-foreground" />
      <div className="text-sm font-medium text-foreground">No projects</div>
      <div className="text-xs text-muted-foreground">
        Create one to get started.
      </div>
      <Button icon={<Plus />} type="submit" variant="primary"> New project
      </Button>
    </div>
  </EmptyBox>
);

export const EmptyDashed = () => (
  <EmptyBox className="border-2 border-dashed">
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-muted-foreground">No projects yet</p>
      <Button icon={<Plus />} type="submit" variant="outline"> New project
      </Button>
    </div>
  </EmptyBox>
);

export const EmptyOfficial = () => (
  <EmptyStateCard
    title="No projects"
    description="Create one to get started."
    icon={FolderOpen}
    buttonText="New project"
    onButtonClick={() => toast.info("Specimen only")}
  />
);

/* ------------------------------ D13 ----------------------------- */

export function ToastCanonical() {
  return (
    <Button
      variant="outline"
      onClick={() => toast.success("Project saved")}
    >
      Fire lib/toast
    </Button>
  );
}

export function ToastLegacy() {
  const { toast: legacyToast } = useToast();
  return (
    <Button
      variant="outline"
      onClick={() =>
        legacyToast({ title: "Project saved", description: "Launch plan" })
      }
    >
      Fire useToast
    </Button>
  );
}

/* ------------------------------ D14 ----------------------------- */

function RadiusPanel({ radius }: { radius: string }) {
  return (
    <div className={cn("border border-border bg-card p-3", radius)}>
      <div className="text-sm font-medium text-foreground">Storage</div>
      <div className="text-xs text-muted-foreground">2.4 GB of 5 GB</div>
      <div className={cn("mt-2 h-1.5 w-full bg-muted", radius)}>
        <div className={cn("h-full w-1/2 bg-primary", radius)} />
      </div>
    </div>
  );
}

export const RadiusMd = () => <RadiusPanel radius="rounded-md" />;
export const RadiusLg = () => <RadiusPanel radius="rounded-lg" />;
export const RadiusXl = () => <RadiusPanel radius="rounded-xl" />;

/* ------------------------------ D15 ----------------------------- */
/* The same settings screen at phone width (360px), built three ways. The  */
/* frame is the phone; everything inside it is the option being judged.   */

const PHONE_ROWS = [
  { label: "Notifications", value: "On" },
  { label: "Default model", value: "Claude Opus" },
  { label: "Language", value: "English" },
];

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="w-[360px] max-w-full overflow-hidden rounded-md border border-border bg-background">
      {children}
    </div>
  );
}

export function PhoneNested() {
  return (
    <Phone>
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              {PHONE_ROWS.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.label}</span>
                  <span className="truncate text-muted-foreground">{r.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Phone>
  );
}

export function PhoneFlat() {
  return (
    <Phone>
      <div className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">
        Preferences
      </div>
      <div className="divide-y divide-border border-y border-border">
        {PHONE_ROWS.map((r) => (
          <div key={r.label} className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="truncate text-muted-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </Phone>
  );
}

export function PhoneInsetGrouped() {
  return (
    <Phone>
      <div className="bg-muted/40 px-3 py-3">
        <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">
          Preferences
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-lg bg-card">
          {PHONE_ROWS.map((r) => (
            <div key={r.label} className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="truncate text-muted-foreground">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Phone>
  );
}

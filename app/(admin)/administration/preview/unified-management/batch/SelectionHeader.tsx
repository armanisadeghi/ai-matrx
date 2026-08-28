"use client";

import { Ban, Boxes, CheckCircle2, MapPin, Workflow } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { JOBS, PLACES, type MandateJob, type Place } from "./mock-data";

/**
 * The batch is a rectangle: a SET of jobs × a SET of places. The shortcut
 * editor could only ever pick surfaces for one shortcut; this picks both sides.
 */
export function SelectionHeader({
  selectedJobs,
  selectedPlaces,
  onToggleJob,
  onTogglePlace,
  onSetJobs,
  onSetPlaces,
}: {
  selectedJobs: ReadonlySet<string>;
  selectedPlaces: ReadonlySet<string>;
  onToggleJob: (key: string) => void;
  onTogglePlace: (name: string) => void;
  onSetJobs: (keys: string[]) => void;
  onSetPlaces: (names: string[]) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel
        icon={Boxes}
        title="Jobs"
        subtitle={`${selectedJobs.size} of ${JOBS.length} selected`}
        onAll={() => onSetJobs(JOBS.map((j) => j.key))}
        onNone={() => onSetJobs([])}
      >
        {JOBS.map((job) => (
          <JobRow
            key={job.key}
            job={job}
            checked={selectedJobs.has(job.key)}
            onToggle={() => onToggleJob(job.key)}
          />
        ))}
      </Panel>

      <Panel
        icon={MapPin}
        title="Places"
        subtitle={`${selectedPlaces.size} of ${PLACES.length} selected`}
        onAll={() => onSetPlaces(PLACES.map((p) => p.name))}
        onNone={() => onSetPlaces([])}
      >
        {PLACES.map((place) => (
          <PlaceRow
            key={place.name}
            place={place}
            checked={selectedPlaces.has(place.name)}
            onToggle={() => onTogglePlace(place.name)}
          />
        ))}
      </Panel>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  onAll,
  onNone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onAll: () => void;
  onNone: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onAll}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            All
          </button>
          <button
            type="button"
            onClick={onNone}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            None
          </button>
        </div>
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

const HOLDER_META: Record<
  MandateJob["holder"],
  { label: string; className: string }
> = {
  agent: {
    label: "Agent",
    className: "bg-primary/10 text-primary",
  },
  user_agent: {
    label: "User agent",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  workflow: {
    label: "Workflow",
    className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
};

function JobRow({
  job,
  checked,
  onToggle,
}: {
  job: MandateJob;
  checked: boolean;
  onToggle: () => void;
}) {
  const holder = HOLDER_META[job.holder];
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors hover:bg-accent/30",
        checked && "bg-accent/20",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {job.label}
          </span>
          <Pill className={holder.className}>
            {job.holder === "workflow" && (
              <Workflow className="mr-0.5 inline h-2.5 w-2.5" />
            )}
            {holder.label}
          </Pill>
          <Pill
            className={
              job.meeting === "discovered"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            }
          >
            {job.meeting}
          </Pill>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
          {job.key}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          {job.consumes.map((c) => (
            <span
              key={c.key}
              className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground"
            >
              {c.key}
              {c.required && <span className="text-rose-500">*</span>}
            </span>
          ))}
        </span>
      </span>
    </label>
  );
}

function PlaceRow({
  place,
  checked,
  onToggle,
}: {
  place: Place;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors hover:bg-accent/30",
        checked && "bg-accent/20",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {place.label}
          </span>
          <Pill className="bg-muted text-muted-foreground">{place.client}</Pill>
          {place.excludes && place.excludes.length > 0 && (
            <Pill className="bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Ban className="mr-0.5 inline h-2.5 w-2.5" />
              excludes {place.excludes.length}
            </Pill>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
          {place.name}
        </span>
        {place.note && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 shrink-0 opacity-60" />
            {place.note}
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {place.provides.map((v) => (
            <span
              key={v.id}
              title={`${v.label} · ${v.owner} · ${v.id}`}
              className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground"
            >
              {v.key}
            </span>
          ))}
        </span>
      </span>
    </label>
  );
}

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}

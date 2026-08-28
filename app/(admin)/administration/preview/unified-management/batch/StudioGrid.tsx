"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Ban,
  CheckCircle2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BindingCell } from "./BindingCell";
import { TreatmentValueControl } from "./TreatmentControls";
import {
  KNOWN_VALUES,
  TEMPLATE_TREATMENT,
  TREATMENT_FIELDS,
  isExcluded,
  isSettled,
  type Binding,
  type CascadeMode,
  type ConsumedKey,
  type MandateJob,
  type Place,
  type TreatmentKey,
  type TreatmentValue,
} from "./mock-data";

const ALL_KNOWN_VALUES = Object.values(KNOWN_VALUES);

export interface GridHandlers {
  resolveBinding: (
    job: MandateJob,
    place: Place,
    consumed: ConsumedKey,
  ) => Binding;
  resolveTreatment: (
    job: MandateJob,
    place: Place,
    key: TreatmentKey,
  ) => TreatmentValue;
  onCellBindingChange: (
    job: MandateJob,
    place: Place,
    consumed: ConsumedKey,
    next: Binding,
  ) => void;
  onCellTreatmentChange: (
    job: MandateJob,
    place: Place,
    key: TreatmentKey,
    next: TreatmentValue,
  ) => void;
  onFillBindingColumn: (
    job: MandateJob,
    consumed: ConsumedKey,
    next: Binding,
  ) => void;
  onFillTreatmentColumn: (
    job: MandateJob,
    key: TreatmentKey,
    next: TreatmentValue,
  ) => void;
}

/**
 * The grid: one block per job, one row per place, one column per per-cell field.
 * Same interaction grammar as the shortcut batch grid — sticky first column,
 * a fill-down arrow in every column header, a status dot per row, and the
 * whole thing driven by the three-level cascade above it.
 */
export function StudioGrid({
  jobs,
  places,
  bindingModes,
  treatmentModes,
  attentionOnly,
  handlers,
}: {
  jobs: readonly MandateJob[];
  places: readonly Place[];
  bindingModes: Readonly<Record<string, CascadeMode>>;
  treatmentModes: Readonly<Record<TreatmentKey, CascadeMode>>;
  attentionOnly: boolean;
  handlers: GridHandlers;
}) {
  if (jobs.length === 0 || places.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        Pick at least one job and one place above to build the grid.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobBlock
          key={job.key}
          job={job}
          places={places}
          bindingModes={bindingModes}
          treatmentModes={treatmentModes}
          attentionOnly={attentionOnly}
          handlers={handlers}
        />
      ))}
    </div>
  );
}

function JobBlock({
  job,
  places,
  bindingModes,
  treatmentModes,
  attentionOnly,
  handlers,
}: {
  job: MandateJob;
  places: readonly Place[];
  bindingModes: Readonly<Record<string, CascadeMode>>;
  treatmentModes: Readonly<Record<TreatmentKey, CascadeMode>>;
  attentionOnly: boolean;
  handlers: GridHandlers;
}) {
  const bindingColumns = job.consumes.filter(
    (c) => (bindingModes[c.key] ?? "cell") === "cell",
  );
  const treatmentColumns = TREATMENT_FIELDS.filter(
    (f) => treatmentModes[f.key] === "cell",
  );
  const hasColumns = bindingColumns.length > 0 || treatmentColumns.length > 0;

  const visiblePlaces = places.filter((place) => {
    if (!attentionOnly) return true;
    if (isExcluded(job, place)) return false;
    return rowAttention(job, place, handlers).unsettled > 0;
  });

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold text-foreground">
          {job.label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {job.key}
        </span>
        <span
          className={cn(
            "inline-flex h-4 items-center rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
            job.meeting === "discovered"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {job.meeting}
        </span>
        <span className="inline-flex h-4 items-center gap-0.5 rounded bg-primary/10 px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
          {job.holder === "workflow" && <Workflow className="h-2.5 w-2.5" />}
          {job.holderLabel}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          → {job.outputKind}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[220px] border-b border-r border-border bg-muted/50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Place
              </th>

              {treatmentColumns.map((f) => (
                <th
                  key={f.key}
                  className="min-w-[150px] border-b border-border px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={f.hint}>
                      {f.label}
                    </span>
                    <FillButton
                      title="Set this treatment on every place"
                      caveat="Treatments fill cleanly — every place can render any mode."
                      render={(value, set) => (
                        <TreatmentValueControl
                          def={f}
                          value={
                            (value as TreatmentValue | undefined) ??
                            TEMPLATE_TREATMENT[f.key]
                          }
                          onChange={set}
                        />
                      )}
                      onApply={(v) =>
                        handlers.onFillTreatmentColumn(
                          job,
                          f.key,
                          (v ?? TEMPLATE_TREATMENT[f.key]) as TreatmentValue,
                        )
                      }
                    />
                  </div>
                </th>
              ))}

              {bindingColumns.map((c) => (
                <th
                  key={c.key}
                  className="min-w-[230px] border-b border-border px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={c.key}>
                      {c.label}
                    </span>
                    {c.required && (
                      <span className="text-rose-500" title="Required">
                        *
                      </span>
                    )}
                    <FillButton
                      title="Set this input on every place"
                      caveat="Direct values and prompts fill cleanly; a known value only lands where that identity exists."
                      render={(value, set) => (
                        <BindingCell
                          consumed={c}
                          binding={
                            (value as Binding | undefined) ??
                            (c.templateValueId
                              ? { kind: "known_value", valueId: c.templateValueId }
                              : { kind: "prompt_user", prompt: `Enter ${c.label}` })
                          }
                          candidates={ALL_KNOWN_VALUES}
                          placeLabel="Every place in this block"
                          onChange={set}
                          compact={false}
                        />
                      )}
                      onApply={(v) => {
                        const next =
                          (v as Binding | undefined) ??
                          (c.templateValueId
                            ? ({ kind: "known_value", valueId: c.templateValueId } as Binding)
                            : ({ kind: "prompt_user", prompt: `Enter ${c.label}` } as Binding));
                        handlers.onFillBindingColumn(job, c, next);
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visiblePlaces.map((place) => {
              const excluded = isExcluded(job, place);
              const att = rowAttention(job, place, handlers);
              return (
                <tr
                  key={place.name}
                  className={cn(
                    excluded ? "opacity-55" : "hover:bg-accent/30",
                  )}
                >
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-background px-3 py-1.5 align-middle">
                    <div className="flex min-w-0 items-center gap-2">
                      {excluded ? (
                        <Ban
                          className="h-4 w-4 shrink-0 text-rose-500"
                          aria-label="Excluded"
                        />
                      ) : (
                        <StatusDot att={att} />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {place.label}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {place.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {excluded ? (
                    <td
                      colSpan={treatmentColumns.length + bindingColumns.length}
                      className="border-b border-border px-3 py-1.5 text-[11px] italic text-muted-foreground"
                    >
                      This place explicitly excludes{" "}
                      <span className="font-mono not-italic">{job.key}</span> —
                      categories curate, exclusions are the only thing that
                      removes a pair.
                    </td>
                  ) : (
                    <>
                      {treatmentColumns.map((f) => (
                        <td
                          key={f.key}
                          className="border-b border-border px-2 py-1.5 align-middle"
                        >
                          <TreatmentValueControl
                            def={f}
                            value={handlers.resolveTreatment(job, place, f.key)}
                            onChange={(v) =>
                              handlers.onCellTreatmentChange(job, place, f.key, v)
                            }
                            compact
                          />
                        </td>
                      ))}

                      {bindingColumns.map((c) => (
                        <td
                          key={c.key}
                          className="border-b border-border px-2 py-1.5 align-middle"
                        >
                          <BindingCell
                            consumed={c}
                            binding={handlers.resolveBinding(job, place, c)}
                            candidates={place.provides}
                            placeLabel={place.label}
                            onChange={(b) =>
                              handlers.onCellBindingChange(job, place, c, b)
                            }
                          />
                        </td>
                      ))}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasColumns && (
        <div className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          No per-cell columns — everything on this job is inherited or set for
          all. Flip a row to <span className="font-medium">Per-cell</span> above
          to edit it here.
        </div>
      )}
      {attentionOnly && visiblePlaces.length === 0 && (
        <div className="border-t border-border px-3 py-6 text-center text-xs text-muted-foreground">
          <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-500" />
          Every place is settled for this job.
        </div>
      )}
    </section>
  );
}

function rowAttention(
  job: MandateJob,
  place: Place,
  handlers: GridHandlers,
): { unsettled: number; red: number } {
  let unsettled = 0;
  let red = 0;
  for (const c of job.consumes) {
    const b = handlers.resolveBinding(job, place, c);
    if (b.kind === "unresolved") {
      red += 1;
      unsettled += 1;
    } else if (!isSettled(b)) {
      unsettled += 1;
    }
  }
  return { unsettled, red };
}

function StatusDot({ att }: { att: { unsettled: number; red: number } }) {
  if (att.red > 0) {
    return (
      <span title={`${att.red} with nothing available`}>
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
      </span>
    );
  }
  if (att.unsettled > 0) {
    return (
      <span title={`${att.unsettled} awaiting confirmation`}>
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      </span>
    );
  }
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
}

function FillButton({
  title,
  caveat,
  render,
  onApply,
}: {
  title: string;
  caveat: string;
  render: (value: unknown, set: (v: unknown) => void) => React.ReactNode;
  onApply: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
          title={title}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3">
        <p className="text-[11px] text-muted-foreground">{caveat}</p>
        {render(value, setValue)}
        <Button
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() => {
            onApply(value);
            setOpen(false);
          }}
        >
          Apply to every place
        </Button>
      </PopoverContent>
    </Popover>
  );
}

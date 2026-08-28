"use client";

import { useState } from "react";
import { FileStack, Filter } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CascadePanel } from "./CascadePanel";
import { ChangesFooter, type ChangesSummary } from "./ChangesFooter";
import { SelectionHeader } from "./SelectionHeader";
import { StudioGrid, type GridHandlers } from "./StudioGrid";
import { ModeIcon } from "./TreatmentControls";
import {
  DEFAULT_SELECTED_JOBS,
  DEFAULT_SELECTED_PLACES,
  JOBS,
  PLACES,
  TEMPLATE_LABEL,
  TEMPLATE_TREATMENT,
  TREATMENT_FIELDS,
  autoResolve,
  cellKey,
  formatTreatment,
  isExcluded,
  isSettled,
  pairKey,
  type Binding,
  type CascadeMode,
  type ConsumedKey,
  type MandateJob,
  type Place,
  type TreatmentKey,
  type TreatmentValue,
} from "./mock-data";

const DEFAULT_TREATMENT_MODES: Record<TreatmentKey, CascadeMode> = {
  displayMode: "cell",
  hideVariables: "inherit",
  autoRun: "cell",
  iconName: "all",
  categoryId: "all",
};

type CellTreatmentMap = Record<string, Partial<Record<TreatmentKey, TreatmentValue>>>;

/**
 * THE BATCH STUDIO — the shortcut batch grid, elevated.
 *
 * Everything below is one flow: choose the rectangle (jobs × places), decide
 * once per field where its value comes from, then answer only the cells the
 * platform could not answer for you.
 */
export function BatchStudio() {
  const [selectedJobs, setSelectedJobs] = useState<ReadonlySet<string>>(
    new Set(DEFAULT_SELECTED_JOBS),
  );
  const [selectedPlaces, setSelectedPlaces] = useState<ReadonlySet<string>>(
    new Set(DEFAULT_SELECTED_PLACES),
  );

  const [bindingModes, setBindingModes] = useState<Record<string, CascadeMode>>(
    {},
  );
  const [bindingAllValues, setBindingAllValues] = useState<
    Record<string, Binding>
  >({});
  const [treatmentModes, setTreatmentModes] = useState<
    Record<TreatmentKey, CascadeMode>
  >(DEFAULT_TREATMENT_MODES);
  const [treatmentAllValues, setTreatmentAllValues] = useState<
    Partial<Record<TreatmentKey, TreatmentValue>>
  >({ iconName: "Languages", categoryId: "cat-writing" });

  const [cellBindings, setCellBindings] = useState<Record<string, Binding>>({});
  const [cellTreatments, setCellTreatments] = useState<CellTreatmentMap>({});
  const [attentionOnly, setAttentionOnly] = useState(false);

  const jobs = JOBS.filter((j) => selectedJobs.has(j.key));
  const places = PLACES.filter((p) => selectedPlaces.has(p.name));

  // Union of every key the selected jobs consume — one decision per key, even
  // when four different jobs consume it.
  const consumedKeys: ConsumedKey[] = [];
  for (const job of jobs) {
    for (const c of job.consumes) {
      if (!consumedKeys.some((k) => k.key === c.key)) consumedKeys.push(c);
    }
  }

  // ── The cascade resolver ──────────────────────────────────────────────────

  const landBinding = (
    b: Binding,
    place: Place,
    consumed: ConsumedKey,
  ): Binding =>
    b.kind === "known_value"
      ? autoResolve({ ...consumed, templateValueId: b.valueId }, place)
      : b;

  const resolveBinding = (
    job: MandateJob,
    place: Place,
    consumed: ConsumedKey,
  ): Binding => {
    const override = cellBindings[cellKey(job.key, place.name, consumed.key)];
    if (override) return override;
    if ((bindingModes[consumed.key] ?? "cell") === "all") {
      const all = bindingAllValues[consumed.key];
      if (all) return landBinding(all, place, consumed);
    }
    return autoResolve(consumed, place);
  };

  const resolveTreatment = (
    job: MandateJob,
    place: Place,
    key: TreatmentKey,
  ): TreatmentValue => {
    const override = cellTreatments[pairKey(job.key, place.name)]?.[key];
    if (override !== undefined) return override;
    if (treatmentModes[key] === "all")
      return treatmentAllValues[key] ?? TEMPLATE_TREATMENT[key];
    return TEMPLATE_TREATMENT[key];
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handlers: GridHandlers = {
    resolveBinding,
    resolveTreatment,
    onCellBindingChange: (job, place, consumed, next) =>
      setCellBindings((prev) => ({
        ...prev,
        [cellKey(job.key, place.name, consumed.key)]: next,
      })),
    onCellTreatmentChange: (job, place, key, next) =>
      setCellTreatments((prev) => {
        const pk = pairKey(job.key, place.name);
        return { ...prev, [pk]: { ...prev[pk], [key]: next } };
      }),
    onFillBindingColumn: (job, consumed, next) =>
      setCellBindings((prev) => {
        const patch: Record<string, Binding> = { ...prev };
        for (const place of places) {
          if (isExcluded(job, place)) continue;
          patch[cellKey(job.key, place.name, consumed.key)] = landBinding(
            next,
            place,
            consumed,
          );
        }
        return patch;
      }),
    onFillTreatmentColumn: (job, key, next) =>
      setCellTreatments((prev) => {
        const patch: CellTreatmentMap = { ...prev };
        for (const place of places) {
          if (isExcluded(job, place)) continue;
          const pk = pairKey(job.key, place.name);
          patch[pk] = { ...patch[pk], [key]: next };
        }
        return patch;
      }),
  };

  // ── The receipt ───────────────────────────────────────────────────────────

  const summary = summarize({
    jobs,
    places,
    resolveBinding,
    resolveTreatment,
  });

  return (
    <div className="space-y-4">
      <SelectionHeader
        selectedJobs={selectedJobs}
        selectedPlaces={selectedPlaces}
        onToggleJob={(key) =>
          setSelectedJobs((prev) => toggled(prev, key))
        }
        onTogglePlace={(name) =>
          setSelectedPlaces((prev) => toggled(prev, name))
        }
        onSetJobs={(keys) => setSelectedJobs(new Set(keys))}
        onSetPlaces={(names) => setSelectedPlaces(new Set(names))}
      />

      <TemplateStrip />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              The cascade
            </h2>
            <span className="text-[11px] text-muted-foreground">
              Template → Set for all → Per-cell
            </span>
          </div>
          <CascadePanel
            consumedKeys={consumedKeys}
            bindingModes={bindingModes}
            bindingAllValues={bindingAllValues}
            treatmentModes={treatmentModes}
            treatmentAllValues={treatmentAllValues}
            onBindingModeChange={(key, mode) =>
              setBindingModes((prev) => ({ ...prev, [key]: mode }))
            }
            onBindingAllValueChange={(key, binding) =>
              setBindingAllValues((prev) => ({ ...prev, [key]: binding }))
            }
            onTreatmentModeChange={(key, mode) =>
              setTreatmentModes((prev) => ({ ...prev, [key]: mode }))
            }
            onTreatmentAllValueChange={(key, value) =>
              setTreatmentAllValues((prev) => ({ ...prev, [key]: value }))
            }
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              The grid — {jobs.length} jobs × {places.length} places
            </h2>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Needs attention only
              <Switch
                checked={attentionOnly}
                onCheckedChange={setAttentionOnly}
                className="scale-90"
              />
            </label>
          </div>
          <StudioGrid
            jobs={jobs}
            places={places}
            bindingModes={bindingModes}
            treatmentModes={treatmentModes}
            attentionOnly={attentionOnly}
            handlers={handlers}
          />
        </div>
      </div>

      <ChangesFooter summary={summary} />
    </div>
  );
}

/** Level 1 of the cascade, always visible: where every cell starts from. */
function TemplateStrip() {
  return (
    <section className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <FileStack className="h-3.5 w-3.5" />
          Template
        </span>
        <span className="text-sm font-medium text-foreground">
          {TEMPLATE_LABEL}
        </span>
        <span className="h-4 w-px bg-border" />
        {TREATMENT_FIELDS.map((f) => (
          <span
            key={f.key}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            title={f.hint}
          >
            {f.key === "iconName" && (
              <ModeIcon
                name={String(TEMPLATE_TREATMENT.iconName)}
                className="h-3 w-3"
              />
            )}
            <span className="text-muted-foreground/70">{f.label}</span>
            <span className="font-medium text-foreground">
              {formatTreatment(f.key, TEMPLATE_TREATMENT[f.key])}
            </span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Every cell below starts here and is free to leave. Nothing is locked —
        an inherited value is a starting point, never a constraint.
      </p>
    </section>
  );
}

function toggled(prev: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function summarize({
  jobs,
  places,
  resolveBinding,
  resolveTreatment,
}: {
  jobs: readonly MandateJob[];
  places: readonly Place[];
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
}): ChangesSummary {
  let bindingsCreated = 0;
  let treatmentsSet = 0;
  let matchesToConfirm = 0;
  let cellsUnresolved = 0;
  let pairsExcluded = 0;
  let pairsTotal = 0;

  for (const job of jobs) {
    for (const place of places) {
      if (isExcluded(job, place)) {
        pairsExcluded += 1;
        continue;
      }
      pairsTotal += 1;

      for (const c of job.consumes) {
        const b = resolveBinding(job, place, c);
        if (b.kind === "unresolved") cellsUnresolved += 1;
        else if (b.kind === "rematch" && !b.confirmed) matchesToConfirm += 1;
        else if (isSettled(b)) bindingsCreated += 1;
      }

      for (const f of TREATMENT_FIELDS) {
        if (resolveTreatment(job, place, f.key) !== TEMPLATE_TREATMENT[f.key])
          treatmentsSet += 1;
      }
    }
  }

  return {
    bindingsCreated,
    treatmentsSet,
    matchesToConfirm,
    cellsUnresolved,
    pairsExcluded,
    pairsTotal,
  };
}

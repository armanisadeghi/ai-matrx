"use client";

// features/bindings/BindingMiddle.tsx
//
// THE MIDDLE — where the match is made.
//
// 🚨 The row itself is `SurfaceVariableBinding`, imported and rendered VERBATIM
// from `features/surfaces/admin/columns/SurfaceVariableBinding.tsx`. That is
// the component already serving the agent↔surface workspace, the surface bind
// panel, the shortcut editor and the batch grid — the one Arman called "a
// completely different level". This adds a fifth call site; it does not add a
// fifth implementation. Everything it already gives comes along for free:
// the fixed-height detail panel (P2 — flipping sources never reflows the list),
// the four sources named in words (P3), the current holder default on screen
// (P5), options priced at the point of choice (P6) and each option's runtime
// consequence as a sentence (P10).
//
// What this file COMPOSES around it, because a job binding needs it and a
// surface binding does not:
//
//   · D18.2 MANY-TO-ONE. A job may offer fifty values while the holder has two
//     inputs. The shared row owns source 0; the strip beneath owns sources 1..n,
//     which are concatenated into the same input in that order, separated by a
//     blank line. Reorder and remove live there.
//   · D18.3 the channel. A context slot is a first-class target and says so.
//   · P4 the productive empty state — a row seeded by the name match says it was
//     seeded, so an automatic decision is visible before it is saved.
//   · P7 per-row problems in domain words, on the row that caused them, from
//     `consumptionMapProblems` — the same pre-flight the save uses.
//   · ALL FOUR SOURCES, for real. Holder Default (absence), Offered Value,
//     Direct Value and Prompt User all store now; the stand-in that refused the
//     last two while the server could not carry them is deleted.

import { AlertTriangle, ArrowDown, ArrowUp, Plus, X, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { SurfaceVariableBinding } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import {
  consumptionMapProblems,
  describeSource,
  isOfferedSource,
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import { offeredValuesToSurfaceValues } from "./offered-adapter";
import { sourceLabelsFor } from "./words";

/** The one source kind that can be absent, and so the one that answers for it. */
type OfferedSource = Extract<ConsumptionEntry, { mapType: "offered_value" }>;
import {
  addSource,
  applyRowMapping,
  mappingForRow,
  moveSource,
  patchSourceAt,
  removeSourceAt,
  sourcesFor,
} from "./consumption-writer";

export interface BindingMiddleProps {
  /** Agent or workflow — only the wording of the "own default" source differs. */
  holderKind: "agent" | "workflow";
  targets: readonly BindingTarget[];
  contextKeys: ReadonlySet<string>;
  offered: readonly OfferedValue[];
  /** Offered values the platform delivers itself — demoted, never hidden (P8). */
  pinnedContext: readonly string[];
  value: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  /** Inputs seeded by the exact-name match this session (P4). */
  autoBound: ReadonlySet<string>;
  disabled?: boolean;
}

export function BindingMiddle({
  holderKind,
  targets,
  contextKeys,
  offered,
  pinnedContext,
  value,
  onChange,
  autoBound,
  disabled = false,
}: BindingMiddleProps) {
  if (targets.length === 0) return null;

  return (
    <div className="space-y-3">
      {targets.map((target) => (
        <BindingMiddleRow
          key={target.name}
          holderKind={holderKind}
          target={target}
          isContext={contextKeys.has(target.name)}
          offered={offered}
          pinnedContext={pinnedContext}
          value={value}
          onChange={onChange}
          autoBound={autoBound}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/**
 * ONE HOLDER INPUT'S FULL CARD — the shared row, the example, the absence
 * answer, the per-row problems, the many-to-one strip and "also feed this
 * input…".
 *
 * 🚨 Exported because BATCH MODE's Advanced popover opens THIS, not a reduced
 * copy of it (P17: "an Advanced popover that opens the full card"). One card,
 * two modes: a person who learns the match in one place has learned it in the
 * other, and a fix lands in both.
 */
export function BindingMiddleRow({
  holderKind,
  target,
  isContext,
  offered,
  pinnedContext,
  value,
  onChange,
  autoBound,
  disabled = false,
}: {
  holderKind: "agent" | "workflow";
  target: BindingTarget;
  isContext: boolean;
  offered: readonly OfferedValue[];
  pinnedContext: readonly string[];
  value: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  autoBound: ReadonlySet<string>;
  disabled?: boolean;
}) {
  const offeredByName = new Map(offered.map((v) => [v.name, v]));
  const pinned = new Set(pinnedContext);
  // Pinned context arrives on its own; mapping it again would deliver it twice.
  // It stays visible in the offered column with the reason — this is the
  // picker's list, not the inventory.
  const selectable = offered.filter((v) => !pinned.has(v.name));
  const selectableSurfaceValues = offeredValuesToSurfaceValues(selectable);
  const sourceLabels = sourceLabelsFor(holderKind);

  const sources = sourcesFor(value, target.name);
  const deliver: ConsumptionEntry["deliver"] = isContext
    ? "context"
    : "variable";
  const remaining = selectable.filter(
    (v) =>
      !sources.some(
        (entry) => isOfferedSource(entry) && entry.target === v.name,
      ),
  );

  // The SAME pre-flight the save runs, narrowed to this row — so the
  // problem is printed where it was caused, never as a list at the bottom.
  // A source still waiting for its pick is NOT "consumes something this
  // job does not offer": it is an unfinished choice, and it gets its own
  // sentence below rather than a confusing one from the pre-flight.
  const chosen = sources.filter(
    (entry) => !isOfferedSource(entry) || entry.target !== "",
  );
  const awaitingPick = sources.length > chosen.length;
  const rowProblems = consumptionMapProblems(
    { values: offered },
    chosen.length > 0 ? { [target.name]: chosen } : {},
  );
  const unfedRequired =
    target.required === true &&
    sources.length === 0 &&
    !hasHolderDefault(target.defaultValue);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
        <Badge
          variant="outline"
          className="py-0 text-[9px] text-muted-foreground"
        >
          {isContext ? "context slot" : "variable"}
        </Badge>
        {autoBound.has(target.name) && sources.length === 1 ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Zap className="h-2.5 w-2.5" />
            Chosen for you — this job offers a value named exactly like this
            input. Switch to Agent Default to ignore it on purpose.
          </span>
        ) : null}
      </div>

      {/* THE SHARED ROW, VERBATIM. */}
      <SurfaceVariableBinding
        target={target}
        mapping={mappingForRow(sources)}
        availableSurfaceValues={selectableSurfaceValues}
        disabled={disabled}
        sourceLabels={sourceLabels}
        valueFieldLabel="Offered value"
        onChange={(next) =>
          onChange(
            applyRowMapping({
              map: value,
              targetName: target.name,
              mapping: next,
              offeredByName,
              deliver,
            }),
          )
        }
      />

      {/* P9 — a source that is not guaranteed must declare what happens
                when it is absent. The shared row carries a Required toggle but
                no absence answer (a surface value's absence is the surface's
                problem; an offered value's is the binding's), so source 0 gets
                its control HERE — sources 1..n get the same one in the strip
                below. `skip` is pre-answered on selection; this makes the
                answer visible and changeable instead of merely stored. */}
      {/* P5 / D2 — the chosen value's own example, right under the pick.
                "Looks like", not "Right now": this is a STATIC illustration the
                provision declared, and calling it the current value would be a
                sentence the screen cannot keep. */}
      {sources[0] && isOfferedSource(sources[0])
        ? (() => {
            const example = offeredByName.get(sources[0].target)?.example;
            return example ? (
              <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">
                <span className="text-muted-foreground/60">Looks like: </span>
                <span className="font-mono">{example}</span>
              </p>
            ) : null;
          })()
        : null}

      {sources[0] && isOfferedSource(sources[0]) && sources[0].target !== "" ? (
        <AbsenceControl
          entry={sources[0]}
          offered={offeredByName.get(sources[0].target)}
          disabled={disabled}
          onPatch={(patch) =>
            onChange(patchSourceAt(value, target.name, 0, patch))
          }
        />
      ) : null}

      {awaitingPick ? (
        <p className="flex items-start gap-1.5 px-0.5 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pick which offered value feeds this input, or switch back to the
          holder&apos;s own default.
        </p>
      ) : null}

      {rowProblems.map((problem) => (
        <p
          key={problem}
          className="flex items-start gap-1.5 px-0.5 text-[11.5px] leading-relaxed text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {problem}
        </p>
      ))}

      {unfedRequired ? (
        <p className="flex items-start gap-1.5 px-0.5 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This input is required and nothing feeds it, and the holder has no
          default of its own — pick an offered value, or give the holder a
          default in the builder.
        </p>
      ) : null}

      {/* D18.2 — the extra sources joined into this same input. */}
      <ExtraSources
        targetName={target.name}
        sources={sources}
        offeredByName={offeredByName}
        disabled={disabled}
        onMove={(index, delta) =>
          onChange(moveSource(value, target.name, index, delta))
        }
        onRemove={(index) =>
          onChange(removeSourceAt(value, target.name, index))
        }
        onPatch={(index, patch) =>
          onChange(patchSourceAt(value, target.name, index, patch))
        }
      />

      <AddAnotherSource
        targetName={target.name}
        targetLabel={target.label ?? formatVariableDisplayName(target.name)}
        remaining={remaining}
        hasSources={sources.length > 0}
        disabled={disabled}
        onAdd={(sourceName) => {
          onChange(
            addSource(value, target.name, {
              sourceName,
              offered: offeredByName.get(sourceName),
              deliver,
            }),
          );
        }}
      />
    </div>
  );
}

function hasHolderDefault(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** Sources 1..n — the ones the shared row does not own. */
function ExtraSources({
  targetName,
  sources,
  offeredByName,
  disabled,
  onMove,
  onRemove,
  onPatch,
}: {
  targetName: string;
  sources: readonly ConsumptionEntry[];
  offeredByName: ReadonlyMap<string, OfferedValue>;
  disabled: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onPatch: (index: number, patch: Partial<OfferedSource>) => void;
}) {
  if (sources.length <= 1) return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {sources.length} sources feed this input. They are joined in this order,
        separated by a blank line — the first one is the row above.
      </p>
      {sources.map((entry, index) => {
        // A joined source is any of the three stored kinds — an offered value,
        // a literal, or an answer the person will give. It is named in the
        // reader's words by the ONE describer, so the strip, the rail and the
        // auto-run bar can never call the same entry different things.
        const offered = isOfferedSource(entry)
          ? offeredByName.get(entry.target)
          : undefined;
        const handle = isOfferedSource(entry)
          ? entry.target || "this source"
          : entry.mapType === "direct_value"
            ? "the fixed value"
            : "the question";
        return (
          <div
            key={`${entry.mapType}-${isOfferedSource(entry) ? entry.target : index}-${index}`}
            className="rounded-md border border-border/50 bg-card px-2 py-1.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground">
                {index + 1}.
              </span>
              <span className="min-w-0 text-[12px] leading-snug text-foreground">
                {isOfferedSource(entry)
                  ? entry.target
                    ? formatVariableDisplayName(entry.target)
                    : "nothing chosen"
                  : describeSource(entry)}
              </span>
              {isOfferedSource(entry) ? (
                offered ? (
                  <Badge
                    variant="outline"
                    className="py-0 font-mono text-[9px]"
                  >
                    {offered.kind}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="py-0 text-[9px] text-destructive"
                  >
                    no longer offered
                  </Badge>
                )
              ) : (
                <Badge
                  variant="outline"
                  className="py-0 text-[9px] text-muted-foreground"
                >
                  {entry.mapType === "direct_value"
                    ? "fixed value"
                    : "asked at run time"}
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${handle} earlier in ${targetName}`}
                  onClick={() => onMove(index, -1)}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={disabled || index === sources.length - 1}
                  aria-label={`Move ${handle} later in ${targetName}`}
                  onClick={() => onMove(index, 1)}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  disabled={disabled}
                  aria-label={`Remove ${handle} from ${targetName}`}
                  onClick={() => onRemove(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* P9 — a source that is not guaranteed declares its absence answer.
                Only an OFFERED value can be absent: a literal is always there,
                and an unanswered question is the run form's business. */}
            {isOfferedSource(entry) ? (
              <AbsenceControl
                entry={entry}
                offered={offered}
                disabled={disabled}
                onPatch={(patch) => onPatch(index, patch)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * THE ABSENCE ANSWER (P9). A value the job does not guarantee must say what
 * happens when it is missing, and the server refuses the whole map without it.
 * `skip` is pre-answered the moment the value is chosen — this is where that
 * answer becomes visible and changeable, on source 0 and on every joined source
 * alike, so absence is never a surprise and never an invisible default.
 */
function AbsenceControl({
  entry,
  offered,
  disabled,
  onPatch,
}: {
  entry: OfferedSource;
  offered: OfferedValue | undefined;
  disabled: boolean;
  onPatch: (patch: Partial<OfferedSource>) => void;
}) {
  if (!offered || offered.guaranteed) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 px-0.5 text-[11.5px] text-muted-foreground">
      <span>
        {formatVariableDisplayName(entry.target)} is not always there. If
        absent:
      </span>
      <Select
        value={entry.when_absent ?? "skip"}
        disabled={disabled}
        onValueChange={(v) =>
          onPatch({ when_absent: v as OfferedSource["when_absent"] })
        }
      >
        <SelectTrigger
          className="h-7 w-[150px] text-[11.5px]"
          aria-label={`When ${entry.target} is absent`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="skip">Skip it</SelectItem>
          <SelectItem value="use_default">Use a default</SelectItem>
          <SelectItem value="fail">Fail the run</SelectItem>
        </SelectContent>
      </Select>
      {entry.when_absent === "use_default" ? (
        <ProTextarea
          wrapperClassName="h-8 min-w-0 flex-1"
          value={typeof entry.default === "string" ? entry.default : ""}
          disabled={disabled}
          onChange={(e) => onPatch({ default: e.target.value })}
          placeholder="Default value"
          className="h-8 min-h-8 flex-1 resize-none py-1 text-[12px]"
          style={{ fontSize: "14px" }}
        />
      ) : null}
    </div>
  );
}

function AddAnotherSource({
  targetName,
  targetLabel,
  remaining,
  hasSources,
  disabled,
  onAdd,
}: {
  targetName: string;
  targetLabel: string;
  remaining: readonly OfferedValue[];
  hasSources: boolean;
  disabled: boolean;
  onAdd: (sourceName: string) => void;
}) {
  if (!hasSources) return null;
  if (remaining.length === 0) {
    return (
      <p className="px-0.5 text-[10.5px] text-muted-foreground/70">
        Every offered value is already mapped somewhere.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      <Plus className="h-3 w-3 text-muted-foreground" />
      <Select value="" disabled={disabled} onValueChange={(v) => v && onAdd(v)}>
        <SelectTrigger
          className="h-7 w-[280px] text-[11.5px]"
          aria-label={`Add another value to ${targetName}`}
        >
          <SelectValue
            placeholder={`Also feed ${targetLabel} another value…`}
          />
        </SelectTrigger>
        <SelectContent>
          {remaining.map((v) => (
            <SelectItem key={v.name} value={v.name}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {formatVariableDisplayName(v.name)}
                </span>
                {!v.guaranteed ? (
                  <span className="text-[10px] text-muted-foreground">
                    · sometimes
                  </span>
                ) : null}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10.5px] text-muted-foreground">
        joined after the value above, with a blank line between them
      </span>
    </div>
  );
}

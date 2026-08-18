"use client";

/**
 * The knobs.
 *
 * Everything the algorithm does is editable here, live, against the candidate
 * currently loaded — so a change to a weight is visible in the price before you
 * let go of the field. That immediacy is the whole point: the model is meant to
 * be argued with, not admired.
 *
 * Nothing in this panel is special-cased per config. It renders whatever the
 * config declares, which means a new term or gate becomes tunable the moment it
 * is added, with no UI work.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

import type { BucketKey, GateAction, LinkValuationConfig } from "../types";

interface Props {
  config: LinkValuationConfig;
  onChange: (next: LinkValuationConfig) => void;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
  width = "w-20",
}: {
  label?: string;
  value: number;
  step?: number;
  onChange: (next: number) => void;
  width?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      {label ? (
        <span className="text-[11px] text-muted-foreground">{label}</span>
      ) : null}
      <Input
        type="number"
        step={step ?? 0.1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-7 ${width} text-xs tabular-nums`}
      />
    </span>
  );
}

export function TuningPanel({ config, onChange }: Props) {
  const patchTerm = (
    key: string,
    patch: Partial<LinkValuationConfig["terms"][number]>,
  ) => {
    onChange({
      ...config,
      terms: config.terms.map((term) =>
        term.key === key ? { ...term, ...patch } : term,
      ),
    });
  };

  const patchBucket = (
    key: BucketKey,
    patch: Partial<LinkValuationConfig["buckets"][number]>,
  ) => {
    onChange({
      ...config,
      buckets: config.buckets.map((bucket) =>
        bucket.key === key ? { ...bucket, ...patch } : bucket,
      ),
    });
  };

  const patchGroupMember = (
    groupKey: string,
    signalKey: string,
    weight: number,
  ) => {
    onChange({
      ...config,
      groups: config.groups.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              members: group.members.map((member) =>
                member.signalKey === signalKey ? { ...member, weight } : member,
              ),
            }
          : group,
      ),
    });
  };

  const patchMoney = (patch: Partial<LinkValuationConfig["money"]>) => {
    onChange({ ...config, money: { ...config.money, ...patch } });
  };

  const patchGate = (
    key: string,
    patch: Partial<LinkValuationConfig["gates"][number]>,
  ) => {
    onChange({
      ...config,
      gates: config.gates.map((gate) =>
        gate.key === key ? { ...gate, ...patch } : gate,
      ),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Bucket weights"
        hint="How much of the total score each half of the model carries. These should be deliberate — they decide whether this is an authority tool or a relevance tool."
      >
        <div className="flex flex-col divide-y divide-border">
          {config.buckets.map((bucket) => (
            <div
              key={bucket.key}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="flex items-center gap-2">
                <Switch
                  checked={bucket.enabled}
                  onCheckedChange={(checked) =>
                    patchBucket(bucket.key, { enabled: checked })
                  }
                />
                <span className="text-xs text-foreground">{bucket.label}</span>
              </span>
              <span className="flex items-center gap-2">
                <Select
                  value={bucket.divisorMode}
                  onValueChange={(next) =>
                    patchBucket(bucket.key, {
                      divisorMode: next as "fixed" | "meanOfPresent",
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-40 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meanOfPresent" className="text-xs">
                      Average what arrived
                    </SelectItem>
                    <SelectItem value="fixed" className="text-xs">
                      Fixed divisor
                    </SelectItem>
                  </SelectContent>
                </Select>
                {bucket.divisorMode === "fixed" ? (
                  <NumberField
                    label="÷"
                    value={bucket.divisor}
                    onChange={(next) =>
                      patchBucket(bucket.key, { divisor: next })
                    }
                  />
                ) : null}
                <NumberField
                  label="×"
                  value={bucket.weight}
                  step={0.05}
                  onChange={(next) => patchBucket(bucket.key, { weight: next })}
                />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Term weights"
        hint="Each scored input's pull. Switch a term off to see what it was actually contributing."
      >
        <div className="flex flex-col divide-y divide-border">
          {config.terms.map((term) => (
            <div
              key={term.key}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Switch
                  checked={term.enabled}
                  onCheckedChange={(checked) =>
                    patchTerm(term.key, { enabled: checked })
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-foreground">
                    {term.label}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    {term.bucket} ·{" "}
                    {term.mode === "average" ? "averaged" : "added"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Select
                  value={term.mode}
                  onValueChange={(next) =>
                    patchTerm(term.key, {
                      mode: next as "average" | "additive",
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-24 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="average" className="text-xs">
                      Average
                    </SelectItem>
                    <SelectItem value="additive" className="text-xs">
                      Add
                    </SelectItem>
                  </SelectContent>
                </Select>
                <NumberField
                  value={term.weight}
                  onChange={(next) => patchTerm(term.key, { weight: next })}
                />
              </span>
            </div>
          ))}
        </div>
      </Section>

      {config.groups.length > 0 ? (
        <Section
          title="Composite membership"
          hint="Which sources answer each question, and how much each is trusted relative to the others. Weights are renormalised over whichever sources actually arrive."
        >
          <div className="flex flex-col gap-3">
            {config.groups.map((group) => (
              <div key={group.key}>
                <p className="text-xs font-medium text-foreground">
                  {group.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {group.description}
                </p>
                <div className="mt-1 flex flex-col divide-y divide-border">
                  {group.members.map((member) => (
                    <div
                      key={member.signalKey}
                      className="flex items-center justify-between gap-2 py-1"
                    >
                      <span className="truncate text-[11px] text-muted-foreground">
                        {config.signals.find(
                          (signal) => signal.key === member.signalKey,
                        )?.label ?? member.signalKey}
                      </span>
                      <NumberField
                        value={member.weight}
                        onChange={(next) =>
                          patchGroupMember(group.key, member.signalKey, next)
                        }
                        width="w-16"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Value curve"
        hint="Score to dollars. These points ARE the pricing policy — the original sheet's 136-row table is nine points here, interpolated. Edit, add, or remove any of them."
      >
        <div className="flex flex-col gap-1.5">
          {config.money.curve.map((point, index) => (
            <div
              key={`${point.at}-${index}`}
              className="flex items-center gap-2"
            >
              <NumberField
                label="score"
                value={point.at}
                step={1}
                onChange={(next) =>
                  patchMoney({
                    curve: config.money.curve.map((entry, position) =>
                      position === index ? { ...entry, at: next } : entry,
                    ),
                  })
                }
              />
              <NumberField
                label="pays"
                value={point.value}
                step={1}
                onChange={(next) =>
                  patchMoney({
                    curve: config.money.curve.map((entry, position) =>
                      position === index ? { ...entry, value: next } : entry,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Remove curve point at score ${point.at}`}
                onClick={() =>
                  patchMoney({
                    curve: config.money.curve.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-1 h-7 w-fit text-xs"
            onClick={() =>
              patchMoney({
                curve: [...config.money.curve, { at: 0, value: 0 }],
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add point
          </Button>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <Label
              htmlFor="lv-round"
              className="text-[11px] text-muted-foreground"
            >
              Round the score to a whole number before pricing (the spreadsheet
              did)
            </Label>
            <Switch
              id="lv-round"
              checked={config.money.roundScoreTo !== null}
              onCheckedChange={(checked) =>
                patchMoney({ roundScoreTo: checked ? 0 : null })
              }
            />
          </div>
        </div>
      </Section>

      <Section
        title="Role payouts"
        hint="What each role may authorise, as a share of the maximum value. Steps down as scores rise so margin holds on expensive links."
      >
        <div className="flex flex-col gap-2">
          {config.money.roles.map((role) => (
            <div key={role.key}>
              <p className="text-xs font-medium text-foreground">
                {role.label}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {role.bands.map((band, index) => (
                  <span
                    key={`${role.key}-${band.from}`}
                    className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1"
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {band.from}–{band.to > 999 ? "∞" : band.to}
                    </span>
                    <NumberField
                      value={band.multiplier}
                      step={0.05}
                      width="w-16"
                      onChange={(next) =>
                        patchMoney({
                          roles: config.money.roles.map((entry) =>
                            entry.key === role.key
                              ? {
                                  ...entry,
                                  bands: entry.bands.map((item, position) =>
                                    position === index
                                      ? { ...item, multiplier: next }
                                      : item,
                                  ),
                                }
                              : entry,
                          ),
                        })
                      }
                    />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {config.gates.length > 0 ? (
        <Section
          title="Hard gates"
          hint="The reject rules. The source spreadsheet promised these in its summary and never implemented one — a domain could only be penalised, never refused."
        >
          <div className="flex flex-col divide-y divide-border">
            {config.gates.map((gate) => (
              <div
                key={gate.key}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Switch
                    checked={gate.enabled}
                    onCheckedChange={(checked) =>
                      patchGate(gate.key, { enabled: checked })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-foreground">
                      {gate.label}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {gate.signalKey} {gate.op} {String(gate.value)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {typeof gate.value === "number" ? (
                    <NumberField
                      value={gate.value}
                      step={1}
                      onChange={(next) => patchGate(gate.key, { value: next })}
                    />
                  ) : null}
                  <Select
                    value={gate.action}
                    onValueChange={(next) =>
                      patchGate(gate.key, { action: next as GateAction })
                    }
                  >
                    <SelectTrigger className="h-7 w-28 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reject" className="text-xs">
                        Reject
                      </SelectItem>
                      <SelectItem value="zero_value" className="text-xs">
                        Zero value
                      </SelectItem>
                      <SelectItem value="flag" className="text-xs">
                        Flag only
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

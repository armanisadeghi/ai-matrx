"use client";

// The knobs half of Limits & Knobs — every operational ceiling, backstop,
// cadence and default the platform runs on, editable in place.
//
// Two things this surface exists to make visible, both required by
// common-docs/policies/limits-are-knobs-agents-set-them.md:
//
//   * WHY a number is what it is. Every knob carries the `basis` the agent
//     chose it on. A limit whose reasoning is invisible gets "fixed" by the
//     next person who finds it inconvenient.
//   * WHEN it must be revisited. A knob still carrying its provisional
//     agent-set value past its review date is a defect, so it is rendered as
//     one rather than living in a doc nobody re-reads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { fetchKnobOverrideCounts } from "@/lib/scoped-config/service";
import { toast } from "@/lib/toast";
import { fetchFeatureKnobs, setFeatureKnob } from "../service";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";
import type { FeatureKnob } from "../types";

function knobId(knob: FeatureKnob): string {
  return `${knob.feature}.${knob.key}`;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function isOverdue(knob: FeatureKnob): boolean {
  if (knob.set_by !== "agent" || !knob.review_due) return false;
  return new Date(knob.review_due) < new Date();
}

function rangeHint(knob: FeatureKnob): string | null {
  if (knob.allowed_values?.length) return knob.allowed_values.join(" · ");
  const { min_value: min, max_value: max } = knob;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min} – ${max}`;
  return min !== null ? `min ${min}` : `max ${max}`;
}

export function FeatureKnobsPanel() {
  const [knobs, setKnobs] = useState<FeatureKnob[]>([]);
  const [overrideCounts, setOverrideCounts] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, counts] = await Promise.all([
        fetchFeatureKnobs(),
        fetchKnobOverrideCounts(),
      ]);
      setKnobs(rows);
      setOverrideCounts(
        Object.fromEntries(
          counts.map((c) => [`${c.feature}.${c.key}`, c.total_count]),
        ),
      );
      setDrafts(
        Object.fromEntries(rows.map((k) => [knobId(k), displayValue(k.value)])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Opt in to the platform client-directive channel: when an `instant` key
  // changes anywhere — another tab, another admin, the server — re-read, so
  // this table never shows a value the database no longer holds.
  useEffect(
    () => registerDirectiveHandler("settings_changed", () => void load()),
    [load],
  );

  const byFeature = useMemo(() => {
    const groups = new Map<string, FeatureKnob[]>();
    for (const knob of knobs) {
      const list = groups.get(knob.feature) ?? [];
      list.push(knob);
      groups.set(knob.feature, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [knobs]);

  const overdueCount = useMemo(() => knobs.filter(isOverdue).length, [knobs]);

  const save = useCallback(
    async (knob: FeatureKnob, reset: boolean) => {
      const id = knobId(knob);
      setSaving(id);
      try {
        let next: unknown = null;
        if (!reset) {
          const raw = (drafts[id] ?? "").trim();
          if (knob.value_type === "number" || knob.value_type === "integer") {
            const parsed = Number(raw);
            if (raw === "" || Number.isNaN(parsed)) {
              toast.error(`${knob.label} needs a number`);
              return;
            }
            next = parsed;
          } else if (knob.value_type === "boolean") {
            next = raw === "true";
          } else {
            next = raw;
          }
        }
        const result = await setFeatureKnob(knob.feature, knob.key, next);
        if (!result.ok) {
          toast.error(result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`);
          return;
        }
        toast.success(
          reset ? `${knob.label} reset to its default` : `${knob.label} saved`,
        );
        await load();
      } catch (err) {
        // The DB validates range, type and enum membership, so its message is
        // the useful one — never swallow it behind "something went wrong".
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(null);
      }
    },
    [drafts, load],
  );

  if (loading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">Loading knobs…</p>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Every limit on this platform is a row, not code.</p>
        <p className="mt-1 text-muted-foreground">
          Change a value here and it takes effect within a minute, everywhere, with
          no deploy. Values marked <em>agent-set</em> are provisional starting
          numbers chosen under blind approval — each one names the basis it was
          chosen on and the date it should be reviewed against real usage.
        </p>
        {overdueCount > 0 && (
          <p className="mt-2 flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            {overdueCount} knob{overdueCount === 1 ? " is" : "s are"} past the
            review date and still carrying an agent-set value.
          </p>
        )}
      </div>

      {byFeature.map(([feature, rows]) => (
        <section key={feature} className="space-y-3">
          <h3 className="font-mono text-sm font-semibold text-foreground">
            {feature}
          </h3>
          <div className="divide-y divide-border rounded-lg border border-border">
            {rows.map((knob) => {
              const id = knobId(knob);
              const hint = rangeHint(knob);
              const dirty = (drafts[id] ?? "") !== displayValue(knob.value);
              const modified =
                displayValue(knob.value) !== displayValue(knob.default_value);
              return (
                <div key={id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{knob.label}</span>
                      <code className="text-xs text-muted-foreground">{knob.key}</code>
                      {knob.set_by === "agent" ? (
                        <Badge variant="outline" className="text-xs">agent-set</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">reviewed</Badge>
                      )}
                      {isOverdue(knob) && (
                        <Badge variant="destructive" className="text-xs">
                          review overdue
                        </Badge>
                      )}
                      {knob.overridable_by.length === 0 ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-xs"
                          title="No organization or user may override this value."
                        >
                          <Lock className="h-3 w-3" />
                          platform-locked
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          title={`Overridable by: ${knob.overridable_by.join(", ")}${
                            knob.override_direction !== "any"
                              ? ` (${knob.override_direction.replace("_", " ")})`
                              : ""
                          }`}
                        >
                          {knob.overridable_by.includes("user")
                            ? "org + user"
                            : "org"}
                          {knob.override_direction !== "any"
                            ? ` · ${knob.override_direction.replace("_", " ")}`
                            : ""}
                        </Badge>
                      )}
                      {(overrideCounts[id] ?? 0) > 0 && (
                        <Badge variant="default" className="text-xs tabular-nums">
                          {overrideCounts[id]} override
                          {overrideCounts[id] === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {knob.description}
                    </p>
                    {knob.basis && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Why this number: </span>
                        {knob.basis}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Default {displayValue(knob.default_value)}
                      {knob.unit ? ` ${knob.unit}` : ""}
                      {hint ? ` · allowed ${hint}` : ""}
                      {knob.review_due ? ` · review due ${knob.review_due}` : ""}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex items-center gap-1">
                      {knob.unit === "usd" && (
                        <span className="text-sm text-muted-foreground">$</span>
                      )}
                      {/* 🚨 A CLOSED SET IS A CHOICE, NOT A TYPING TEST. This
                          was an <Input> with a <datalist>, i.e. free text over
                          64 enum knobs platform-wide: an admin could type a
                          word `platform.feature_knob_set` then refuses, and
                          only learn it on save. A knob is a decision an
                          organization makes — the values it may hold are the
                          register's, so they are OFFERED. Boolean knobs get the
                          same treatment for the same reason ("True" is not
                          `true`, and the old field parsed anything-but-"true"
                          as false, silently). */}
                      {knob.allowed_values?.length ? (
                        <select
                          className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
                          aria-label={knob.label}
                          value={drafts[id] ?? ""}
                          onChange={(event) =>
                            setDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                          }
                        >
                          {/* The value the row currently holds, even if the
                              register no longer allows it. Dropping it would
                              show a DIFFERENT value than the one in force. */}
                          {knob.allowed_values.includes(drafts[id] ?? "") ? null : (
                            <option value={drafts[id] ?? ""}>
                              {(drafts[id] ?? "") === ""
                                ? "(no value)"
                                : `${drafts[id]} (not in the allowed set)`}
                            </option>
                          )}
                          {knob.allowed_values.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : knob.value_type === "boolean" ? (
                        <select
                          className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
                          aria-label={knob.label}
                          value={(drafts[id] ?? "") === "true" ? "true" : "false"}
                          onChange={(event) =>
                            setDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                          }
                        >
                          <option value="true">on</option>
                          <option value="false">off</option>
                        </select>
                      ) : (
                        <Input
                          className="w-40"
                          value={drafts[id] ?? ""}
                          onChange={(event) =>
                            setDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                          }
                        />
                      )}
                      {knob.unit && knob.unit !== "usd" && (
                        <span className="text-xs text-muted-foreground">
                          {knob.unit}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={!dirty || saving === id}
                      onClick={() => void save(knob, false)}
                    >
                      <Save className="mr-1 h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Reset to the agent-set default"
                      disabled={!modified || saving === id}
                      onClick={() => void save(knob, true)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

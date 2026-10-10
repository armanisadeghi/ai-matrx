"use client";

/**
 * The Limits section — THE editor for an automation's guardrails (max turns, cost per run,
 * time per run, daily / weekly / monthly spend caps, max failure %). Every automation seat
 * renders this one component: the schedule editor, the workflow trigger card and the admin /
 * org-admin automation pages, for the system and for users alike.
 *
 * Each limit is a design-system Field: the default is the placeholder, the measured basis is the
 * tooltip. A missing required limit (max turns, max cost per run) is red. Saving writes the
 * guardrails jsonb; the database refuses enabling AI without the required limits and its refusal
 * is shown here, in red, as it came back.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, OctagonAlert, OctagonPause, Save } from "lucide-react";
import { Field } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/official/InfoHint";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCostDisplay, useSeesDollars } from "@/components/cost/useCostDisplay";
import { toast } from "@/lib/toast";
import {
  COST_LIMIT_KEYS,
  LIMIT_KEYS,
  REQUIRED_LIMIT_KEYS,
  fetchGuardrailStatus,
  guardrailBreachLabel,
  resumeAutomation,
  saveGuardrails,
  type GuardrailKind,
  type GuardrailStatus,
  type LimitKey,
} from "@/features/scheduling/service/automationGuardrails";

const LABEL: Record<LimitKey, string> = {
  max_turns: "Max turns",
  max_cost_usd_per_run: "Max cost/run",
  max_runtime_seconds: "Max time/run",
  max_cost_usd_daily: "Daily cap",
  max_cost_usd_weekly: "Weekly cap",
  max_cost_usd_monthly: "Monthly cap",
  max_failure_pct: "Max failures",
};

const UNIT: Partial<Record<LimitKey, string>> = {
  max_turns: "turns",
  max_runtime_seconds: "sec",
  max_failure_pct: "%",
};

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function AutomationLimitsSection({
  kind,
  id,
  usesAi = false,
  readOnly = false,
  onChanged,
}: {
  kind: GuardrailKind;
  id: string;
  /** Whether this automation runs AI (the caller knows its kind); triggers and agent schedules always do. */
  usesAi?: boolean;
  readOnly?: boolean;
  /** Called after a save or resume so a surrounding table can reload. */
  onChanged?: () => void;
}) {
  const sees = useSeesDollars();
  const { rate } = useCostDisplay();
  const [status, setStatus] = useState<GuardrailStatus | null>(null);
  const [draft, setDraft] = useState<Partial<Record<LimitKey, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Cost limits are stored in dollars; people who do not see dollars edit points.
  const factor = sees ? 1 : rate;
  const costOk = factor != null;
  const toDisplay = useCallback(
    (k: LimitKey, v: number | null | undefined): string => {
      if (v == null) return "";
      if (COST_LIMIT_KEYS.includes(k)) return costOk ? String(Number((v * (factor as number)).toPrecision(6))) : "";
      return String(v);
    },
    [costOk, factor],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchGuardrailStatus(kind, id);
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind, id]);
  useEffect(() => {
    void load();
  }, [load]);

  // Reset the draft from the stored values whenever they (or the display unit) change.
  useEffect(() => {
    if (!status) return;
    setDraft(Object.fromEntries(LIMIT_KEYS.map((k) => [k, toDisplay(k, status.guardrails[k])])));
  }, [status, toDisplay]);

  const parsed = useMemo(() => {
    const out: Partial<Record<LimitKey, number | null>> = {};
    for (const k of LIMIT_KEYS) {
      const raw = (draft[k] ?? "").trim();
      if (raw === "") {
        out[k] = null;
        continue;
      }
      const n = Number(raw);
      out[k] = Number.isFinite(n) && n >= 0 ? (COST_LIMIT_KEYS.includes(k) ? n / ((factor as number) || 1) : n) : null;
    }
    return out;
  }, [draft, factor]);

  const missing = REQUIRED_LIMIT_KEYS.filter((k) => !((parsed[k] ?? 0) > 0));
  const aiRequired = kind !== "sch_task" || usesAi || status?.guardrails.uses_ai === true;
  const showMissing = status != null && aiRequired;
  const dirty = status != null && LIMIT_KEYS.some((k) => (parsed[k] ?? null) !== (status.guardrails[k] ?? null));

  const save = async () => {
    if (!status) return;
    setBusy(true);
    setRefusal(null);
    try {
      await saveGuardrails(kind, id, { ...status.guardrails, ...parsed });
      toast.success("Limits saved");
      await load();
      onChanged?.();
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      await resumeAutomation(kind, id);
      toast.success("Resumed");
      await load();
      onChanged?.();
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const unitFor = (k: LimitKey) => (COST_LIMIT_KEYS.includes(k) ? (sees ? "$" : "points") : UNIT[k]);

  return (
    <section aria-label="Limits" className="flex flex-col gap-2" data-testid="automation-limits">
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="text-sm font-semibold">Limits</h3>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading limits" />}
        {status && showMissing && missing.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" role="alert">
            <OctagonAlert className="h-3.5 w-3.5" aria-hidden />
            {`Required: ${missing.map((k) => LABEL[k]).join(", ")}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {status?.paused && !readOnly && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void resume()}>
              Resume
            </Button>
          )}
          {!readOnly && (
            <Button type="button" disabled={busy || !dirty || !status} onClick={() => void save()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save limits
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-7 flex-col gap-1">
      {status?.paused && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive-ink" role="status">
          <OctagonPause className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {`Paused: ${status.paused.reason ?? guardrailBreachLabel(status.paused.breach)}`}
          </span>
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      )}
      {refusal && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive-ink" role="alert">
          {refusal}
          <ErrorAlchemyMenu error={refusal} />
        </div>
      )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {LIMIT_KEYS.map((k) => {
          const required = REQUIRED_LIMIT_KEYS.includes(k);
          const red = required && showMissing && !((parsed[k] ?? 0) > 0);
          const def = status?.defaults[k];
          const basis = status?.guardrails.basis?.[k];
          const defText = def != null ? `Default ${toDisplay(k, def)}${unitFor(k) ? ` ${unitFor(k)}` : ""}` : "No default";
          const hint = clip(basis ? `${basis}` : defText);
          const inputId = `limit-${kind}-${id}-${k}`;
          return (
            <div key={k} className="min-w-0">
              <div className="flex h-5 items-center gap-1">
                <Label htmlFor={inputId} className={`text-xs ${red ? "font-semibold text-destructive" : ""}`}>
                  {LABEL[k]}
                  {required && <span aria-hidden className="ml-0.5 text-destructive">*</span>}
                </Label>
                <InfoHint text={hint} label={`About ${LABEL[k]}`} />
              </div>
              <Field
                id={inputId}
                inputMode="decimal"
                value={draft[k] ?? ""}
                placeholder={def != null ? toDisplay(k, def) : ""}
                disabled={readOnly || busy || !status || (COST_LIMIT_KEYS.includes(k) && !costOk)}
                aria-invalid={red || undefined}
                aria-required={required || undefined}
                end={unitFor(k) ? <span className="text-xs text-muted-foreground">{unitFor(k)}</span> : undefined}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                className={red ? "ring-1 ring-destructive [&_*]:text-destructive" : undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

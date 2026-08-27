// features/hr/settings/components/KnobPanel.tsx
//
// 🚨 THE UNIFORM D13 PANEL SHAPE. THERE IS EXACTLY ONE OF THESE.
//
// Per key, every settings panel in `/hr/settings/*` shows FOUR things and never
// fewer (SPEC-EMPLOYEES §2.4, SPEC-UI-IA §3.11):
//
//   1. THE PLATFORM DEFAULT — what this key is when nobody has touched it.
//   2. WHETHER THIS ORG OVERRIDES IT — the origin, named, never inferred from a
//      value that happens to differ.
//   3. THE OVERRIDE CONTROL — and "clear an override" REMOVES THE KEY. It never
//      writes a null, because a null override is a value, and a value is not the
//      same fact as "this org has no opinion".
//   4. THE SCOPE SELECTOR, where the key has a scope rung below the org.
//
// And one rule that outranks all four:
//
//   🚨 A CONTROL FIXED BY A STATUTORY FLOOR RENDERS LOCKED WITH ITS CITATION
//      VISIBLE. Never hidden, never quietly absent, never a save-time rejection.
//      An admin who cannot see why a control will not move will file a bug against
//      the product instead of reading the law, every time.
//
// A per-panel reimplementation of any of this is a review failure. If a panel needs
// something this component cannot express, the fix is here, once.
//
// 🚨 `origin: 'missing'` IS A HARD ERROR NAMING THE KEY. `hr_knob_index` emits it
// when `platform.feature_knob` carries neither a value nor a default, and §10 says a
// missing knob RAISES rather than defaulting. A silent fallback is precisely how a
// knob becomes a constant, so the row screams instead of rendering a control.

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Gavel, RotateCcw, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { clearHrKnob, setHrKnob } from "../../service";
import { isHrDenied } from "../../types";
import type { HrPresentedKnob } from "../types";

// ── Value rendering ─────────────────────────────────────────────────────────

/** A configuration value as one readable line. Never `[object Object]`. */
export function knobValueText(value: unknown, unit?: string | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return unit ? `${value} ${unit}` : String(value);
  if (typeof value === "string") return unit ? `${value} ${unit}` : value;
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "(none)";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** The editor's text form of a value, per `value_type`. */
function toEditable(value: unknown, valueType: string): string {
  if (value === null || value === undefined) return "";
  if (valueType === "string" || valueType === "enum") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (valueType === "integer" || valueType === "number") return String(value);
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** Parse the editor's text back into the JSON the RPC will store. */
function fromEditable(
  text: string,
  valueType: string,
): { ok: true; value: unknown } | { ok: false; why: string } {
  const trimmed = text.trim();

  if (valueType === "integer") {
    if (!/^-?\d+$/.test(trimmed)) {
      return { ok: false, why: "This key holds a whole number." };
    }
    return { ok: true, value: Number.parseInt(trimmed, 10) };
  }
  if (valueType === "number") {
    const parsed = Number(trimmed);
    if (trimmed === "" || Number.isNaN(parsed)) {
      return { ok: false, why: "This key holds a number." };
    }
    return { ok: true, value: parsed };
  }
  if (valueType === "string" || valueType === "enum") {
    if (trimmed === "") return { ok: false, why: "This key cannot be empty." };
    return { ok: true, value: trimmed };
  }
  // Anything else is stored as JSON, and a malformed override is refused HERE
  // rather than sent for the database to reject with a Postgres code.
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, why: "This key holds structured data and this is not valid JSON." };
  }
}

/** `allowed_values` from `platform.feature_knob`, when it carries a list. */
function allowedOptions(
  knob: HrPresentedKnob,
): Array<{ value: string; label: string }> | null {
  if (knob.presentation.options?.length) return knob.presentation.options;
  return null;
}

// ── One key ─────────────────────────────────────────────────────────────────

export function KnobRow({
  knob,
  organizationId,
  onChanged,
  className,
}: {
  knob: HrPresentedKnob;
  organizationId: string;
  /** Re-read the index after a write. The row never mutates its own copy. */
  onChanged: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string>(() =>
    toEditable(knob.effective_value, knob.value_type),
  );
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const { presentation } = knob;
  const floor = presentation.floor ?? null;
  const options = allowedOptions(knob);
  const label = presentation.explain ? knob.key : knob.key;
  const humanKey = label.replace(/_/g, " ");

  // ── 🚨 origin: 'missing' — the hard error, naming the key ─────────────────
  if (knob.origin === "missing") {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3",
          className,
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            <span className="font-mono">{knob.full_key}</span> has no platform default
          </p>
          <p className="text-sm text-muted-foreground">
            This key is read by HR but nothing in the platform registry defines it, so
            there is no value to show and nothing safe to write. It is a configuration
            defect, not a setting you can fill in — a silent fallback here is how a knob
            becomes a constant. Send this key name to whoever runs the platform.
          </p>
        </div>
      </div>
    );
  }

  const save = async () => {
    const parsed = fromEditable(draft, knob.value_type);
    if (!parsed.ok) {
      setWhy(parsed.why);
      return;
    }
    setWhy(null);
    setBusy(true);
    const result = await setHrKnob({
      organizationId,
      feature: knob.feature,
      key: knob.key,
      value: parsed.value,
    });
    setBusy(false);

    if (!result.ok) {
      // A refusal is DATA. It renders at the control it was refused at, with the
      // sentence the server wrote — never a generic failure toast.
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this override (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${humanKey} is now set for this employer.`);
    onChanged();
  };

  const clear = async () => {
    const confirmed = await confirm({
      title: `Clear this employer's override?`,
      description:
        `${knob.full_key} goes back to the platform default, ` +
        `${knobValueText(knob.platform_default)}. Clearing REMOVES the key from this ` +
        "employer's settings — it does not store an empty value, so a later change to " +
        "the platform default will reach this employer again.",
      confirmLabel: "Clear the override",
    });
    if (!confirmed) return;

    setBusy(true);
    const result = await clearHrKnob({
      organizationId,
      feature: knob.feature,
      key: knob.key,
    });
    setBusy(false);

    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this (${result.reason}).`
          : result.message,
      );
      return;
    }
    setDraft(toEditable(knob.platform_default, knob.value_type));
    toast.success(`${humanKey} follows the platform default again.`);
    onChanged();
  };

  const controlId = `knob-${knob.full_key.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const locked = Boolean(floor?.lockedValue !== undefined);

  return (
    <div className={cn("space-y-3 border-b border-border py-4 last:border-b-0", className)}>
      {/* identity + origin */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={controlId} className="block text-sm font-medium capitalize">
            {humanKey}
          </Label>
          {presentation.explain ? (
            <p className="text-sm text-muted-foreground">{presentation.explain}</p>
          ) : null}
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            {knob.full_key}
          </p>
        </div>
        <Badge variant={knob.is_overridden ? "default" : "secondary"} className="shrink-0">
          {knob.is_overridden ? "This employer overrides it" : "Platform default"}
        </Badge>
      </div>

      {/* 1. the platform default, always visible — even when overridden */}
      <p className="text-sm text-muted-foreground">
        Platform default:{" "}
        <span className="font-medium text-foreground">
          {knobValueText(knob.platform_default)}
        </span>
        {knob.basis ? <span className="block text-xs">Because: {knob.basis}</span> : null}
      </p>

      {/* 🚨 the statutory floor, LOCKED AND CITED — never hidden */}
      {floor ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
          <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {locked ? "Fixed by law" : "Bounded by law"} — {floor.citation}
            </p>
            <p className="text-muted-foreground">{floor.requirement}</p>
            {floor.href ? (
              <Link
                href={floor.href}
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
              >
                Open the rule
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 3. the override control */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          {locked ? (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">
              {knobValueText(floor?.lockedValue)}
            </p>
          ) : knob.value_type === "boolean" ? (
            <div className="flex items-center gap-2">
              <Switch
                id={controlId}
                checked={draft === "true"}
                disabled={busy}
                onCheckedChange={(next) => setDraft(next ? "true" : "false")}
              />
              <span className="text-sm text-foreground">
                {draft === "true" ? "On" : "Off"}
              </span>
            </div>
          ) : options ? (
            <Select value={draft} onValueChange={setDraft} disabled={busy}>
              <SelectTrigger id={controlId} className="w-full sm:max-w-xs">
                <SelectValue placeholder="Choose a value" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : knob.value_type === "integer" || knob.value_type === "number" ? (
            <Input
              id={controlId}
              inputMode="decimal"
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              className="w-full sm:max-w-xs"
            />
          ) : knob.value_type === "string" || knob.value_type === "enum" ? (
            <Input
              id={controlId}
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              className="w-full sm:max-w-md"
            />
          ) : (
            <Textarea
              id={controlId}
              value={draft}
              disabled={busy}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              className="w-full font-mono text-xs"
            />
          )}
        </div>

        {locked ? null : (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={busy}
              className="min-h-11 sm:min-h-9"
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            {/* 🚨 CLEAR REMOVES THE KEY. It never writes a null. */}
            {knob.is_overridden ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clear}
                disabled={busy}
                className="min-h-11 sm:min-h-9"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. the scope rung, where the key has one */}
      {presentation.scopes?.length ? (
        <div className="space-y-1 rounded-md border border-dashed border-border p-3">
          <p className="text-xs font-medium text-foreground">
            This key can also be set per{" "}
            {presentation.scopes[0].kind === "pay_group"
              ? "pay group"
              : presentation.scopes[0].kind === "location"
                ? "location"
                : "employer profile"}
            , and the nearest rung wins.
          </p>
          <p className="text-xs text-muted-foreground">
            A scope override is stored on the scope row itself, so it is set where that
            row is edited. `hr_knob_set` takes an organization and no scope, so this
            panel cannot write one.
          </p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {presentation.scopes.map((scope) => (
              <li key={`${scope.kind}:${scope.id}`}>
                <Link
                  href={scope.href}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
                >
                  {scope.label}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}
    </div>
  );
}

// ── A group of keys ─────────────────────────────────────────────────────────

export function KnobPanel({
  title,
  description,
  knobs,
  organizationId,
  onChanged,
  emptyLabel,
  className,
}: {
  title: string;
  description?: string;
  knobs: HrPresentedKnob[];
  organizationId: string;
  onChanged: () => void;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <header className="space-y-1 border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="px-4">
        {knobs.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {emptyLabel ??
              "No configuration keys are registered for this panel yet. When the owning lane registers them they appear here automatically — this panel reads the registry, it does not hard-code a list."}
          </p>
        ) : (
          knobs.map((knob) => (
            <KnobRow
              key={knob.full_key}
              knob={knob}
              organizationId={organizationId}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </section>
  );
}

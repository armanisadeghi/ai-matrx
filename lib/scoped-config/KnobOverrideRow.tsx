"use client";

// lib/scoped-config/KnobOverrideRow.tsx
//
// THE ONE editor row for a scoped-configuration key, mounted at every rung
// with only the scope changing (settings-ladder rule 2). Generalizes the HR
// KnobRow (features/hr/settings/components/KnobPanel.tsx) contract:
//   * the platform default is always visible, with its basis;
//   * origin is stated from the resolver's own answer, never inferred
//     ("Set here" vs "Inherited from platform");
//   * "use the platform's value" CLEARS the row — never writes a copy, never
//     writes null — behind a confirmation naming the value it falls back to;
//   * the blast radius is said before saving (rule 9);
//   * a refusal envelope from the door renders as the reason it carries.

import { useState } from "react";
import { Gavel, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { setKnobOverride } from "./service";
import type { KnobScopeKindName, ScopedKnob } from "./types";

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseDraft(knob: ScopedKnob, raw: string): { value?: unknown; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: `${knob.label} needs a value` };
  switch (knob.value_type) {
    case "number":
    case "integer": {
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) return { error: `${knob.label} needs a number` };
      return { value: parsed };
    }
    case "boolean":
      return { value: trimmed === "true" };
    case "json": {
      try {
        return { value: JSON.parse(trimmed) };
      } catch {
        return { error: `${knob.label} needs valid JSON` };
      }
    }
    default:
      return { value: trimmed };
  }
}

export function KnobOverrideRow(props: {
  knob: ScopedKnob;
  scopeKind: KnobScopeKindName;
  scopeId: string;
  organizationId: string;
  /** What a save reaches — said before saving, per settings-ladder rule 9. */
  blastRadius: string;
  onChanged: () => void;
}) {
  const { knob, scopeKind, scopeId, organizationId, blastRadius, onChanged } = props;
  const overrideValue = scopeKind === "user" ? knob.user_override : knob.org_override;
  const isSetHere = overrideValue !== null && overrideValue !== undefined;
  const [draft, setDraft] = useState<string>(() =>
    isSetHere ? valueText(overrideValue) : "",
  );
  const [busy, setBusy] = useState(false);

  const write = async (value: unknown) => {
    setBusy(true);
    try {
      const result = await setKnobOverride({
        feature: knob.feature,
        key: knob.key,
        scopeKind,
        scopeId,
        organizationId,
        value,
      });
      if (!result.ok) {
        toast.error(result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`);
        return;
      }
      toast.success(
        value === null
          ? `${knob.label} now inherits the platform value`
          : `${knob.label} saved. ${blastRadius}`,
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const parsed = parseDraft(knob, draft);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    await write(parsed.value);
  };

  const clear = async () => {
    const confirmed = await confirm({
      title: `Use the platform value for ${knob.label}?`,
      description: `The override is removed and this setting falls back to ${valueText(
        knob.platform_default,
      )}${knob.unit ? ` ${knob.unit}` : ""}.`,
      confirmLabel: "Use platform value",
    });
    if (confirmed) await write(null);
  };

  const enumOptions =
    knob.value_type === "enum" || knob.value_type === "boolean"
      ? knob.value_type === "boolean"
        ? ["true", "false"]
        : (knob.allowed_values ?? []).map(String)
      : null;

  return (
    <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{knob.label}</span>
          <code className="text-xs text-muted-foreground">{knob.key}</code>
          {isSetHere ? (
            <Badge variant="default" className="text-xs">
              Set here
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Inherited from platform
            </Badge>
          )}
          {knob.out_of_range && (
            <Badge variant="destructive" className="text-xs">
              outside current range — clamped
            </Badge>
          )}
          {knob.override_direction !== "any" && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              {knob.override_direction.replace("_", " ")}
            </Badge>
          )}
          {knob.bound_value !== null && knob.bound_value !== undefined && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Gavel className="h-3 w-3" />
              floor {valueText(knob.bound_value)}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{knob.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Platform default {valueText(knob.platform_default)}
          {knob.unit ? ` ${knob.unit}` : ""}
          {knob.basis ? (
            <>
              {" · "}
              <span className="font-medium">Because: </span>
              {knob.basis}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex items-start gap-2">
        {enumOptions ? (
          <select
            className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm"
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="" disabled>
              {valueText(knob.effective_value)}
            </option>
            {enumOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <Input
            className="w-40"
            placeholder={valueText(knob.effective_value)}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <Button size="sm" disabled={busy || draft.trim() === ""} onClick={() => void save()}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !isSetHere}
          title="Remove the override and inherit the platform value"
          onClick={() => void clear()}
        >
          Use platform value
        </Button>
      </div>
    </div>
  );
}

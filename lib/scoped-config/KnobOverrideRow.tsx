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
//   * a refusal envelope from the door renders as the reason it carries;
//   * the CONTROL itself comes from the ONE renderer
//     (features/settings/universal/KnobFieldControl.tsx), so a model key gets
//     the model picker and a voice key gets the voice picker at every rung —
//     this row never decides what a control looks like, only what it says.

import { useEffect, useState } from "react";
import { Gavel, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import {
  KnobFieldControl,
  hasFieldControl,
} from "@/features/settings/universal/KnobFieldControl";
import { formatKnobValue, type KnobLadder } from "./ladder";
import { setKnobOverride, setKnobRungLock } from "./service";
import { setFeatureKnob } from "@/features/admin/limits/service";
import { SettingAnchor } from "@/features/settings/doors/SettingAnchor";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
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
  /** Hide the implementation key on curated, user-facing sections. */
  hideKey?: boolean;
  /**
   * The resolver's own answer for THIS rung (`resolveKnobLadder`). Required to
   * be right at a sub-organization rung: `user_override` / `org_override` are
   * the only two values the flat row ever knew about, so a pay group's or a
   * location's own value read as "inherited from your organization" and its
   * Inherit button followed the organization's row instead of its own. Where a
   * caller passes it, the scope chain decides origin, what a clear falls back
   * to, and whether there is anything here to clear.
   */
  ladder?: KnobLadder;
  /**
   * Org screen only: render the per-key "personal overrides" switch (the
   * scfg_50 rung lock — the org turning off user-level control of this one
   * setting even though the platform allows it). Owner/admin gated in SQL.
   */
  showUserLockControl?: boolean;
  /** Platform defaults use feature_knob_set; platform is not a scoped rung. */
  system?: { canWrite: boolean; registeredDefault: unknown };
  onChanged: () => void;
}) {
  const {
    knob,
    scopeKind,
    scopeId,
    organizationId,
    blastRadius,
    hideKey = false,
    ladder,
    showUserLockControl,
    system,
    onChanged,
  } = props;
  const flatOverride = scopeKind === "user" ? knob.user_override : knob.org_override;
  const overrideValue = ladder
    ? ladder.setHere
      ? ladder.here?.value
      : undefined
    : flatOverride;
  const isSetHere = ladder
    ? ladder.setHere
    : flatOverride !== null && flatOverride !== undefined;
  // What clearing falls back to: the nearest rung ABOVE this one that holds a
  // live value. With a ladder the scope chain answers; without one the only
  // parent the flat row knows is the organization (user rung) or the platform.
  const hasOrgParent =
    scopeKind === "user" &&
    knob.org_override !== null &&
    knob.org_override !== undefined;
  const inheritedValue = ladder
    ? ladder.inheritedValue
    : hasOrgParent
      ? knob.org_override
      : knob.platform_default;
  const inheritedFrom = ladder
    ? ladder.inheritedFrom
    : hasOrgParent
      ? "your organization"
      : "the platform";
  const overrideText = isSetHere ? valueText(overrideValue) : "";
  const [draft, setDraft] = useState<string>(overrideText);
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Re-sync the draft whenever the row starts representing different state —
  // a clear, a refresh, or (on the personal tab) an organization switch. A
  // stale draft would otherwise be one Save away from landing in the wrong org.
  useEffect(() => {
    setDraft(overrideText);
  }, [knob.full_key, organizationId, scopeId, overrideText]);

  const write = async (value: unknown) => {
    setBusy(true);
    setInlineError(null);
    try {
      if (system) {
        const result = await setFeatureKnob(knob.feature, knob.key, value);
        if (!result.ok) {
          const detail = result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`;
          setInlineError(detail);
          toast.error(detail);
          return;
        }
        toast.success(value === null ? `${knob.label} restored to its registered default.` : `${knob.label} saved for the platform.`);
        onChanged();
        return;
      }
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
          ? `${knob.label} now inherits from ${inheritedFrom}`
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

  const setUserLock = async (lock: boolean) => {
    if (lock) {
      const confirmed = await confirm({
        title: `Turn off personal overrides for ${knob.label}?`,
        description:
          "Members can no longer set their own value for this setting, and any personal values they already saved stop applying (they are kept, and come back if you turn personal overrides on again).",
        confirmLabel: "Turn them off",
      });
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const result = await setKnobRungLock({
        feature: knob.feature,
        key: knob.key,
        organizationId,
        lockedKinds: lock ? ["user"] : [],
      });
      if (!result.ok) {
        toast.error(result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`);
        return;
      }
      toast.success(
        lock
          ? `Personal overrides are off for ${knob.label}.`
          : `Personal overrides are allowed again for ${knob.label}.`,
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (system) {
      const confirmed = await confirm({
        title: `Restore ${knob.label} to its registered default?`,
        description: `The platform value becomes ${formatKnobValue(system.registeredDefault, knob.unit)}.`,
        confirmLabel: "Restore registered default",
      });
      if (confirmed) await write(null);
      return;
    }
    const confirmed = await confirm({
      title: `Inherit ${knob.label} from ${inheritedFrom}?`,
      description: `The override is removed and this setting falls back to ${formatKnobValue(
        inheritedValue,
        knob.unit,
      )}.`,
      confirmLabel: "Inherit it",
    });
    if (confirmed) await write(null);
  };

  // On the personal tab, a key the org has locked renders read-only: the org
  // decided members don't steer this one, and the door would refuse anyway.
  const lockedForMe = scopeKind === "user" && knob.user_override_locked;

  // The ladder is what names the control. Without one (the flat HR callers)
  // there is no `control` to honour, so the by-type editor below still runs.
  const fieldLadder = ladder && hasFieldControl(ladder.control)
    ? system
      ? { ...ladder, value: knob.platform_default, canWrite: system.canWrite, cannotWriteBecause: null }
      : ladder
    : null;

  const enumOptions =
    knob.value_type === "enum" || knob.value_type === "boolean"
      ? knob.value_type === "boolean"
        ? ["true", "false"]
        : (knob.allowed_values ?? []).map(String)
      : null;

  return (
    <SettingAnchor id={knob.full_key}>
      <SettingsRow
        id={knob.full_key}
        label={knob.label}
        description={knob.description}
        helpText={knob.ui.help}
        error={inlineError ?? undefined}
        modified={system ? JSON.stringify(knob.platform_default) !== JSON.stringify(system.registeredDefault) : isSetHere}
        controlLayout="wide"
        variant="stacked"
      >
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {!hideKey && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Details</summary><code>{knob.full_key}</code></details>}
          {isSetHere ? (
            <Badge variant="default" className="text-xs">
              Set here
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Inherited from {inheritedFrom}
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
              floor {formatKnobValue(knob.bound_value, knob.unit)}
            </Badge>
          )}
        </div>
        {showUserLockControl && knob.overridable_by.includes("user") && (
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            Personal overrides{" "}
            <span className="font-medium">
              {knob.user_override_locked ? "off for this organization" : "allowed"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => void setUserLock(!knob.user_override_locked)}
            >
              {knob.user_override_locked ? "Allow" : "Turn off"}
            </Button>
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {system ? "Registered default" : "Platform default"} {formatKnobValue(system?.registeredDefault ?? knob.platform_default, knob.unit)}
          {knob.basis ? (
            <>
              {" · "}
              <span className="font-medium">Because: </span>
              {knob.basis}
            </>
          ) : null}
        </p>
      </div>
      {lockedForMe ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Your organization manages this setting.
        </div>
      ) : fieldLadder ? (
        // A picker IS the choice: it writes the moment a person chooses, so
        // there is no Save beside it. "Inherit" stays — clearing is a
        // different action from choosing, at every rung (rule 4).
        <div className="flex items-start gap-2">
          <KnobFieldControl
            knob={knob}
            ladder={fieldLadder}
            disabled={busy || !fieldLadder.canWrite || !system?.canWrite && Boolean(system)}
            onCommit={(value) => write(value)}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !isSetHere}
            title={`Remove the override and inherit from ${inheritedFrom}`}
            onClick={() => void clear()}
          >
            {system ? "Restore registered default" : "Inherit"}
          </Button>
        </div>
      ) : (
      <div className="flex items-start gap-2">
        {enumOptions ? (
          <select
            className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm"
            value={draft}
            disabled={busy || !system?.canWrite && Boolean(system)}
            onChange={(event) => setDraft(event.target.value)}
          >
            <option value="" disabled>
              {formatKnobValue(knob.effective_value, knob.unit)}
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
            placeholder={formatKnobValue(knob.effective_value, knob.unit)}
            value={draft}
            disabled={busy || !system?.canWrite && Boolean(system)}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <Button size="sm" disabled={busy || draft.trim() === "" || !system?.canWrite && Boolean(system)} onClick={() => void save()}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || (system ? JSON.stringify(knob.platform_default) === JSON.stringify(system.registeredDefault) : !isSetHere)}
          title={system ? "Restore the registered default" : `Remove the override and inherit from ${inheritedFrom}`}
          onClick={() => void clear()}
        >
          {system ? "Restore registered default" : "Inherit"}
        </Button>
      </div>
      )}
    </div>
    </SettingsRow>
    </SettingAnchor>
  );
}

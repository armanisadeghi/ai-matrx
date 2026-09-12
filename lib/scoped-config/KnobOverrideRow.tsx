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
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  KnobFieldControl,
  hasFieldControl,
} from "@/features/settings/universal/KnobFieldControl";
import { formatKnobValue, type KnobLadder } from "./ladder";
import { setKnobOverride } from "./service";
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
  /** Platform defaults use feature_knob_set; platform is not a scoped rung. */
  system?: { canWrite: boolean; registeredDefault: unknown };
  /** Retained for existing callers; user-preference locks have no mutable UI. */
  showUserLockControl?: boolean;
  stateOnly?: { reason: string; consumerEvidence: string } | null;
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
    system,
    stateOnly,
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
          return false;
        }
        toast.success(value === null ? `${knob.label} restored to its registered default.` : `${knob.label} saved for the platform.`);
        onChanged();
        return true;
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
        const detail = result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`;
        setInlineError(detail);
        toast.error(detail);
        return false;
      }
      toast.success(
        value === null
          ? `${knob.label} now inherits from ${inheritedFrom}`
          : `${knob.label} saved. ${blastRadius}`,
      );
      onChanged();
      return true;
    } catch (err) {
      const detail = extractErrorMessage(err);
      setInlineError(detail);
      toast.error(detail);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const parsed = parseDraft(knob, draft);
    if (parsed.error) {
      toast.error(parsed.error);
      return false;
    }
    return write(parsed.value);
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
  const canWrite = system ? system.canWrite : ladder?.canWrite ?? !lockedForMe;

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
        error={inlineError ?? (!canWrite ? ladder?.cannotWriteBecause ?? "This setting cannot be changed here." : undefined)}
        modified={system ? JSON.stringify(knob.platform_default) !== JSON.stringify(system.registeredDefault) : isSetHere}
        controlLayout="wide"
        variant="inline"
      >
      <div className="flex w-full max-w-60 flex-col items-end gap-1">
      {stateOnly ? (
        <div className="text-sm text-muted-foreground">This preference is not available yet.</div>
      ) : lockedForMe ? (
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
            identityKey={`${knob.full_key}:${organizationId}:${scopeKind}:${scopeId}`}
            disabled={busy || !canWrite}
            onCommit={(value) => write(value)}
          />
          {(system ? JSON.stringify(knob.platform_default) !== JSON.stringify(system.registeredDefault) : isSetHere) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !canWrite || (system ? JSON.stringify(knob.platform_default) === JSON.stringify(system.registeredDefault) : !isSetHere)}
            title={system ? "Restore the registered default" : `Remove the override and inherit from ${inheritedFrom}`}
            onClick={() => void clear()}
          >
            {system ? "Restore registered default" : "Inherit"}
          </Button>
          )}
        </div>
      ) : (
      <div className="flex items-start gap-2">
        {enumOptions ? (
          <select
            className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm"
            id={knob.full_key}
            aria-label={knob.label}
            value={draft}
            disabled={busy || !canWrite}
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
            id={knob.full_key}
            aria-label={knob.label}
            placeholder={formatKnobValue(knob.effective_value, knob.unit)}
            value={draft}
            disabled={busy || !canWrite}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <Button size="sm" disabled={busy || draft.trim() === "" || !canWrite} onClick={() => void save()}>
          Save
        </Button>
        {(system ? JSON.stringify(knob.platform_default) !== JSON.stringify(system.registeredDefault) : isSetHere) && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !canWrite || (system ? JSON.stringify(knob.platform_default) === JSON.stringify(system.registeredDefault) : !isSetHere)}
          title={system ? "Restore the registered default" : `Remove the override and inherit from ${inheritedFrom}`}
          onClick={() => void clear()}
        >
          {system ? "Restore registered default" : "Inherit"}
        </Button>
        )}
      </div>
      )}
      <div className="flex w-full items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>{stateOnly
          ? "Not connected yet"
          : system
            ? JSON.stringify(knob.platform_default) !== JSON.stringify(system.registeredDefault)
              ? "Set for the platform"
              : "Registered default"
            : isSetHere
              ? "Set here"
              : `Inherited from ${inheritedFrom}`}</span>
        <details className="relative">
          <summary aria-label={`Details for ${knob.label}`} className="cursor-pointer">Details</summary>
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-border bg-popover p-3 text-left text-xs leading-snug text-popover-foreground shadow-md">
            {!hideKey ? `Key: ${knob.full_key}. ` : ""}{system ? `Registered default: ${formatKnobValue(system.registeredDefault, knob.unit)}. ` : `Platform default: ${formatKnobValue(knob.platform_default, knob.unit)}. `}{knob.bound_value !== null && knob.bound_value !== undefined ? `Bound: ${formatKnobValue(knob.bound_value, knob.unit)}. ` : ""}{knob.basis ? `Basis: ${knob.basis}. ` : ""}{stateOnly ? `Audit: ${stateOnly.consumerEvidence}` : ""}
          </div>
        </details>
      </div>
    </div>
    </SettingsRow>
    </SettingAnchor>
  );
}

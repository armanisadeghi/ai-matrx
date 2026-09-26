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

import { useState } from "react";
import { Lock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  KnobFieldControl,
  hasFieldControl,
} from "@/features/settings/universal/KnobFieldControl";
import { knobChoices, knobIsClosedChoice } from "./choices";
import Link from "next/link";
import {
  formatKnobValue,
  systemOriginSentence,
  type KnobLadder,
  type ViewerStanding,
} from "./ladder";
import { voiceDisplayName, voiceSetOf } from "@/lib/voices/voiceSets";
import {
  setKnobOverride,
  setKnobRungLock,
  writeKnobOverrideThroughDoor,
  type KnobWriteDoor,
} from "./service";
import { setFeatureKnob } from "@/features/admin/limits/service";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KnobScopeKindName, ScopedKnob } from "./types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { databaseConsumersOf } from "@/features/settings/universal/knobDatabaseConsumers.generated";
import { KnobHistoryPopover } from "./KnobHistoryPopover";

/**
 * The text a row's editor STARTS IN. An absent value is an EMPTY box, never a
 * printed em dash: the dash is how a sentence says "nothing", and seeding the
 * input with it meant an admin who clicked a field and typed 9 sent "—9",
 * which parses to nothing and refuses. The placeholder already carries what is
 * in force, and an empty box keeps Save correctly disabled until something is
 * typed. (Independent review of the limits register, 2026-09-22.)
 */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * A personal settings row edits what the person is using now.  An absent
 * personal override is not an empty draft: the organization/platform answer
 * is the starting value for an intentional personal change.
 */
export function editableKnobValue(
  scopeKind: KnobScopeKindName,
  ladder: KnobLadder | undefined,
  knob: ScopedKnob,
  overrideValue: unknown,
  /**
   * The system destination does not edit an OVERRIDE at all — it edits the
   * platform default itself, which always has a value. Read as an override it
   * came back empty, so every one of the ~880 admin rows opened blank.
   */
  isSystem = false,
): unknown {
  if (isSystem) return knob.platform_default;
  if (scopeKind !== "user") return overrideValue;
  return ladder?.value ?? knob.effective_value;
}

export function sameKnobValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatRowValue(
  value: unknown,
  unit: string | null,
  control: KnobLadder["control"] | undefined,
  /**
   * 🚨 A CHOICE IS SAID IN WORDS, NEVER AS ITS STORED TOKEN. The control
   * already obeys this (`knobChoices`); every SENTENCE on the row — the
   * inherit confirmation, the platform-default line, and the "in force for
   * you" notice — used to print the raw token, so a person was told their
   * setting falls back to `off` rather than to "Never". Same registry words,
   * one formatter.
   */
  choices?: ReadonlyArray<{ value: string; label: string }> | null,
  /** A voice knob's `ui.preview` — which voice set its value belongs to. */
  preview?: string | null,
): string {
  if (choices && (typeof value === "string" || typeof value === "boolean")) {
    const match = choices.find((choice) => choice.value === String(value));
    if (match) return match.label;
  }
  if (control !== "voice") return formatKnobValue(value, unit);
  if (value !== null && value !== undefined && typeof value !== "string") {
    return formatKnobValue(value, unit);
  }
  return voiceDisplayName(voiceSetOf(preview), value);
}

function parseDraft(
  knob: ScopedKnob,
  raw: string,
): { value?: unknown; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: `${knob.label} needs a value` };
  switch (knob.value_type) {
    case "number":
    case "integer": {
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed))
        return { error: `${knob.label} needs a number` };
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
  /**
   * How many organizations hold their own value for this key. Only the system
   * destination has it (it reads the override register); `undefined` means
   * NOT KNOWN, and the origin line then simply does not mention overrides
   * rather than implying there are none.
   */
  overrideCount?: number | null;
  /**
   * Org screen only: offer the per-key "personal overrides" switch (the scfg_50
   * rung lock — the organization turning off user-level control of this one
   * setting even though the platform allows it; Arman 2026-08-29). Owner/admin
   * gated in SQL. f489f35f3e had removed it as a mirror of aidream 0640's lock
   * exemption; 0702 reverted that exemption, so the switch is back.
   */
  showUserLockControl?: boolean;
  /**
   * DD-183 — this row is ONE picked scope row at a per-row rung (a table, an
   * agent, a pay group), not the rung the section is standing in. The row is
   * then named by the SCOPE ("wine_tasting"), because the knob's own name is
   * already the heading above it, and its DOM identity is qualified by that
   * scope so twenty exceptions for one key are twenty distinct controls rather
   * than twenty elements sharing one id.
   *
   * It changes what the row is CALLED and nothing about what it does: the same
   * editor, the same ladder, the same doors (settings-ladder rule 2).
   */
  scopeLabel?: string;
  /**
   * 🚨 DD-221 — the door THIS key declares, read from
   * `platform.knob_write_door_for`. When a caller supplies it, the save and the
   * removal go through it instead of the default `platform.knob_override_set`,
   * so an `hr.` exception passes HR's own gate and files HR's own audit row.
   * Omitted, the row writes through the default door exactly as before.
   */
  writeDoor?: KnobWriteDoor;
  stateOnly?: { reason: string; consumerEvidence: string } | null;
  /**
   * 🚨 WHAT IS IN FORCE FOR THE PERSON READING THE ROW (feedback 7dc1e5ae,
   * 2026-09-21), as `platform.knob_index` resolved it for THEM — not as this
   * rung reads. When a rung above the one being edited holds their answer, the
   * row says so in words and names the rung; otherwise the effective value is
   * still stated, in the row's own options panel, so the screen always carries
   * the answer somewhere rather than only when it is bad news.
   *
   * `undefined` / `null` means NOT KNOWN — never "nothing masks this".
   */
  viewer?: ViewerStanding | null;
  /** The sentence to print when the viewer's answer could not be read at all. */
  viewerUnknown?: string | null;
  /** Where the viewer changes the setting that is overriding this one. */
  viewerDoor?: string | null;
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
    overrideCount,
    stateOnly,
    scopeLabel,
    writeDoor,
    viewer,
    viewerUnknown,
    viewerDoor,
    onChanged,
  } = props;
  const flatOverride =
    scopeKind === "user" ? knob.user_override : knob.org_override;
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
  const editableValue = editableKnobValue(
    scopeKind,
    ladder,
    knob,
    overrideValue,
    Boolean(system),
  );
  const overrideText = valueText(editableValue);
  // The ONE choice vocabulary for this row — the control and every sentence
  // about a value read from the same list (`./choices`).
  // A string knob with registered values is a choice too (`knobIsClosedChoice`).
  const rowChoices = knobIsClosedChoice(knob) ? knobChoices(knob) : null;
  const displayValue = (value: unknown) =>
    formatRowValue(value, knob.unit, ladder?.control, rowChoices, knob.ui?.preview);
  const draftIdentity = `${knob.full_key}:${organizationId}:${scopeId}:${overrideText}`;
  const [draft, setDraft] = useState<string>(overrideText);
  const [syncedDraftIdentity, setSyncedDraftIdentity] = useState(draftIdentity);
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Re-sync the draft whenever the row starts representing different state —
  // a clear, a refresh, or (on the personal tab) an organization switch. A
  // stale draft would otherwise be one Save away from landing in the wrong org.
  if (syncedDraftIdentity !== draftIdentity) {
    setSyncedDraftIdentity(draftIdentity);
    setDraft(overrideText);
  }

  const write = async (value: unknown) => {
    // A personal control is initialized from its effective value. This guard
    // makes opening it, or pressing Save without changing it, a true no-op.
    if (scopeKind === "user" && sameKnobValue(value, editableValue)) {
      return true;
    }
    setBusy(true);
    setInlineError(null);
    try {
      if (system) {
        const result = await setFeatureKnob(knob.feature, knob.key, value);
        if (!result.ok) {
          const detail =
            result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`;
          setInlineError(detail);
          toast.error(detail);
          return false;
        }
        toast.success(
          value === null
            ? `${knob.label} restored to its registered default.`
            : `${knob.label} saved for the platform.`,
        );
        onChanged();
        return true;
      }
      // DD-221: the key's own door when the caller read one, the default door
      // otherwise. Never a guess about which — the declaration answers.
      const result = writeDoor
        ? await writeKnobOverrideThroughDoor({
            door: writeDoor,
            feature: knob.feature,
            key: knob.key,
            scopeKind,
            scopeId,
            organizationId,
            value,
          })
        : await setKnobOverride({
            feature: knob.feature,
            key: knob.key,
            scopeKind,
            scopeId,
            organizationId,
            value,
          });
      if (!result.ok) {
        const detail =
          result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`;
        setInlineError(detail);
        toast.error(detail);
        return false;
      }
      toast.success(
        value === null
          ? scopeLabel
            ? `${scopeLabel} no longer has its own ${knob.label}; it follows ${inheritedFrom}.`
            : `${knob.label} now inherits from ${inheritedFrom}`
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

  const userLockAvailable =
    Boolean(props.showUserLockControl) &&
    !system &&
    !scopeLabel &&
    scopeKind === "organization" &&
    knob.overridable_by.includes("user");

  const setUserLock = async (lock: boolean) => {
    if (lock) {
      const confirmed = await confirm({
        title: `Turn off personal overrides for ${knob.label}?`,
        description:
          "Members can no longer set their own value for this setting, and any personal values they already saved stop applying. Those values are kept and apply again if you allow personal overrides later.",
        confirmLabel: "Turn off personal overrides",
      });
      if (!confirmed) return;
    }
    // Keep every other rung this organization has locked; only the user rung moves.
    const others = (knob.org_locked_kinds ?? []).filter((kind) => kind !== "user");
    setBusy(true);
    try {
      const result = await setKnobRungLock({
        feature: knob.feature,
        key: knob.key,
        organizationId,
        lockedKinds: lock ? [...others, "user"] : others,
      });
      if (!result.ok) {
        const detail =
          result.detail ?? `Refused: ${result.reason.replace(/_/g, " ")}`;
        setInlineError(detail);
        toast.error(detail);
        return;
      }
      toast.success(
        lock
          ? `Personal overrides are off for ${knob.label}.`
          : `Personal overrides are allowed again for ${knob.label}.`,
      );
      onChanged();
    } catch (err) {
      const detail = extractErrorMessage(err);
      setInlineError(detail);
      toast.error(detail);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (system) {
      const confirmed = await confirm({
        title: `Restore ${knob.label} to its registered default?`,
        description: `The platform value becomes ${displayValue(system.registeredDefault)}.`,
        confirmLabel: "Restore registered default",
      });
      if (confirmed) await write(null);
      return;
    }
    // 🚨 F2 (V-57). A destructive click names its TARGET, not only its
    // consequence. With twenty exceptions listed, every confirm used to read
    // character-for-character the same — "Inherit <knob label> from …?" — so
    // the one sentence a person reads before destroying a row could not tell
    // them which row. At a picked scope the row IS the subject, so it leads.
    const confirmed = await confirm({
      title: scopeLabel
        ? `Remove ${scopeLabel}’s own value for ${knob.label}?`
        : `Inherit ${knob.label} from ${inheritedFrom}?`,
      description: scopeLabel
        ? `${scopeLabel} stops having its own value and follows ${inheritedFrom}, which is ${displayValue(inheritedValue)} today.`
        : `The override is removed and this setting falls back to ${displayValue(inheritedValue)}.`,
      confirmLabel: scopeLabel ? `Remove ${scopeLabel}’s value` : "Inherit it",
    });
    if (confirmed) await write(null);
  };

  // On the personal tab, a key the org has locked renders read-only: the org
  // decided members don't steer this one, and the door would refuse anyway.
  const lockedForMe = scopeKind === "user" && knob.user_override_locked;

  // The ladder is what names the control. Without one (the flat HR callers)
  // there is no `control` to honour, so the by-type editor below still runs.
  const fieldLadder =
    ladder && hasFieldControl(ladder.control)
      ? system
        ? {
            ...ladder,
            value: knob.platform_default,
            canWrite: system.canWrite,
            cannotWriteBecause: null,
          }
        : ladder
      : null;
  const canWrite = system
    ? system.canWrite
    : (ladder?.canWrite ?? !lockedForMe);
  const reviewOverdue =
    knob.set_by === "agent" &&
    knob.review_due !== null &&
    new Date(knob.review_due) < new Date();

  // A CHOICE IS SHOWN IN WORDS, NEVER AS ITS STORED TOKEN. This select used to
  // render `allowed_values` verbatim, so the six keys whose registry rows carry
  // real sentences (`ui.options`) offered `hash_only` and `manual_wins` to a
  // person. `knobChoices` is the one place those words live (`./choices`).
  const enumOptions = rowChoices;
  // A picked scope row qualifies every DOM identity on the row; the section's
  // own rung keeps the bare key so existing anchors and deep links still land.
  const rowIdentity = scopeLabel
    ? `${knob.full_key}@${scopeKind}:${scopeId}`
    : knob.full_key;
  const inputId = `${rowIdentity}-input`;
  const labelId = `${inputId}-label`;
  // 🚨 THE HONESTY LINE (feedback 7dc1e5ae). Three states, all of them said
  // out loud, none of them silence:
  //   MASKED   — a rung above this one answers for the reader; name it, print
  //              the value that is really running, and open the door to it.
  //   UNKNOWN  — the viewer read failed; say that, rather than let the absence
  //              of a warning read as "nothing masks this".
  //   AGREED   — the control already shows the answer; the options panel
  //              restates it with its rung, and the row stays quiet.
  const viewerNotice =
    viewer?.masked === true ? (
      <span>
        {viewer.sentence} In effect for you: {displayValue(viewer.value)}.
        {viewerDoor ? (
          <>
            {" "}
            <Link
              href={viewerDoor}
              className="underline underline-offset-2 hover:no-underline"
            >
              Change your own setting
            </Link>
            .
          </>
        ) : null}
      </span>
    ) : viewerUnknown ? (
      <span>
        What is in force for you could not be read, so this may not be the value
        running for you: {viewerUnknown}
        <ErrorAlchemyMenu />
      </span>
    ) : undefined;

  // 🚨 THE KEY AND THE ORIGIN ARE READ, NOT HUNTED. On the system register an
  // operator scans ~880 rows looking for one key ("orchestration.loop_guard.*")
  // and needs to know at a glance whether a value is still what shipped. Both
  // facts used to live only inside the row's "…" popover, which is a fact you
  // cannot scan. They are printed on the row itself at the system destination;
  // the curated user-facing sections still pass `hideKey` and stay clean.
  const systemOrigin = system
    ? systemOriginSentence(knob, system.registeredDefault, overrideCount)
    : null;
  const metaLine =
    systemOrigin && !hideKey && !scopeLabel ? (
      <>
        <code className="rounded bg-muted px-1 py-px font-mono text-[10px] text-foreground/80">
          {knob.full_key}
        </code>
        <span aria-hidden>·</span>
        <span>{systemOrigin}</span>
      </>
    ) : undefined;

  // 🚨 PREVIEW BEFORE SAVE (settings history, 2026-09-26). What a change here
  // reaches, said in one sentence while the person is changing it: the blast
  // radius, what it overrides, and — where the live census knows — how many
  // database functions read this key. Shown while the control has focus and
  // whenever a typed draft differs from what is saved.
  const readers = databaseConsumersOf(knob.full_key);
  const readerSentence = readers
    ? ` Read by ${readers.length} database function${readers.length === 1 ? "" : "s"} (${readers.slice(0, 3).join(", ")}${readers.length > 3 ? ", …" : ""}).`
    : "";
  const impactSentence = system
    ? `Changes the platform value every organization inherits${
        typeof overrideCount === "number"
          ? overrideCount > 0
            ? ` (${overrideCount} organization${overrideCount === 1 ? " has" : "s have"} its own value and ${overrideCount === 1 ? "is" : "are"} unaffected)`
            : " (no organization has its own value)"
          : ""
      }; currently ${displayValue(knob.platform_default)}.${readerSentence}`
    : `${blastRadius}${blastRadius.trim().endsWith(".") ? "" : "."} ${
        isSetHere ? "Replaces the value set here" : `Overrides ${inheritedFrom}`
      }, which is ${displayValue(isSetHere ? overrideValue : inheritedValue)} today.${readerSentence}`;
  const draftDirty =
    !fieldLadder &&
    !stateOnly &&
    !lockedForMe &&
    draft.trim() !== "" &&
    !sameKnobValue(parseDraft(knob, draft).value, editableValue);

  const usesLabelledGroup =
    Boolean(stateOnly) ||
    lockedForMe ||
    (fieldLadder !== null &&
      ["segmented", "slider", "json", "secret"].includes(fieldLadder.control));

  return (
    <SettingsRow
      id={inputId}
      anchorId={rowIdentity}
      labelFor={usesLabelledGroup ? null : inputId}
      label={scopeLabel ?? knob.label}
      meta={metaLine}
      description={scopeLabel ? undefined : knob.description}
      helpText={scopeLabel ? undefined : knob.ui.help}
      warning={viewerNotice}
      error={
        inlineError ??
        (!canWrite
          ? (ladder?.cannotWriteBecause ??
            "This setting cannot be changed here.")
          : undefined)
      }
      modified={
        system
          ? JSON.stringify(knob.platform_default) !==
            JSON.stringify(system.registeredDefault)
          : scopeKind === "user"
            ? false
            : isSetHere
      }
      controlLayout="wide"
      variant="inline"
    >
      <div className="flex w-full min-w-0 max-w-[calc(20rem+5rem)] items-start gap-1">
        <div
          className={
            scopeKind === "user"
              ? "group/knobrow w-[20rem] min-w-0 max-w-[calc(100%-2.25rem)]"
              : "group/knobrow w-[20rem] min-w-0 max-w-[calc(100%-4.5rem)]"
          }
        >
          {stateOnly ? (
            <div className="text-sm text-muted-foreground">
              This preference is not available yet.
            </div>
          ) : lockedForMe ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              Your organization manages this setting.
            </div>
          ) : fieldLadder ? (
            <KnobFieldControl
              knob={knob}
              ladder={fieldLadder}
              inputId={inputId}
              labelId={labelId}
              identityKey={`${knob.full_key}:${organizationId}:${scopeKind}:${scopeId}`}
              disabled={busy || !canWrite}
              onCommit={(value) => write(value)}
            />
          ) : (
            <div className="flex w-full min-w-0 flex-wrap items-start gap-2">
              {enumOptions ? (
                <Select
                  value={draft || undefined}
                  disabled={busy || !canWrite}
                  onValueChange={setDraft}
                >
                  <SelectTrigger
                    id={inputId}
                    aria-label={
                      scopeLabel
                        ? `${knob.label} for ${scopeLabel}`
                        : knob.label
                    }
                    size="default"
                    className="w-full min-w-0"
                  >
                    {/* The value in force, in the registry's WORDS ("Ask"), never
                        its stored token ("ask") — same reader as every sentence. */}
                    <SelectValue placeholder={displayValue(knob.effective_value)} />
                  </SelectTrigger>
                  <SelectContent>
                    {enumOptions.map((option) => (
                      // The registry's one sentence for the choice rides under its
                      // name, so a person reads what each value DOES before picking.
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        description={option.help}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="w-full min-w-0"
                  id={inputId}
                  aria-label={
                    scopeLabel ? `${knob.label} for ${scopeLabel}` : knob.label
                  }
                  placeholder={formatKnobValue(knob.effective_value, knob.unit)}
                  value={draft}
                  disabled={busy || !canWrite}
                  onChange={(event) => setDraft(event.target.value)}
                />
              )}
              <Button
                size="sm"
                disabled={
                  busy ||
                  draft.trim() === "" ||
                  !canWrite ||
                  sameKnobValue(parseDraft(knob, draft).value, editableValue)
                }
                onClick={() => void save()}
              >
                Save
              </Button>
            </div>
          )}
          {!stateOnly && canWrite && (
            <p
              className={`${draftDirty ? "block" : "hidden group-focus-within/knobrow:block"} mt-1 text-xs leading-snug text-muted-foreground`}
            >
              {impactSentence}
            </p>
          )}
        </div>
        <KnobHistoryPopover
          feature={knob.feature}
          key_={knob.key}
          label={scopeLabel ? `${knob.label} — ${scopeLabel}` : knob.label}
          organizationId={system ? null : organizationId}
          scopeKind={system ? "platform" : scopeKind}
          scopeId={system ? null : scopeId}
          canRevert={canWrite && !stateOnly}
          displayValue={displayValue}
          onRevert={(value) => write(value)}
        />
        {scopeKind !== "user" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Options for ${scopeLabel ?? knob.label}`}
                className="h-9 w-9 shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              sizing="content"
              align="end"
              className="space-y-3 break-words p-3 text-left text-xs leading-snug [overflow-wrap:anywhere]"
            >
              <div className="space-y-1 text-muted-foreground">
                <p>
                  {stateOnly
                    ? "Not connected yet."
                    : systemOrigin
                      ? `${systemOrigin}.`
                      : isSetHere
                        ? "Set here."
                        : `Inherited from ${inheritedFrom}.`}
                </p>
                {/*
                  🚨 THE EFFECTIVE VALUE FOR THE READER, ALWAYS (feedback
                  7dc1e5ae). The row's warning line only appears when a higher
                  rung masks this one; this panel carries the answer even when
                  it agrees, so the screen is never in a state where "what is
                  actually running for me" has to be inferred from silence.
                */}
                {viewer ? (
                  <p>
                    In effect for you: {displayValue(viewer.value)} — from{" "}
                    {viewer.originName}
                  </p>
                ) : viewerUnknown ? (
                  <p>In effect for you: could not be read ({viewerUnknown}) <ErrorAlchemyMenu /></p>
                ) : null}
                {!hideKey && <p>Key: {knob.full_key}</p>}
                <p>
                  {system
                    ? `Registered default: ${displayValue(system.registeredDefault)}`
                    : `Platform default: ${displayValue(knob.platform_default)}`}
                </p>
                {knob.bound_value !== null &&
                  knob.bound_value !== undefined && (
                    <p>Bound: {displayValue(knob.bound_value)}</p>
                  )}
                {!hideKey && knob.basis && <p>Basis: {knob.basis}</p>}
                {system && (
                  <p
                    className={
                      reviewOverdue ? "font-medium text-amber-600" : undefined
                    }
                  >
                    {knob.set_by === "agent" ? "Agent-set" : "Reviewed"}
                    {knob.review_due ? ` · review ${knob.review_due}` : ""}
                  </p>
                )}
                {!hideKey && stateOnly && (
                  <p>Audit: {stateOnly.consumerEvidence}</p>
                )}
              </div>
              {(system
                ? JSON.stringify(knob.platform_default) !==
                  JSON.stringify(system.registeredDefault)
                : isSetHere) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start whitespace-normal text-left"
                  disabled={busy || !canWrite}
                  onClick={() => void clear()}
                >
                  {system ? "Restore registered default" : "Inherit this value"}
                </Button>
              )}
              {userLockAvailable && (
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-muted-foreground">
                    Personal overrides:{" "}
                    <span className="font-medium text-foreground">
                      {knob.user_override_locked
                        ? "off for this organization"
                        : "allowed"}
                    </span>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start whitespace-normal text-left"
                    disabled={busy}
                    onClick={() => void setUserLock(!knob.user_override_locked)}
                  >
                    {knob.user_override_locked
                      ? "Allow personal overrides"
                      : "Turn off personal overrides"}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </SettingsRow>
  );
}

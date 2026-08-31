"use client";

/**
 * StoredModelOverridesField — THE control for a stored `llm_overrides` blob.
 *
 * 🚨 WHY THIS EXISTS (Arman, 2026-08-31; VISION-RECONCILIATION B15 + B16).
 *
 *   *"Users are not expected to enter objects and we should, at no time, force
 *   them to do such a thing."*
 *
 * The model and its settings were editable in exactly one way on the shortcut
 * editor and on the one binding UI's OPTIONS drawer: a raw monospace textarea
 * you typed `{"model": "…", "temperature": 0.2}` into. On the binding screen
 * that was the ONLY way to choose a model at all — the strings "Model",
 * "Temperature" and "Favorites" did not occur anywhere on the page.
 *
 * NOTHING NEW IS DESIGNED HERE. Both halves already existed and are mounted
 * unchanged:
 *   · `ModelListDropdown` — the canonical, system-wide model picker (search,
 *     sort, filters, favourites, detail card), the same one the agent builder
 *     mounts at `AgentModelConfiguration.tsx:123`;
 *   · `RunConfigOverrides` — the canonical settings-override editor, whose rows
 *     come from the settings catalogue for whatever model is effective, so it
 *     shows exactly the knobs that model declares and never a curated guess.
 *
 * HOW THE BLOB AND THE PANEL MEET. `RunConfigOverrides` reads and writes the
 * `instanceModelOverrides` slice, keyed by an instance id. A stored blob is not
 * an instance, so this component owns one scratch entry for the lifetime of the
 * field: seeded ONCE from the stored value, torn down on unmount, and mirrored
 * outward on every change through the same `selectSettingsOverridesForApi`
 * projection the run path uses. The round trip is exact — `null` in the blob is
 * a REMOVAL (the key the host must not send), which is what `markRemoved`
 * means, and what the selector writes back out.
 *
 * `baseSettings` is deliberately EMPTY. These overrides are a delta over
 * whatever the holder itself is configured with, and this field does not — and
 * must not — claim to know the holder's settings: a row cleared back to the
 * model's own default therefore CLEARS the override rather than storing a value
 * that would freeze today's default into the record.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  initInstanceOverrides,
  setOverrides,
  markRemoved,
  removeInstanceOverrides,
  resetOverride,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  selectInstanceOverrideState,
  selectSettingsOverridesForApi,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { Label } from "@/components/ui/label";
import {
  RunConfigOverrides,
  type RunConfigOverridesWords,
} from "./RunConfigOverrides";

export interface StoredModelOverridesFieldProps {
  /**
   * A stable id for this field's scratch override entry. It is NOT a
   * conversation — it names the record being edited (e.g.
   * `shortcut-llm-<id>`), so two editors open at once never share a draft.
   */
  instanceKey: string;
  /** The stored blob, or null when the record overrides nothing. */
  value: Record<string, unknown> | null;
  /** Called with the new blob, or null when nothing is overridden any more. */
  onChange: (next: Record<string, unknown> | null) => void;
  /** One sentence about what these overrides cover, in the host's words. */
  hint: string;
  /**
   * The field's own heading. Defaulted, but a host with a SECOND settings
   * surface on the same screen must name this one distinctly — two controls
   * both headed "Model & settings" is a screen that cannot be read.
   */
  title?: string;
  /** The overrides panel's own words. Omit for the per-conversation default. */
  words?: Partial<RunConfigOverridesWords>;
  disabled?: boolean;
}

/**
 * The stored blob as this field understands it. An empty object and a value
 * that is not an object at all both mean "overrides nothing" — normalising them
 * to `null` here is what stops the mount itself reporting a change and marking
 * an untouched form dirty.
 */
const asObject = (value: unknown): Record<string, unknown> | null => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 0 ? null : record;
};

export function StoredModelOverridesField({
  instanceKey,
  value,
  onChange,
  hint,
  title = "Model & settings",
  words,
  disabled = false,
}: StoredModelOverridesFieldProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Subscribe to the RAW entry — a stable reference that changes only when this
  // field's own draft changes. `selectSettingsOverridesForApi` builds a fresh
  // object on every call, so subscribing to IT would re-render this field on
  // every dispatch anywhere in the app; it is read from the store below instead,
  // which keeps the canonical projection without the churn.
  const entry = useAppSelector(selectInstanceOverrideState(instanceKey));
  const ready = Boolean(entry);

  // What we last handed the host. Seeded with the stored value so the mount
  // itself never reports a change — a field that dirties a form by being looked
  // at is the silent half of the defect this file exists to close.
  const lastEmitted = useRef<string>(JSON.stringify(asObject(value)));
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    dispatch(initInstanceOverrides({ conversationId: instanceKey }));
    const stored = asObject(value);
    if (!stored) return;
    const changes: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(stored)) {
      if (entry === null) {
        dispatch(markRemoved({ conversationId: instanceKey, key }));
      } else {
        changes[key] = entry;
      }
    }
    if (Object.keys(changes).length > 0) {
      dispatch(setOverrides({ conversationId: instanceKey, changes }));
    }
    // `value` is read once, on purpose: after seeding, THIS field is the
    // author of the blob and re-reading it would fight the person editing.
  }, [dispatch, instanceKey]);

  useEffect(
    () => () => {
      dispatch(removeInstanceOverrides(instanceKey));
    },
    [dispatch, instanceKey],
  );

  // Mirror outward. Deep-compared, so an identical projection never re-reports.
  useEffect(() => {
    if (!entry) return;
    const next =
      selectSettingsOverridesForApi(instanceKey)(store.getState()) ?? null;
    const serialized = JSON.stringify(next);
    if (serialized === lastEmitted.current) return;
    lastEmitted.current = serialized;
    onChange(next);
  }, [entry, instanceKey, store, onChange]);

  const overrides = (entry?.overrides ?? {}) as Record<string, unknown>;
  const currentModel =
    typeof overrides.model === "string" ? overrides.model : null;

  return (
    <div className="space-y-2 py-2.5">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Label className="shrink-0 text-xs text-muted-foreground">Model</Label>
        <ModelListDropdown
          value={currentModel}
          onValueChange={(id) =>
            dispatch(
              setOverrides({
                conversationId: instanceKey,
                changes: { model: id },
              }),
            )
          }
          // "No override" is a FIRST-CLASS choice, not the absence of one: it
          // is what hands the decision back to the holder's own configuration.
          emptyOptionLabel="Use the holder's own model"
          onClear={() =>
            dispatch(resetOverride({ conversationId: instanceKey, key: "model" }))
          }
          placeholder="Use the holder's own model"
          inputModalities={[]}
          outputModalities={["text"]}
          disabled={disabled}
        />
      </div>

      {ready ? (
        <RunConfigOverrides conversationId={instanceKey} words={words} />
      ) : null}
    </div>
  );
}

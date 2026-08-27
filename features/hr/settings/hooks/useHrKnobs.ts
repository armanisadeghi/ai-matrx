// features/hr/settings/hooks/useHrKnobs.ts
//
// THE ONE READ BEHIND EVERY D13 PANEL AND BEHIND THE HUB (route 67).
//
// `hr_knob_index` is the AUTHORITY for `effective_value` and `origin` — it applies
// the HR-admin gate and reads `iam.organizations.settings->'hr'`. It does not
// project the six presentation columns that live on `platform.feature_knob`
// (`label`, `description`, `allowed_values`, `min_value`, `max_value`, `unit`,
// `review_due`), and without `allowed_values` an `enum` control degrades into a
// free-text box that can write a value the server will reject. So this hook reads
// the metadata separately — a plain RLS'd read of a table whose read policy is
// `USING (true)` — and merges it in. The VALUE never comes from that read.

"use client";

import { useEffect, useState } from "react";

import { fetchHrKnobs } from "../../service";
import { isHrDenied, type HrDenied, type HrFailed, type HrKnob } from "../../types";
import { fetchHrKnobMetadata, type HrKnobMetadata } from "../service";
import type {
  HrKnobPresentation,
  HrKnobPresentationMap,
  HrPresentedKnob,
} from "../types";

export type HrKnobsValue = {
  /** Every HR key with its effective value, origin, and merged presentation. */
  knobs: HrPresentedKnob[];
  /** True while the FIRST read is in flight. A refresh keeps the last data on screen. */
  isLoading: boolean;
  error: HrDenied | HrFailed | null;
  refresh: () => void;
  /** Keys whose `origin` is `missing` — the hub renders these as hard errors. */
  missing: HrPresentedKnob[];
};

/** Turn `allowed_values` jsonb into select options, when it is a list of scalars. */
function optionsFromAllowedValues(
  allowed: unknown,
): Array<{ value: string; label: string }> | undefined {
  if (!Array.isArray(allowed) || allowed.length === 0) return undefined;
  const options = allowed
    .filter((entry) => typeof entry === "string" || typeof entry === "number")
    .map((entry) => ({ value: String(entry), label: String(entry).replace(/_/g, " ") }));
  return options.length ? options : undefined;
}

function metadataKey(feature: string, key: string): string {
  return `${feature}.${key}`;
}

function present(
  knob: HrKnob,
  metadata: Map<string, HrKnobMetadata>,
  overrides: HrKnobPresentationMap,
): HrPresentedKnob {
  const meta = metadata.get(metadataKey(knob.feature, knob.key));
  const supplied: HrKnobPresentation = overrides[knob.full_key] ?? {};

  const presentation: HrKnobPresentation = {
    // A panel's own sentence wins over the registry's, because a panel knows the
    // context the key is being read in; the registry's description is the fallback,
    // never a second line beside it.
    explain: supplied.explain ?? meta?.description ?? undefined,
    floor: supplied.floor,
    scopes: supplied.scopes,
    options: supplied.options ?? optionsFromAllowedValues(meta?.allowed_values),
  };

  return { ...knob, presentation };
}

/**
 * Read every HR configuration key for one employer.
 *
 * `presentation` lets a panel add what only it knows — the sentence explaining WHY
 * a key exists, a statutory floor with its citation, the scope rungs. It is keyed by
 * `full_key` (`hr.employees.directory_shows_manager`).
 */
export function useHrKnobs(args: {
  organizationId: string | null;
  overriddenOnly?: boolean;
  presentation?: HrKnobPresentationMap;
}): HrKnobsValue {
  const { organizationId, overriddenOnly = false } = args;
  const presentation = args.presentation ?? {};

  // The RAW index and the metadata are what get stored; the merge happens in render
  // so a panel that supplies its own `presentation` sees it immediately instead of
  // waiting for the next fetch.
  const [raw, setRaw] = useState<HrKnob[]>([]);
  const [metadata, setMetadata] = useState<Map<string, HrKnobMetadata>>(
    () => new Map(),
  );
  // 🚨 `isLoading` is DERIVED, not set. A synchronous `setState` in an effect body
  // is a cascading render (and an ESLint error); tracking which employer the state
  // belongs to answers "is this stale?" without one — and it also makes `refresh()`
  // keep the current data on screen instead of flashing a skeleton.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = () => setReloadToken((n) => n + 1);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    (async () => {
      const [indexResult, metadataResult] = await Promise.all([
        fetchHrKnobs({ organizationId, overriddenOnly }),
        fetchHrKnobMetadata(),
      ]);
      if (cancelled) return;

      if (!indexResult.ok) {
        setError(indexResult);
        setLoadedFor(organizationId);
        return;
      }

      // The metadata read failing is NOT fatal: the values and origins are real and
      // the panel is still honest without the labels. It is logged, never swallowed.
      const next = new Map<string, HrKnobMetadata>();
      if (metadataResult.ok) {
        for (const row of metadataResult.data) {
          next.set(metadataKey(row.feature, row.key), row);
        }
      } else {
        console.error(
          "[hr/settings] configuration key descriptions did not load; values and " +
            "origins are unaffected.",
          metadataResult,
        );
      }

      setMetadata(next);
      setRaw(indexResult.data.keys);
      setError(null);
      setLoadedFor(organizationId);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, overriddenOnly, reloadToken]);

  const knobs = organizationId
    ? raw.map((knob) => present(knob, metadata, presentation))
    : [];
  const isLoading = organizationId !== null && loadedFor !== organizationId;

  return {
    knobs,
    isLoading,
    error,
    refresh,
    missing: knobs.filter((knob) => knob.origin === "missing"),
  };
}

/**
 * The keys one panel owns, in registry order.
 *
 * `features` is matched on the FULL feature string (`hr.employees`), `keys` on the
 * bare key. A panel that names neither gets nothing — an accidental "show everything"
 * would put unrelated keys under a heading that lies about what they do.
 */
export function selectHrKnobs(
  knobs: HrPresentedKnob[],
  selector: {
    features?: string[];
    keys?: string[];
    prefixes?: string[];
    /**
     * Keys to hand to a SIBLING panel instead. `hr.time_and_attendance` carries both
     * the rounding rules and the kiosk-device rules; the same key showing on two
     * panels is two places to change one thing, and they will drift.
     */
    excludePrefixes?: string[];
  },
): HrPresentedKnob[] {
  const features = new Set(selector.features ?? []);
  const keys = new Set(selector.keys ?? []);
  const prefixes = selector.prefixes ?? [];
  const excluded = selector.excludePrefixes ?? [];

  return knobs.filter((knob) => {
    if (excluded.some((prefix) => knob.key.startsWith(prefix)) && !keys.has(knob.key)) {
      return false;
    }
    if (features.has(knob.feature)) return true;
    if (keys.has(knob.key)) return true;
    return prefixes.some((prefix) => knob.key.startsWith(prefix));
  });
}

/** True when the two refusal kinds should render the no-access state, not an error. */
export function isHrKnobAccessRefusal(error: HrDenied | HrFailed | null): boolean {
  return error !== null && isHrDenied(error);
}

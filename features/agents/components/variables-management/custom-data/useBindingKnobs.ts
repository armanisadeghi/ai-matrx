"use client";

/**
 * The custom-data binding editor's two limits, read as FEATURE KNOBS
 * (`platform.feature_knob`, feature `agents.variable_binding`; seeded by
 * `migrations/agent_variable_binding_01_knobs.sql`) through the one scoped read,
 * so a platform admin, an organization or a person can change them without a
 * deploy. There is no constant fallback: until the knob answers, the value is
 * `null` and callers wait; a missing knob is an error, never a silent default.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";

const FEATURE = "agents.variable_binding";

export interface BindingKnobs {
  /** Rows a whole-table binding sends until the author changes it. */
  defaultRowLimit: number | null;
  /** Records the record picker reads per page. */
  recordPickerPage: number | null;
  /** The knob read failed, or a knob is not registered. */
  error: string | null;
}

export function useBindingKnobs(organizationId: string | null): BindingKnobs {
  const userId = useAppSelector(selectUserId);
  const { knobs, error, missing, isLoading } = useScopedKnobs({
    organizationId,
    featurePrefix: FEATURE,
    userId: userId ?? undefined,
  });
  const read = (key: string): number | null => {
    const knob = knobs.find((k) => k.feature === FEATURE && k.key === key);
    const v = knob?.effective_value;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  const defaultRowLimit = read("default_row_limit");
  const recordPickerPage = read("record_picker_page");
  const unregistered =
    !isLoading &&
    !error &&
    (missing.length > 0 ||
      defaultRowLimit === null ||
      recordPickerPage === null);
  return {
    defaultRowLimit,
    recordPickerPage,
    error: error ?? (unregistered ? "Row limit settings are missing" : null),
  };
}

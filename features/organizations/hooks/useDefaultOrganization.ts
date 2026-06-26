// features/organizations/hooks/useDefaultOrganization.ts
//
// Canonical accessor for the user's DEFAULT active organization preference.
// This is the single durable, cross-device source of truth for "which org am
// I in by default" — read at startup by the active-org bootstrap to auto-select
// an org (so the user is never left without one and never re-prompted), and
// read/written by the org pickers (HeaderOrgReminder popover + UserMenuOrgSection)
// behind a "Set as my default organization" switch.
//
// Persistence is handled by the userPreferences sync engine: dispatching
// `setPreference` broadcasts + debounce-upserts the whole preferences blob to
// the `user_preferences` table. No manual Supabase write here — mirrors the
// favorites/usePinned dual-write-via-slice pattern.

"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectDefaultOrganizationId } from "@/lib/redux/preferences/userPreferenceSelectors";

export interface UseDefaultOrganizationResult {
  /** The user's default org id, or null if none chosen yet. */
  defaultOrganizationId: string | null;
  /** True when `id` is the user's current default org. */
  isDefault: (id: string | null | undefined) => boolean;
  /** Persist `id` as the default org (or null to clear). */
  setDefaultOrganization: (id: string | null) => void;
  /** Clear the default org entirely. */
  clearDefaultOrganization: () => void;
}

export function useDefaultOrganization(): UseDefaultOrganizationResult {
  const dispatch = useAppDispatch();
  const defaultOrganizationId = useAppSelector(selectDefaultOrganizationId);

  const setDefaultOrganization = (id: string | null) => {
    dispatch(
      setPreference({
        module: "organization",
        preference: "defaultOrganizationId",
        value: id,
      }),
    );
  };

  return {
    defaultOrganizationId,
    isDefault: (id) => !!id && id === defaultOrganizationId,
    setDefaultOrganization,
    clearDefaultOrganization: () => setDefaultOrganization(null),
  };
}

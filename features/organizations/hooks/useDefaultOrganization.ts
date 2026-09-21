// features/organizations/hooks/useDefaultOrganization.ts
//
// Canonical accessor for the STAR a person puts on one of their organizations.
//
// 🚨 IT DOES NOT SELECT AN ORGANIZATION, AND THIS COMMENT USED TO SAY IT DID.
// Until 2026-09-21 the lines here read "the single durable, cross-device source
// of truth for which org am I in by default — read at startup by the active-org
// bootstrap to auto-select an org (so the user is never left without one and
// never re-prompted)". That stopped being true on 2026-09-19, when Arman
// deleted the default-org rung from `lib/organizations/resolveActiveOrgContext`
// — "a default organization is at most a per-client DISPLAY preference; the org
// picker may show it and nothing else may read it" — and nothing here changed.
// Crew D2 then spent 2026-09-21 chasing a persistence bug that was a sentence:
// the selection gone on a fresh browser profile "despite a 'Set as my default'
// toggle implying it should stick".
//
// What it IS: a durable, cross-device preference that the ORG PICKER reads and
// nothing else may — it draws that organization first in the list and stars it.
// Which organization you are working in is restored from this device's own
// remembered choice (the apex `matrx-active-org` cookie, written only when the
// person themselves selected one), and on a machine that has never had one, the
// person picks. Written by the pickers (HeaderChooseOrgButton popover +
// UserMenuOrgSection) behind the "Keep it at the top" switch.
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

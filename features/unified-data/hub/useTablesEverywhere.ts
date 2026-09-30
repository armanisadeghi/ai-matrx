"use client";

// features/unified-data/hub/useTablesEverywhere.ts — LANE ORG-FILTER-CLASS
//
// THE ONE LIST OF TABLES A PERSON CAN SEE, FOR EVERY SURFACE THAT LISTS THEM, AND THE ONE
// ORGANIZATION FILTER IN FRONT OF IT.
//
// THE DEFECT THIS CLOSES (Arman, 2026-09-30): the agent builder's "Fill automatically → From my
// data" table picker listed `client.tableList()` of a records provider bound to the ACTIVE
// organization — one organization's tables, silently — while the data home (/data-v2) lists every
// table the person can see across all her organizations. "The two lists aren't identical." The
// active organization is a filter only, never a silent scope (access is personal).
//
// THE LIST is `custom.data_home_tables(p_organization_id)` — the data home's own door (lane
// DATA-HOME-1/2): every Table the person may open in every organization she can reach, a Table
// shared with her from an organization she is not in included, each row naming its organization,
// its kind, and whether the app keeps it for itself. `organizationId` null = All Orgs.
//
// THE FILTER is the data home's own saved pick (`userPreferences.lists.dataHomeOrganizationId`,
// per person, every device) → the Feature Knob `custom.data_home_default_organization` → All
// Orgs. ONE pick for "which organization's data am I looking at": the data home and every picker
// that lists tables show the same rows for the same person, by construction. Switching the active
// organization never moves it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectDataHomeOrganizationPick,
  selectPreferencesLoadStatus,
} from "@/lib/redux/preferences/userPreferenceSelectors";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { createClient } from "@/utils/supabase/client";

import { ALL_ORGANIZATIONS, DATA_HOME_DEFAULT_ORGANIZATION_KNOB, resolveDataHomeOrganization } from "./dataHomeScope";
import { dataHomeTables, type DataHomeTableRow, type DoorFailure } from "./doors";

// ONE data seam, built lazily (a fresh seam per render would rebuild its client every render).
let seam: ReturnType<typeof recordsDataSource> | null = null;
function sharedSeam() {
  seam ??= recordsDataSource(createClient());
  return seam;
}

export interface OrganizationChoice {
  id: string;
  name: string;
}

export interface DataOrganizationFilter {
  /** `"all"` (All Orgs) or one organization id the person belongs to. */
  organizationFilter: string;
  /** The organization to hand a door: null under All Orgs. */
  organizationId: string | null;
  /** Every organization the person belongs to, by name — the dropdown's options after All Orgs. */
  choices: OrganizationChoice[];
  /** False until the saved pick and the memberships are read: which organization is shown is not known yet. */
  ready: boolean;
  /** Save the pick to the person's account; it is the data home's pick too. */
  choose: (next: string) => void;
}

/** The person's organization filter for their data — the data home's, shared by every table list. */
export function useDataOrganizationFilter(): DataOrganizationFilter {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const savedPick = useAppSelector(selectDataHomeOrganizationPick);
  const preferencesLoad = useAppSelector(selectPreferencesLoadStatus);
  const { organizations, loading } = useUserOrganizations();
  // The knob is platform-only (no organization or user rung), so no organization is asked here.
  const knob = useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_ORGANIZATION_KNOB);
  const organizationFilter = resolveDataHomeOrganization(
    null,
    savedPick,
    knob,
    loading ? null : organizations.map((org) => org.id),
  );
  const choices = useMemo(
    () =>
      [...organizations].map((org) => ({ id: org.id, name: org.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [organizations],
  );
  const choose = useCallback(
    (next: string) => {
      dispatch(setModulePreferences({ module: "lists", preferences: { dataHomeOrganizationId: next } }));
    },
    [dispatch],
  );
  return {
    organizationFilter,
    organizationId: organizationFilter === ALL_ORGANIZATIONS ? null : organizationFilter,
    choices,
    ready: preferencesLoad !== "loading" && (organizationFilter === ALL_ORGANIZATIONS || !loading),
    choose,
  };
}

export interface TablesEverywhere {
  loading: boolean;
  error: DoorFailure | null;
  rows: DataHomeTableRow[];
  reload: () => void;
}

/**
 * Every table the person can see — in every organization (`organizationId` null) or in the one
 * named — as `custom.data_home_tables` answers it. `enabled` false holds the call (the filter is
 * still being read), so a moment of the wrong list is never shown.
 */
export function useTablesEverywhere(organizationId: string | null, enabled = true): TablesEverywhere {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string | null; rows: DataHomeTableRow[]; error: DoorFailure | null }>({
    key: null,
    rows: [],
    error: null,
  });
  const key = enabled ? `${organizationId ?? ALL_ORGANIZATIONS}:${attempt}` : null;

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    void dataHomeTables(sharedSeam(), organizationId).then((answered) => {
      if (!alive) return;
      setState(
        answered.ok
          ? { key, rows: [...answered.data].sort((a, b) => a.table_name.localeCompare(b.table_name)), error: null }
          : { key, rows: [], error: answered.error },
      );
    });
    return () => {
      alive = false;
    };
  }, [key, organizationId]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { loading: key === null || state.key !== key, error: state.key === key ? state.error : null, rows: state.key === key ? state.rows : [], reload };
}

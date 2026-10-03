"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { archiveOrganization as archiveOrganizationDoor } from "@/features/organizations/service/organizationArchive";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { requireUserId } from "@/utils/auth/getUserId";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import type { NavOrganization } from "./hierarchySlice";
import { getUserOrganizations } from "@/features/organizations/service";
import type { OrganizationWithRole } from "@/features/organizations/types";
import type { OrganizationArchiveFilter } from "@/features/organizations/service/organizationArchive";

// ─── Data level system ─────────────────────────────────────────────────────

export type DataLevel = "thin-list" | "full-data";

export interface DataLevelMeta {
  level: DataLevel;
  fetchedAt: number;
}

const STALE_MS: Record<DataLevel, number> = {
  "thin-list": 2 * 60 * 1000, // 2 minutes
  "full-data": 10 * 60 * 1000, // 10 minutes
};

export function isStale(meta: DataLevelMeta): boolean {
  return Date.now() - meta.fetchedAt > STALE_MS[meta.level];
}

// ─── Entity shape ──────────────────────────────────────────────────────────

export interface OrgRecord {
  id: string;
  name: string;
  abbreviation?: string;
  slug: string;
  role: string;
  // full-data only:
  description?: string | null;
  logo_url?: string | null;
  settings?: Record<string, unknown> | null;
  created_at?: string | null;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

const orgsAdapter = createEntityAdapter<OrgRecord>();

/**
 * The signed-in person's organizations with their role and member count
 * (`useUserOrganizations`), read ONCE per person per archive filter per tab,
 * keyed `${userId}:${archiveFilter}`. A woken or remounted screen (a note's
 * organization field, a list's scope switcher) renders this; a membership
 * change made here marks every list `stale` and the views on screen re-read.
 */
export interface MemberOrganizationsEntry {
  organizations: OrganizationWithRole[] | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
}

interface OrgsExtraState {
  meta: Record<string, DataLevelMeta>;
  loading: boolean;
  error: string | null;
  memberLists: Record<string, MemberOrganizationsEntry>;
}

const initialState = orgsAdapter.getInitialState<OrgsExtraState>({
  meta: {},
  loading: false,
  error: null,
  memberLists: {},
});

export function memberOrganizationsKey(userId: string, archiveFilter: OrganizationArchiveFilter): string {
  return `${userId}:${archiveFilter}`;
}

// ─── Thunks ────────────────────────────────────────────────────────────────

/** Outcome of a single-organization read; `missing` is an answer, not a fault. */
export type FetchOrgResult =
  | { status: "skipped" }
  | { status: "missing"; id: string }
  | { status: "loaded"; org: OrgRecord };

/**
 * Fetch a single org at "full-data" level.
 * Skips if the org already has full data that is not stale.
 */
export const fetchOrg = createAsyncThunk<FetchOrgResult, string>(
  "organizations/fetchOne",
  async (orgId, { getState }) => {
    const state = getState() as StateWithOrgs;
    const meta = state.organizations.meta[orgId];
    if (meta && meta.level === "full-data" && !isStale(meta)) {
      return { status: "skipped" }; // already fresh full-data
    }

    const { data, error } = await supabase
      .schema("iam").from("organizations")
      .select(
        "id, name, abbreviation, slug, description, logo_url, settings, created_at",
      )
      .eq("id", orgId)
      // An archived / unseen / unknown organization is a legitimate miss,
      // never a 406 PGRST116 capture (same class as fetchTask).
      .maybeSingle();
    if (error) throw error;
    if (!data) return { status: "missing", id: orgId };

    // Also get the user's role in this org — canonical membership read.
    requireUserId();
    const membersResult = await membershipsService.forUser("organization");
    const role = membersResult.ok
      ? (membersResult.data.memberships.find((m) => m.containerId === orgId)
          ?.role ?? "member")
      : "member";

    return {
      status: "loaded",
      org: {
        ...(data as Omit<OrgRecord, "role">),
        role,
      } as OrgRecord,
    };
  },
);

/** Read the person's organizations into `memberLists` (once, unless `force` or stale). */
export const loadMemberOrganizations = createAsyncThunk<
  { key: string; organizations: OrganizationWithRole[] },
  { userId: string; archiveFilter: OrganizationArchiveFilter; force?: boolean },
  { state: StateWithOrgs }
>(
  "organizations/loadMemberLists",
  async ({ userId, archiveFilter }) => ({
    key: memberOrganizationsKey(userId, archiveFilter),
    organizations: await getUserOrganizations(archiveFilter),
  }),
  {
    condition: ({ userId, archiveFilter, force }, { getState }) => {
      const entry = getState().organizations.memberLists[memberOrganizationsKey(userId, archiveFilter)];
      if (!entry) return true;
      if (entry.loading) return false;
      return Boolean(force) || entry.stale;
    },
  },
);

export const updateOrg = createAsyncThunk(
  "organizations/update",
  async (params: {
    id: string;
    patch: { name?: string; description?: string };
  }) => {
    // THROUGH THE DOOR. `iam` is not a client-writable schema (DOORS-ONLY-3), and this
    // thunk used to pass `patch` through UNFILTERED to a base-table update.
    const { error } = await supabase.rpc("org_update", {
      p_org_id: params.id,
      p_patch: params.patch as never,
    });
    if (error) throw error;
    return params;
  },
);

/**
 * AN ORGANIZATION IS ARCHIVED, NEVER DELETED (owner ruling 2026-09-20).
 *
 * This thunk used to hard-delete every project in the organization and then the
 * organization row. It could not succeed — 717 foreign keys point at
 * `iam.organizations` — but it destroyed the projects on the way to failing.
 * Archiving closes the organization for everyone in ONE place (`iam.my_orgs()`)
 * and touches not one row inside it; `iam.organization_archive` wants the
 * organization's name typed back, so `confirmName` is the person's own typing.
 */
export const archiveOrg = createAsyncThunk(
  "organizations/archive",
  async (params: { orgId: string; confirmName: string; reason?: string }) => {
    await archiveOrganizationDoor(
      params.orgId,
      params.confirmName,
      params.reason ?? null,
    );
    return params.orgId;
  },
);

// ─── Slice ─────────────────────────────────────────────────────────────────

const organizationsSlice = createSlice({
  name: "organizations",
  initialState,
  reducers: {
    /**
     * Bulk-upsert orgs at "thin-list" level from get_user_full_context.
     * Called by hierarchyThunks after a successful full-context fetch.
     */
    hydrateOrgsFromContext(state, action: PayloadAction<NavOrganization[]>) {
      const now = Date.now();
      const records: OrgRecord[] = action.payload.map((org) => ({
        id: org.id,
        name: org.name,
        abbreviation: org.abbreviation,
        slug: org.slug,
        role: org.role,
      }));
      orgsAdapter.upsertMany(state, records);
      for (const org of action.payload) {
        // Only downgrade from full-data if it was already stale; otherwise preserve level
        const existing = state.meta[org.id];
        if (!existing || existing.level === "thin-list" || isStale(existing)) {
          state.meta[org.id] = { level: "thin-list", fetchedAt: now };
        }
      }
    },

    /**
     * Single upsert with explicit level — used after CRUD mutations.
     */
    upsertOrgWithLevel(
      state,
      action: PayloadAction<{ record: OrgRecord; level: DataLevel }>,
    ) {
      orgsAdapter.upsertOne(state, action.payload.record);
      state.meta[action.payload.record.id] = {
        level: action.payload.level,
        fetchedAt: Date.now(),
      };
    },

    /**
     * Synchronously remove an org from the slice.
     * Use after a successful DB delete to update local state immediately.
     */
    removeOrgFromSlice(state, action: PayloadAction<string>) {
      orgsAdapter.removeOne(state, action.payload);
      delete state.meta[action.payload];
    },

    /** A membership changed here (created, joined, left, renamed, a role or member moved). */
    memberOrganizationsInvalidated(state) {
      for (const entry of Object.values(state.memberLists)) entry.stale = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMemberOrganizations.pending, (state, action) => {
        const key = memberOrganizationsKey(action.meta.arg.userId, action.meta.arg.archiveFilter);
        const entry = state.memberLists[key];
        if (entry) {
          entry.loading = true;
          entry.stale = false;
        } else {
          state.memberLists[key] = { organizations: null, loading: true, error: null, stale: false };
        }
      })
      .addCase(loadMemberOrganizations.fulfilled, (state, action) => {
        const entry = state.memberLists[action.payload.key];
        state.memberLists[action.payload.key] = {
          organizations: action.payload.organizations,
          loading: false,
          error: null,
          stale: entry?.stale ?? false,
        };
      })
      .addCase(loadMemberOrganizations.rejected, (state, action) => {
        const key = memberOrganizationsKey(action.meta.arg.userId, action.meta.arg.archiveFilter);
        const entry = state.memberLists[key];
        state.memberLists[key] = {
          organizations: entry?.organizations ?? null,
          loading: false,
          error: action.error.message ?? "Failed to fetch organizations",
          stale: entry?.stale ?? false,
        };
      })
      .addCase(fetchOrg.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrg.fulfilled, (state, action) => {
        state.loading = false;
        const result = action.payload;
        if (result.status === "skipped") return;
        if (result.status === "missing") {
          // The server no longer returns it — a cached thin row is stale.
          orgsAdapter.removeOne(state, result.id);
          delete state.meta[result.id];
          return;
        }
        orgsAdapter.upsertOne(state, result.org);
        state.meta[result.org.id] = {
          level: "full-data",
          fetchedAt: Date.now(),
        };
      })
      .addCase(fetchOrg.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch organization";
      })
      .addCase(updateOrg.fulfilled, (state, action) => {
        orgsAdapter.updateOne(state, {
          id: action.payload.id,
          changes: action.payload.patch,
        });
        for (const entry of Object.values(state.memberLists)) entry.stale = true;
      })
      .addCase(archiveOrg.fulfilled, (state, action) => {
        orgsAdapter.removeOne(state, action.payload);
        delete state.meta[action.payload];
        for (const entry of Object.values(state.memberLists)) entry.stale = true;
      });
  },
});

export const {
  hydrateOrgsFromContext,
  upsertOrgWithLevel,
  removeOrgFromSlice,
  memberOrganizationsInvalidated,
} = organizationsSlice.actions;

export default organizationsSlice.reducer;

// ─── Selectors ─────────────────────────────────────────────────────────────

type StateWithOrgs = {
  organizations: ReturnType<typeof organizationsSlice.reducer>;
};

const adapterSelectors = orgsAdapter.getSelectors(
  (state: StateWithOrgs) => state.organizations,
);

export const selectAllOrgs = adapterSelectors.selectAll;
export const selectOrgById = adapterSelectors.selectById;
export const selectOrgIds = adapterSelectors.selectIds;

export const selectOrgsLoading = (state: StateWithOrgs) =>
  state.organizations.loading;
export const selectOrgsError = (state: StateWithOrgs) =>
  state.organizations.error;

export const selectOrgDataLevel = createSelector(
  [
    (state: StateWithOrgs) => state.organizations.meta,
    (_state: StateWithOrgs, orgId: string) => orgId,
  ],
  (meta, orgId): DataLevelMeta | null => meta[orgId] ?? null,
);

export const selectOrgIsFullData = createSelector(
  [
    (state: StateWithOrgs) => state.organizations.meta,
    (_state: StateWithOrgs, orgId: string) => orgId,
  ],
  (meta, orgId): boolean => {
    const m = meta[orgId];
    return !!m && m.level === "full-data" && !isStale(m);
  },
);


/** Resolve a route segment (UUID or slug) to an organization record. */
export const selectOrgBySlugOrId = createSelector(
  [selectAllOrgs, (_state: StateWithOrgs, slugOrId: string) => slugOrId],
  (orgs, slugOrId) =>
    orgs.find((o) => o.id === slugOrId || o.slug === slugOrId),
);

export const selectMemberOrganizations = createSelector(
  [
    (state: StateWithOrgs) => state.organizations.memberLists,
    (_state: StateWithOrgs, key: string) => key,
  ],
  (lists, key): MemberOrganizationsEntry | undefined => lists[key],
);

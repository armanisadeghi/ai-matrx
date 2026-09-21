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
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId } from "@/utils/auth/getUserId";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import type { NavOrganization } from "./hierarchySlice";

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
  // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
  is_personal: boolean;
  role: string;
  // full-data only:
  description?: string | null;
  logo_url?: string | null;
  settings?: Record<string, unknown> | null;
  created_at?: string | null;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

const orgsAdapter = createEntityAdapter<OrgRecord>();

interface OrgsExtraState {
  meta: Record<string, DataLevelMeta>;
  loading: boolean;
  error: string | null;
}

const initialState = orgsAdapter.getInitialState<OrgsExtraState>({
  meta: {},
  loading: false,
  error: null,
});

// ─── Thunks ────────────────────────────────────────────────────────────────

/**
 * Fetch a single org at "full-data" level.
 * Skips if the org already has full data that is not stale.
 */
export const fetchOrg = createAsyncThunk(
  "organizations/fetchOne",
  async (orgId: string, { getState }) => {
    const state = getState() as StateWithOrgs;
    const meta = state.organizations.meta[orgId];
    if (meta && meta.level === "full-data" && !isStale(meta)) {
      return null; // already fresh full-data
    }

    const { data, error } = await supabase
      .schema("iam").from("organizations")
      .select(
        "id, name, abbreviation, slug, description, logo_url, is_personal, settings, created_at",
      )
      .eq("id", orgId)
      .single();
    if (error) throw error;

    // Also get the user's role in this org — canonical membership read.
    requireUserId();
    const membersResult = await membershipsService.forUser("organization");
    const role = membersResult.ok
      ? (membersResult.data.memberships.find((m) => m.containerId === orgId)
          ?.role ?? "member")
      : "member";

    return {
      ...(data as Omit<OrgRecord, "role">),
      role,
    } as OrgRecord;
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
        is_personal: org.is_personal,
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrg.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrg.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return; // skipped (already fresh)
        orgsAdapter.upsertOne(state, action.payload);
        state.meta[action.payload.id] = {
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
      })
      .addCase(archiveOrg.fulfilled, (state, action) => {
        orgsAdapter.removeOne(state, action.payload);
        delete state.meta[action.payload];
      });
  },
});

export const {
  hydrateOrgsFromContext,
  upsertOrgWithLevel,
  removeOrgFromSlice,
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

export const selectPersonalOrg = createSelector(
  [selectAllOrgs],
  (orgs) => orgs.find((o) => o.is_personal) ?? null,
);

/** Resolve a route segment (UUID or slug) to an organization record. */
export const selectOrgBySlugOrId = createSelector(
  [selectAllOrgs, (_state: StateWithOrgs, slugOrId: string) => slugOrId],
  (orgs, slugOrId) =>
    orgs.find((o) => o.id === slugOrId || o.slug === slugOrId),
);

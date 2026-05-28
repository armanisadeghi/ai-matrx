/**
 * features/skills/redux/skillsSlice.ts
 *
 * Single source of truth for skills + categories + ingest state on the
 * frontend. Replaces the read-only Supabase-backed slice that used to
 * live at `features/agent-connections/redux/skl/`. All reads + writes go
 * through `/api/skills` (the Python backend).
 *
 * State shape:
 *   skills:
 *     byId        — normalized SkillRow by uuid
 *     allIds      — insertion order
 *     status      — last load status (idle | loading | ready | error)
 *     error       — last error message
 *     activeId    — currently-open skill in the detail editor
 *     lastIngestAt — bumped by the RESOURCE_CHANGED stream listener; the
 *                    useSkills hook subscribes and reloads on change.
 *
 *   categories:
 *     byId / allIds / status / error  — same shape as skills
 *
 *   ingest:
 *     lastReport  — last IngestReport (dry-run or apply); cleared on reset
 *     status / error — last-call status
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type {
  AsyncStatus,
  CategoryRow,
  IngestReport,
  ResourceRow,
  SkillRow,
} from "../types";

function indexById<T extends { id: string }>(
  rows: T[],
): { byId: Record<string, T>; allIds: string[] } {
  const byId: Record<string, T> = {};
  const allIds: string[] = [];
  for (const row of rows) {
    byId[row.id] = row;
    allIds.push(row.id);
  }
  return { byId, allIds };
}

export interface SkillsState {
  skills: {
    byId: Record<string, SkillRow>;
    allIds: string[];
    status: AsyncStatus;
    error: string | null;
    activeId: string | null;
    /** Wall-clock millis when the last `skills.ingested` event landed. The
     * useSkills hook compares this to its own last-seen value to decide
     * whether to refetch + toast. */
    lastIngestAt: number;
  };
  categories: {
    byId: Record<string, CategoryRow>;
    allIds: string[];
    status: AsyncStatus;
    error: string | null;
  };
  ingest: {
    lastReport: IngestReport | null;
    status: AsyncStatus;
    error: string | null;
  };
  /** Resources are loaded lazily per-skill, so the slot is keyed by
   * skillId. `bySkillId[skillId]` is the ordered list of resources
   * for that skill (sorted by sort_order asc); `statusBySkillId`
   * tracks the per-skill fetch status independently. */
  resources: {
    bySkillId: Record<string, ResourceRow[]>;
    statusBySkillId: Record<string, AsyncStatus>;
    errorBySkillId: Record<string, string | null>;
  };
}

const initialState: SkillsState = {
  skills: {
    byId: {},
    allIds: [],
    status: "idle",
    error: null,
    activeId: null,
    lastIngestAt: 0,
  },
  categories: {
    byId: {},
    allIds: [],
    status: "idle",
    error: null,
  },
  ingest: {
    lastReport: null,
    status: "idle",
    error: null,
  },
  resources: {
    bySkillId: {},
    statusBySkillId: {},
    errorBySkillId: {},
  },
};

/** Payload of the stream-bus signal — see process-stream.ts case for
 * `resource_changed` events with kind=skills.* */
export interface SkillStreamEventPayload {
  kind: string; // "skills.ingested" | "skill.created" | "skill.modified" | "skill.deleted"
  action: "created" | "modified" | "deleted" | "invalidated";
  resourceId: string;
  metadata: Record<string, unknown>;
}

const slice = createSlice({
  name: "skills",
  initialState,
  reducers: {
    // ── Skills ──────────────────────────────────────────────────────────────
    skillsLoading(state) {
      state.skills.status = "loading";
      state.skills.error = null;
    },
    skillsReceived(state, action: PayloadAction<SkillRow[]>) {
      const { byId, allIds } = indexById(action.payload);
      state.skills.byId = byId;
      state.skills.allIds = allIds;
      state.skills.status = "ready";
      state.skills.error = null;
    },
    skillsError(state, action: PayloadAction<string>) {
      state.skills.status = "error";
      state.skills.error = action.payload;
    },
    skillUpserted(state, action: PayloadAction<SkillRow>) {
      const row = action.payload;
      if (!state.skills.byId[row.id]) {
        state.skills.allIds.push(row.id);
      }
      state.skills.byId[row.id] = row;
    },
    skillRemoved(state, action: PayloadAction<string>) {
      delete state.skills.byId[action.payload];
      state.skills.allIds = state.skills.allIds.filter(
        (id) => id !== action.payload,
      );
      if (state.skills.activeId === action.payload) {
        state.skills.activeId = null;
      }
    },
    setActiveSkillId(state, action: PayloadAction<string | null>) {
      state.skills.activeId = action.payload;
    },

    // ── Categories ──────────────────────────────────────────────────────────
    categoriesLoading(state) {
      state.categories.status = "loading";
      state.categories.error = null;
    },
    categoriesReceived(state, action: PayloadAction<CategoryRow[]>) {
      const { byId, allIds } = indexById(action.payload);
      state.categories.byId = byId;
      state.categories.allIds = allIds;
      state.categories.status = "ready";
      state.categories.error = null;
    },
    categoriesError(state, action: PayloadAction<string>) {
      state.categories.status = "error";
      state.categories.error = action.payload;
    },
    categoryUpserted(state, action: PayloadAction<CategoryRow>) {
      const row = action.payload;
      if (!state.categories.byId[row.id]) {
        state.categories.allIds.push(row.id);
      }
      state.categories.byId[row.id] = row;
    },
    categoryRemoved(state, action: PayloadAction<string>) {
      delete state.categories.byId[action.payload];
      state.categories.allIds = state.categories.allIds.filter(
        (id) => id !== action.payload,
      );
    },

    /** Bulk-reorder siblings under a parent. The reparent thunk dispatches
     * this after the per-row sort_order updates so the slice's perceived
     * order is consistent even if individual writes raced. */
    categoriesReordered(
      state,
      action: PayloadAction<{
        parentId: string | null;
        orderedIds: string[];
      }>,
    ) {
      const { parentId, orderedIds } = action.payload;
      orderedIds.forEach((id, idx) => {
        const row = state.categories.byId[id];
        if (!row) return;
        row.sortOrder = idx;
        row.parentCategoryId = parentId;
      });
    },

    // ── Skill ↔ Project association (mutates the projectIds slot in place) ─
    skillProjectsUpdated(
      state,
      action: PayloadAction<{ skillId: string; projectIds: string[] }>,
    ) {
      const { skillId, projectIds } = action.payload;
      const row = state.skills.byId[skillId];
      if (row) {
        row.projectIds = projectIds;
      }
    },

    // ── Ingest ──────────────────────────────────────────────────────────────
    ingestLoading(state) {
      state.ingest.status = "loading";
      state.ingest.error = null;
    },
    ingestReceived(state, action: PayloadAction<IngestReport>) {
      state.ingest.lastReport = action.payload;
      state.ingest.status = "ready";
      state.ingest.error = null;
    },
    ingestError(state, action: PayloadAction<string>) {
      state.ingest.status = "error";
      state.ingest.error = action.payload;
    },
    ingestCleared(state) {
      state.ingest.lastReport = null;
      state.ingest.status = "idle";
      state.ingest.error = null;
    },

    // ── Stream event from the central process-stream pump ──────────────────
    /** Called by the stream-event handler when a `resource_changed` event
     * with `kind` starting in "skills." or "skill." arrives. The hook
     * subscribes to `lastIngestAt` and reacts (refetch + toast).
     *
     * We intentionally don't mutate the byId map here — the hook owns the
     * effect, and refetching gives us authoritative state. */
    streamEventReceived(state, action: PayloadAction<SkillStreamEventPayload>) {
      state.skills.lastIngestAt = Date.now();
      // Stash the latest event metadata so the hook can use it for the toast.
      // We piggy-back on the ingest slot since the shape lines up; the hook
      // reads it just-in-time and clears it on consume.
      if (action.payload.kind === "skills.ingested") {
        const md = action.payload.metadata ?? {};
        const created = Number(md.created ?? 0) || 0;
        const updated = Number(md.updated ?? 0) || 0;
        const unchanged = Number(md.unchanged ?? 0) || 0;
        const roots = Array.isArray(md.roots) ? (md.roots as string[]) : [];
        state.ingest.lastReport = {
          parsed: created + updated + unchanged,
          created,
          updated,
          unchanged,
          errors: [],
          skills: [],
          roots,
        };
      }
    },

    // ── Resources ───────────────────────────────────────────────────────────
    resourcesLoading(state, action: PayloadAction<{ skillId: string }>) {
      state.resources.statusBySkillId[action.payload.skillId] = "loading";
      state.resources.errorBySkillId[action.payload.skillId] = null;
    },
    resourcesReceived(
      state,
      action: PayloadAction<{ skillId: string; rows: ResourceRow[] }>,
    ) {
      const { skillId, rows } = action.payload;
      state.resources.bySkillId[skillId] = [...rows].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );
      state.resources.statusBySkillId[skillId] = "ready";
      state.resources.errorBySkillId[skillId] = null;
    },
    resourcesError(
      state,
      action: PayloadAction<{ skillId: string; error: string }>,
    ) {
      state.resources.statusBySkillId[action.payload.skillId] = "error";
      state.resources.errorBySkillId[action.payload.skillId] = action.payload.error;
    },
    resourceUpserted(state, action: PayloadAction<ResourceRow>) {
      const row = action.payload;
      const list = state.resources.bySkillId[row.skillId] ?? [];
      const idx = list.findIndex((r) => r.id === row.id);
      if (idx === -1) {
        list.push(row);
      } else {
        list[idx] = row;
      }
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      state.resources.bySkillId[row.skillId] = list;
    },
    resourceRemoved(
      state,
      action: PayloadAction<{ skillId: string; resourceId: string }>,
    ) {
      const { skillId, resourceId } = action.payload;
      const list = state.resources.bySkillId[skillId] ?? [];
      state.resources.bySkillId[skillId] = list.filter(
        (r) => r.id !== resourceId,
      );
    },
    resourcesReordered(
      state,
      action: PayloadAction<{ skillId: string; orderedIds: string[] }>,
    ) {
      const { skillId, orderedIds } = action.payload;
      const list = state.resources.bySkillId[skillId] ?? [];
      const indexMap = new Map(orderedIds.map((id, idx) => [id, idx]));
      for (const row of list) {
        const idx = indexMap.get(row.id);
        if (idx !== undefined) row.sortOrder = idx;
      }
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      state.resources.bySkillId[skillId] = list;
    },

    // ── Cross-cutting reset (matches the agent-connections scope-change hook) ─
    resetSkills() {
      return initialState;
    },
  },
});

export const skillsActions = slice.actions;
export const skillsReducer = slice.reducer;

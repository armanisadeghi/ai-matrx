/**
 * features/skills/redux/skillsSlice.ts
 *
 * The Redux BINDING over the skill catalog. The skill list rows, the
 * categories and the stream signal are held by `createSkillCatalog`
 * (`@ai-matrx/agents/skills`, wired in `lib/skills/skillCatalog.ts`) and
 * mirrored here by `catalogSynced`, so selectors, the chat `loadedSkills`
 * slot and the editors keep reading Redux. The slice itself owns only what
 * the catalog does not: the open skill (`activeId`), the ingest report from
 * the editors' ingest action, and per-skill resources.
 * Never write `skills` / `categories` here directly — go through the catalog.
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

import type { SkillCatalogState } from "@ai-matrx/agents/skills";
import type {
  AsyncStatus,
  CategoryRow,
  IngestReport,
  ResourceRow,
  SkillRow,
} from "../types";

export type { SkillStreamEventPayload } from "@ai-matrx/agents/skills";

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
    /** Filter key (`skillsListKey`) of the list in `allIds` — a mount with the
     * same key reuses it instead of reading again (read once per tab). */
    loadedKey: string | null;
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
    loadedKey: null,
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

const slice = createSlice({
  name: "skills",
  initialState,
  reducers: {
    // ── Mirror of the catalog (the one holder of skills + categories) ───────
    catalogSynced(state, action: PayloadAction<SkillCatalogState>) {
      const c = action.payload;
      state.skills.byId = c.skills.byId;
      state.skills.allIds = c.skills.allIds;
      state.skills.status = c.skills.status;
      state.skills.error = c.skills.error;
      state.skills.loadedKey = c.skills.loadedKey;
      state.categories.byId = c.categories.byId;
      state.categories.allIds = c.categories.allIds;
      state.categories.status = c.categories.status;
      state.categories.error = c.categories.error;
      if (c.lastIngestAt !== state.skills.lastIngestAt) {
        state.skills.lastIngestAt = c.lastIngestAt;
        // A `skills.ingested` stream event carries the ingest counts.
        if (c.lastStreamReport) state.ingest.lastReport = c.lastStreamReport;
      }
    },
    setActiveSkillId(state, action: PayloadAction<string | null>) {
      state.skills.activeId = action.payload;
    },
    /** A skill was deleted: close it if it is the open one (the row itself leaves via the catalog). */
    skillRemoved(state, action: PayloadAction<string>) {
      if (state.skills.activeId === action.payload) {
        state.skills.activeId = null;
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

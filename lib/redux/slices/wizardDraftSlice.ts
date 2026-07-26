// lib/redux/slices/wizardDraftSlice.ts
//
// GENERIC persisted wizard-draft primitive (platform-not-artifact doctrine).
//
// Any multi-step wizard/form whose in-progress input should survive a refresh,
// an idle session, or step navigation stores its draft here, keyed by a stable
// `wizardId` (e.g. "research-init"). This is deliberately NOT feature-specific
// — do not fork a per-feature draft slice; register a new wizardId instead.
//
// Persistence: the unified sync engine (`wizardDraftPolicy`, preset
// "warm-cache" → IDB with localStorage fallback, debounced writes, cross-tab
// broadcast). No remote — drafts are device-local working state, not durable
// user data.
//
// Contract:
//   - `patchWizardDraft` shallow-merges fields into the draft (create-if-missing).
//   - `clearWizardDraft` deletes the draft — call it on successful completion
//     of the wizard so stale drafts never resurrect finished work.
//   - Drafts older than DRAFT_TTL_MS are pruned at rehydrate; an abandoned
//     draft cannot haunt the wizard forever.
//   - Values must be JSON-serializable (they cross IDB + BroadcastChannel).
//
// First consumer: the Research init wizard
// (features/research/components/init/ResearchInitForm.tsx).

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";

/** Drafts older than this are pruned on rehydrate (7 days). */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface WizardDraftEntry {
  /** Epoch ms of the last patch — drives TTL pruning. */
  updatedAt: number;
  /** The wizard's own field bag. JSON-serializable values only. */
  data: Record<string, unknown>;
}

export interface WizardDraftState {
  drafts: Record<string, WizardDraftEntry>;
}

const initialState: WizardDraftState = { drafts: {} };

function pruneExpired(
  drafts: Record<string, WizardDraftEntry>,
  now: number,
): Record<string, WizardDraftEntry> {
  const out: Record<string, WizardDraftEntry> = {};
  for (const [id, entry] of Object.entries(drafts)) {
    if (
      entry &&
      typeof entry.updatedAt === "number" &&
      now - entry.updatedAt < DRAFT_TTL_MS &&
      entry.data &&
      typeof entry.data === "object"
    ) {
      out[id] = entry;
    }
  }
  return out;
}

const wizardDraftSlice = createSlice({
  name: "wizardDraft",
  initialState,
  reducers: {
    /** Shallow-merge `patch` into the wizard's draft (created if missing). */
    patchWizardDraft: (
      state,
      action: PayloadAction<{
        wizardId: string;
        patch: Record<string, unknown>;
      }>,
    ) => {
      const { wizardId, patch } = action.payload;
      const existing = state.drafts[wizardId];
      state.drafts[wizardId] = {
        updatedAt: Date.now(),
        data: { ...(existing?.data ?? {}), ...patch },
      };
    },
    /** Drop the wizard's draft — call on successful wizard completion. */
    clearWizardDraft: (state, action: PayloadAction<string>) => {
      delete state.drafts[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE_ACTION_TYPE, (state, action: RehydrateAction) => {
      if (action.payload.sliceName !== "wizardDraft") return;
      const loaded = action.payload.state as Partial<WizardDraftState> | undefined;
      if (!loaded?.drafts || typeof loaded.drafts !== "object") return;
      // Session-fresh edits beat the rehydrated cache; only fill gaps.
      const restored = pruneExpired(loaded.drafts, Date.now());
      for (const [id, entry] of Object.entries(restored)) {
        if (!(id in state.drafts)) state.drafts[id] = entry;
      }
    });
  },
});

export const { patchWizardDraft, clearWizardDraft } = wizardDraftSlice.actions;
export default wizardDraftSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

type StateWithWizardDraft = { wizardDraft: WizardDraftState };

/** The draft entry for one wizard, or null. Stable reference per draft. */
export const selectWizardDraft =
  (wizardId: string) =>
  (state: StateWithWizardDraft): WizardDraftEntry | null =>
    state.wizardDraft.drafts[wizardId] ?? null;

// ─── Sync policy ─────────────────────────────────────────────────────────────

export const wizardDraftPolicy = definePolicy<WizardDraftState>({
  sliceName: "wizardDraft",
  preset: "warm-cache",
  version: 1,
  broadcast: {
    actions: ["wizardDraft/patchWizardDraft", "wizardDraft/clearWizardDraft"],
  },
  storageKey: "matrx:wizardDrafts",
  partialize: ["drafts"],
  serialize: (state) => ({ drafts: pruneExpired(state.drafts, Date.now()) }),
  deserialize: (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const r = raw as Record<string, unknown>;
    if (!r.drafts || typeof r.drafts !== "object") return {};
    return {
      drafts: pruneExpired(
        r.drafts as Record<string, WizardDraftEntry>,
        Date.now(),
      ),
    };
  },
  // No remote: drafts are local working state, never server truth.
});

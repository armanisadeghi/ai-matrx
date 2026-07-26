// File: styles/themes/themeSlice.ts
//
// Deep imports (not the `@/lib/sync` barrel) are intentional: the barrel
// re-exports `syncPolicies` from `./registry`, which imports `themePolicy`
// back from this file. Routing through the barrel creates a runtime
// initialization cycle under Turbopack/Next ("Cannot access 'themePolicy'
// before initialization"). Keep these two imports at deep paths.
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
    REHYDRATE_ACTION_TYPE,
    type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";

export type ThemeMode = "light" | "dark";

export interface ThemeState {
    mode: ThemeMode;
}

const initialState: ThemeState = {
    mode: "dark",
};

const themeSlice = createSlice({
    name: "theme",
    initialState,
    reducers: {
        toggleMode: (state) => {
            state.mode = state.mode === "light" ? "dark" : "light";
        },
        setMode: (state, action: PayloadAction<ThemeMode>) => {
            state.mode = action.payload;
        },
    },
    extraReducers: (b) => {
        // Sync engine rehydrate — body shape matches `deserialize` below.
        b.addCase(REHYDRATE_ACTION_TYPE, (state, action: RehydrateAction) => {
            if (action.payload.sliceName !== "theme") return;
            const next = action.payload.state as Partial<ThemeState> | undefined;
            if (next?.mode === "light" || next?.mode === "dark") {
                state.mode = next.mode;
            }
        });
    },
});

export const { toggleMode, setMode } = themeSlice.actions;
export default themeSlice.reducer;

// ---- Sync engine policy --------------------------------------------------
//
// `themePolicy` makes the slice a first-class participant in the unified sync
// engine. It:
//   - broadcasts setMode/toggleMode across tabs in <20ms
//   - persists `mode` to localStorage (key `matrx:theme`) synchronously
//   - pre-paints `.dark` class + `data-theme` attribute before first paint via
//     `<SyncBootScript />`, honouring OS `prefers-color-scheme` on first visit
//
// See `docs/concepts/full-sync-boardcast-storage/phase-1-plan.md` §6.

export const themePolicy = definePolicy<ThemeState>({
    sliceName: "theme",
    preset: "boot-critical",
    version: 1, // Bumping destroys persisted theme — see JSDoc on definePolicy.
    broadcast: {
        actions: ["theme/setMode", "theme/toggleMode"],
    },
    storageKey: "matrx:theme",
    partialize: ["mode"],
    serialize: (state) => ({ mode: state.mode }),
    deserialize: (raw) => {
        if (raw && typeof raw === "object" && (raw as { mode?: unknown }).mode === "light") {
            return { mode: "light" };
        }
        return { mode: "dark" };
    },
    prePaint: [
        {
            kind: "classToggle",
            target: "html",
            className: "dark",
            fromKey: "mode",
            whenEquals: "dark",
            systemFallback: {
                mediaQuery: "(prefers-color-scheme: dark)",
                applyWhenMatches: true,
            },
        },
        {
            kind: "attribute",
            target: "html",
            attribute: "data-theme",
            fromKey: "mode",
            allowed: ["light", "dark"],
            default: "dark",
            systemFallback: {
                mediaQuery: "(prefers-color-scheme: dark)",
                applyWhenMatches: true,
                whenMatchesValue: "dark",
            },
        },
    ],
});

// ---- Cookie mirror -------------------------------------------------------
//
// Phase 3 PR 3.B: server-side pre-paint needs a cookie so the first HTML
// frame already has the right `.dark` class (previously the inline
// `SyncBootScript` was the only authority; the default theme flashed for a
// beat before the script toggled the class). The cookie side-effect lives
// outside the slice's reducers (which must stay pure) — `StoreProvider`
// installs a narrow `store.subscribe` watcher that calls `writeThemeCookie`
// whenever `theme.mode` changes. This keeps the cookie in lockstep with the
// Redux action on every toggle.
//
// Fire-and-forget: cookie write failing is not a user-visible error — the
// localStorage mirror still paints correctly next boot via the existing
// `SyncBootScript` fallback path (see `app/layout.tsx` comments).
export function writeThemeCookie(mode: ThemeMode): void {
    if (typeof window === "undefined") return;
    void fetch("/api/set-theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: mode }),
    }).catch(() => {
        // Swallow — SyncBootScript + LS fallback covers the next boot.
    });
}

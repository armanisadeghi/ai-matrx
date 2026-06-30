/**
 * lib/sync/registry.ts
 *
 * Central registry of all sync policies. Phase 1 starts empty — the theme
 * policy is wired in PR 1.B via `styles/themes/themeSlice.ts`.
 *
 * This is the single canonical list the engine, middleware, and SyncBootScript
 * walk. Adding a new persisted/broadcast slice means: (1) export a policy from
 * the slice file via `definePolicy`, (2) add it to this array. Nothing else.
 *
 * Replaces: ad-hoc registration scattered across feature middleware + Provider
 * wrappers. Delete trigger: n/a — this file is permanent.
 */

import type { Policy } from "./types";
import { themePolicy } from "@/styles/themes/themeSlice";
import { userPreferencesPolicy } from "@/lib/redux/preferences/userPreferencesSlice";
import { userProfilePolicy } from "@/lib/redux/slices/userProfileSlice";
import { appContextPolicy } from "@/lib/redux/slices/appContextSlice";
import { scopesTreePolicy } from "@/features/scopes/redux/scopesSlice";

// Uses `Policy<any>` instead of `Policy<unknown>` because `partialize: readonly (keyof TState)[]`
// makes TState invariant — `Policy<{ mode: "dark" }>` does not assign to `Policy<unknown>`.
// A heterogeneous collection of policies is the canonical case for `any` over `unknown`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const syncPolicies: readonly Policy<any>[] = [
  themePolicy,
  userPreferencesPolicy,
  userProfilePolicy,
  appContextPolicy,
  scopesTreePolicy,
] as const;

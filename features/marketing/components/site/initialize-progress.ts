/**
 * Pure state + query-invalidation mapping for the progressive site
 * initialization experience. The scraper's `sites/{id}/initialize` stream
 * emits granular `initialize_step` events; this module turns them into
 * per-step UI state and names EXACTLY which React Query keys each completed
 * step invalidates — so site identity appears seconds into the run while
 * screenshots/sitemaps/discovery are still working.
 *
 * Kept free of React so the event→invalidation contract is unit-testable.
 */

import {
  INITIALIZE_STEP_NAMES,
  type InitializeStepEvent,
  type InitializeStepName,
} from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";

export type InitializeStepUiStatus =
  | "pending"
  | "running"
  | "done"
  | "failed";

export interface InitializeStepUiState {
  status: InitializeStepUiStatus;
  count: number | null;
  message: string | null;
}

export type InitializeStepsState = Record<
  InitializeStepName,
  InitializeStepUiState
>;

export const INITIALIZE_STEP_LABELS: Record<InitializeStepName, string> = {
  identity: "Site identity",
  screenshots: "Screenshots",
  sitemaps: "Sitemaps",
  discovered: "Discovery",
};

export function emptyInitializeSteps(): InitializeStepsState {
  return Object.fromEntries(
    INITIALIZE_STEP_NAMES.map((step) => [
      step,
      { status: "pending", count: null, message: null },
    ]),
  ) as InitializeStepsState;
}

/** Immutable reducer: fold one initialize_step event into the strip state. */
export function applyInitializeStepEvent(
  state: InitializeStepsState,
  event: InitializeStepEvent,
): InitializeStepsState {
  const prior = state[event.step];
  const next: InitializeStepUiState =
    event.status === "started"
      ? { status: "running", count: prior.count, message: null }
      : event.status === "complete"
        ? { status: "done", count: event.count ?? prior.count, message: null }
        : {
            status: "failed",
            count: prior.count,
            message: event.message ?? "Step failed",
          };
  return { ...state, [event.step]: next };
}

export interface InitializeInvalidation {
  queryKey: readonly unknown[];
  /** true → invalidate ONLY this key, not its whole subtree. */
  exact: boolean;
}

/**
 * The event→query-invalidation map. Every key here is a real key produced by
 * `marketingKeys` / the hooks in `data/hooks.ts` — never hand-built strings.
 *
 * - identity → the site row itself (exact: the site key is also the prefix of
 *   the whole per-site subtree; identity must not refetch everything).
 * - screenshots → hero screenshot + every page's capture set (page subtree).
 * - sitemaps → sitemap list, sitemap coverage stats, coverage matrix.
 * - discovered → brand discovery inbox lists + pending count.
 */
export function queryKeysForInitializeStep(
  step: InitializeStepName,
  siteId: string,
  brandId: string | null,
): InitializeInvalidation[] {
  switch (step) {
    case "identity":
      return [{ queryKey: marketingKeys.site(siteId), exact: true }];
    case "screenshots":
      return [
        { queryKey: marketingKeys.heroScreenshot(siteId), exact: false },
        {
          queryKey: [...marketingKeys.site(siteId), "page"] as const,
          exact: false,
        },
      ];
    case "sitemaps":
      return [
        {
          queryKey: [...marketingKeys.site(siteId), "sitemaps"] as const,
          exact: false,
        },
        {
          queryKey: [
            ...marketingKeys.site(siteId),
            "sitemap-coverage",
          ] as const,
          exact: false,
        },
        {
          queryKey: [...marketingKeys.site(siteId), "coverage-matrix"] as const,
          exact: false,
        },
      ];
    case "discovered":
      return brandId
        ? [
            {
              queryKey: [
                ...marketingKeys.root,
                "brand",
                brandId,
                "discovered",
              ] as const,
              exact: false,
            },
            {
              queryKey: marketingKeys.discoveredCount(brandId),
              exact: false,
            },
          ]
        : [];
  }
}

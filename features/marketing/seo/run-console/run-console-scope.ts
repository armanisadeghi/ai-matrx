/**
 * The run console's SCOPE BUILDER — the live values both engine bodies emit.
 *
 * A runtime module beside the feature (not in the manifest) because the raw
 * page state needs real derivation: two engines report different outcome
 * shapes, coverage arrives per-brand from a cache of parallel queries, and the
 * knob reads resolve independently of everything else.
 *
 * THE HONESTY CONTRACT: a value declared `alwaysAvailable: true` is a promise
 * this builder keeps on every call. Everything that depends on a query having
 * resolved is optional and simply absent until it has — never a zero standing
 * in for "not loaded yet", which is the difference between "no owed work" and
 * "we have not looked".
 *
 * Called at TRIGGER time with live values, never from stale state.
 */

import {
  createRunConsoleScope,
  type RunConsoleScopeValues,
} from "@/features/surfaces/manifests/_run-console.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { ConsoleEngine } from "./engines";
import type {
  ConsoleSiteRow,
  EngineScheduleRow,
  PlaceDetectionRunOutcome,
  RunConsoleScope,
  RunOutcome,
  SituationalRefreshStatus,
  SituationalRunOutcome,
} from "./types";

type AnyRunOutcome = RunOutcome | SituationalRunOutcome | PlaceDetectionRunOutcome;

export interface BrandCoverageRow {
  site_id: string;
  site_name: string;
  /** Share of demand clicks already placed, 0-100. Null when unreadable. */
  clicks_placed_pct: number | null;
  /** Keywords owed a placement. Null when unreadable. */
  owed: number | null;
}

export interface RunConsoleScopeInput {
  engine: ConsoleEngine;
  scope: RunConsoleScope;
  /** The org a launched pass travels under, when the tier declares one. */
  requestOrganizationId?: string | undefined;

  sites: readonly ConsoleSiteRow[];
  /** True while the brand list is still loading — keeps counts absent. */
  sitesLoading: boolean;
  sitesError: boolean;
  selectedSiteIds: readonly string[];
  focusedSiteId?: string | null;

  coverage?: readonly BrandCoverageRow[];
  situationalStatus?: readonly SituationalRefreshStatus[];

  /** KI-015 — the global scoreboard, when the mounted engine is place detection. */
  placeDetectionStatus?: import("../value-system/rules/types").PlaceDetectionStatus | null;

  /** False until the knob read resolves — every knob value stays absent. */
  knobsResolved: boolean;
  capCeiling?: number;
  effectiveCap?: number;
  minImpressions?: number;
  dailyCeiling?: number;

  isRunning: boolean;
  queueLength: number;
  runStage?: string | null;
  runError?: string | null;
  outcomes: readonly AnyRunOutcome[];

  /** Undefined until the schedule read resolves. */
  schedules?: readonly EngineScheduleRow[];
}

function isPlacementOutcome(outcome: AnyRunOutcome): outcome is RunOutcome {
  return "claimed" in outcome && !("placesWritten" in outcome);
}

function isPlaceDetectionOutcome(
  outcome: AnyRunOutcome,
): outcome is PlaceDetectionRunOutcome {
  return "placesWritten" in outcome;
}

/** The roll-up across a session's outcomes — the composite of its parts. */
function summarize(
  outcomes: readonly AnyRunOutcome[],
): Record<string, unknown> | undefined {
  if (outcomes.length === 0) return undefined;
  const summary = {
    brands: new Set(
      outcomes.map((outcome) => ("siteId" in outcome ? outcome.siteId : "global")),
    ).size,
    claimed: 0,
    placed: 0,
    proposed: 0,
    human_protected: 0,
    quarantined: 0,
    stamped: 0,
    released: 0,
    errors: 0,
    ceiling_reached: false,
  };
  for (const outcome of outcomes) {
    if (outcome.error) summary.errors += 1;
    if (isPlacementOutcome(outcome)) {
      summary.claimed += outcome.claimed;
      summary.placed += outcome.placed;
      summary.proposed += outcome.proposed;
      summary.human_protected += outcome.humanProtected;
      summary.quarantined += outcome.quarantined;
      if (outcome.ceilingReached) summary.ceiling_reached = true;
    } else if (isPlaceDetectionOutcome(outcome)) {
      summary.claimed += outcome.claimed;
      summary.stamped += outcome.localIntentStamped;
      summary.human_protected += outcome.humanProtected;
    } else {
      summary.stamped += outcome.stamped;
      summary.released += outcome.removed;
      summary.proposed += outcome.proposals;
    }
  }
  return summary;
}

/**
 * The sentences explaining why the engine declined to write. KI-044: a pass
 * that placed nothing because autonomy said wait must never read as "nothing
 * to place", so the refusals travel as their own value.
 */
function refusals(outcomes: readonly AnyRunOutcome[]): string[] {
  return outcomes
    .map((outcome) =>
      isPlacementOutcome(outcome)
        ? outcome.autonomyRefusal
        : isPlaceDetectionOutcome(outcome)
          ? outcome.skipped
          : outcome.refusal,
    )
    .filter((sentence): sentence is string => !!sentence);
}

/**
 * The slice of the scope a CHILD body owns — the run state and per-brand
 * standing that live inside the engine's own component. The shell closes over
 * everything else and hands the child a builder, so no state is lifted just to
 * satisfy a provider.
 */
export type RunConsoleLiveState = Pick<
  RunConsoleScopeInput,
  | "selectedSiteIds"
  | "focusedSiteId"
  | "situationalStatus"
  | "isRunning"
  | "queueLength"
  | "outcomes"
>;

export function buildRunConsoleScope(
  input: RunConsoleScopeInput,
): SurfaceScopePayload {
  const {
    engine,
    scope,
    sites,
    sitesLoading,
    sitesError,
    outcomes,
    knobsResolved,
  } = input;

  const focused = input.focusedSiteId
    ? sites.find((site) => site.id === input.focusedSiteId)
    : undefined;
  const brandsLoaded = !sitesLoading && !sitesError;

  const values: RunConsoleScopeValues = {
    // Engine — properties of the engine ROW, true on every call.
    active_engine_slug: engine.slug,
    active_engine_label: engine.label,
    active_engine_what: engine.what,
    engine_mandate_keys: engine.agents.map((agent) => agent.mandateKey),
    autonomy_capability: engine.autonomyCapability,
    cap_knob_key: engine.capKnobKey,

    // Scope — the tier is a prop, so it is always knowable.
    scope_tier: scope.tier,
    ...(scope.tier === "organization"
      ? { scope_organization_id: scope.organizationId }
      : {}),
    ...(scope.tier === "site" ? { scope_site_id: scope.siteId } : {}),
    ...(input.requestOrganizationId
      ? { request_organization_id: input.requestOrganizationId }
      : {}),

    // Brands.
    ...(brandsLoaded
      ? {
          brand_count: sites.length,
          brand_rows: sites.map((site) => ({
            id: site.id,
            name: site.name,
            domain: site.domain,
          })),
        }
      : {}),
    ...(sitesError
      ? { brands_load_error: "Could not read the brand list." }
      : {}),
    selected_site_ids: [...input.selectedSiteIds],
    ...(focused
      ? { focused_site_id: focused.id, focused_site_name: focused.name }
      : {}),
    ...(input.coverage && input.coverage.length > 0
      ? { brand_coverage: input.coverage.map((row) => ({ ...row })) }
      : {}),
    ...(input.situationalStatus && input.situationalStatus.length > 0
      ? {
          situational_status: input.situationalStatus.map((row) => ({
            ...row,
          })),
        }
      : {}),

    // Limits — absent, never zero, until the knob read resolves.
    ...(knobsResolved
      ? {
          ...(input.capCeiling === undefined
            ? {}
            : { cap_ceiling: input.capCeiling }),
          ...(input.effectiveCap === undefined
            ? {}
            : { effective_cap: input.effectiveCap }),
          ...(input.minImpressions === undefined
            ? {}
            : { min_impressions: input.minImpressions }),
          ...(input.dailyCeiling === undefined
            ? {}
            : { daily_ceiling: input.dailyCeiling }),
          knobs_broken: input.capCeiling === 0,
        }
      : {}),

    // This run.
    is_running: input.isRunning,
    queue_length: input.queueLength,
    run_outcome_count: outcomes.length,
    ...(input.runStage ? { run_stage: input.runStage } : {}),
    ...(input.runError ? { run_error: input.runError } : {}),
    ...(outcomes.length > 0
      ? {
          run_outcomes: outcomes.map(
            (outcome) => ({ ...outcome }) as Record<string, unknown>,
          ),
          run_summary: summarize(outcomes),
          ...(refusals(outcomes).length > 0
            ? { autonomy_refusals: refusals(outcomes) }
            : {}),
        }
      : {}),

    // Schedule.
    ...(input.schedules
      ? {
          engine_schedule_count: input.schedules.length,
          engine_schedules: input.schedules.map((row) => ({ ...row })),
        }
      : {}),
  };

  return createRunConsoleScope(values);
}

/**
 * Which surface a mount emits. The permission tier is a prop (KI-049), and the
 * tier decides the CLIENT: the platform-wide console is admin chrome, the
 * organization/brand mounts are the customer's own screen.
 */
export function runConsoleSurfaceName(scope: RunConsoleScope): string {
  return scope.tier === "system"
    ? "matrx-admin/marketing-run-console"
    : "matrx-user/marketing-automations";
}

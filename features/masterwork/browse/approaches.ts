import { supabase } from "@/utils/supabase/client";

/**
 * The Approach registry — the many ways an Expert goes through Distillation.
 *
 * `platform.approach` is a canonical system-variant catalog table (public
 * visibility, seeded rows owned by the Matrx System org). Every surface that
 * shows Approaches renders one card per ROW — adding a new Approach that
 * reuses an existing lane shape is a ROW, not code
 * (contract: features/masterwork/FEATURE.md § The Approach Registry).
 *
 * Direct supabase-js read per architecture rules — a registry read is a plain
 * DB read, never a Python hop.
 */

export interface DistillationApproach {
  id: string;
  /** Stable slug — also the value stamped on rules as `source_ref.approach`. */
  key: string;
  /** Card title, in the Expert's language. */
  label: string;
  /** What this Approach is — plain words, zero jargon. */
  blurb: string;
  /** What the Expert must bring ("about 20 minutes of talking"). */
  whatItNeeds: string;
  /** The honest time/cost sentence ("start now — rules within minutes"). */
  costTimeShape: string;
  /** The Mandate that runs it (informational to the picker). */
  mandateKey: string;
  /** Query params appended to /masterwork/{id} when this Approach is chosen. */
  intakeQuery: Record<string, string>;
  sortOrder: number;
  /** May this Approach START a new Rulebook? The intake funnel filters on it. */
  enabled: boolean;
  /**
   * Does this lane exist in the product AT ALL (`metadata.availability`)?
   * Orthogonal to `enabled` — the Vision Interview is fully built and still
   * not a way to start a Rulebook, and the Oracle tap ships only its in-app
   * half. `coming_soon` is a named, approved Approach with no lane yet: it
   * renders as a card that says so and cannot be clicked (NO DEAD ENDS).
   */
  availability: ApproachAvailability;
  /**
   * For a lane that is NOT a `/masterwork/[id]` query param, the page that IS
   * its door (`metadata.launch_href`) — e.g. `/masterwork/vision-interview/new`.
   */
  launchHref: string | null;
  /** The number Arman approved it under in the 2026-08-17 catalog, if any. */
  catalogNumber: number | null;
}

export type ApproachAvailability = "available" | "partial" | "coming_soon";

function metaRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Unknown/absent availability reads as `available` — the seven original rows
 *  predate the field, and a registry row is not "coming soon" by accident. */
function toAvailability(value: unknown): ApproachAvailability {
  return value === "coming_soon" || value === "partial" ? value : "available";
}

function toIntakeQuery(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  }
  return out;
}

/**
 * The WHOLE Distillation catalog in picker order — every non-deleted row,
 * available and coming-soon alike. Arman, 2026-08-20: "I wanna see all of them
 * here. I wanna see cards for them. And if they're not available yet, then it
 * needs to say coming soon." Consumers that may only offer a startable lane
 * filter on `.enabled` themselves; nobody filters in the query any more,
 * because a filtered query is how six approved Approaches went missing.
 *
 * Throws on a real error — the surface states the problem instead of silently
 * offering nothing.
 */
export async function fetchDistillationApproaches(): Promise<
  DistillationApproach[]
> {
  const { data, error } = await supabase
    .schema("platform")
    .from("approach")
    .select(
      "id,key,label,blurb,what_it_needs,cost_time_shape,mandate_key,intake_query,sort_order,enabled,metadata",
    )
    .eq("family", "distillation")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });
  if (error) throw new Error(`${error.message} (${error.code})`);
  return (data ?? []).map((row) => {
    const metadata = metaRecord(row.metadata);
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      blurb: row.blurb,
      whatItNeeds: row.what_it_needs,
      costTimeShape: row.cost_time_shape,
      mandateKey: row.mandate_key,
      intakeQuery: toIntakeQuery(row.intake_query),
      sortOrder: row.sort_order,
      enabled: row.enabled,
      availability: toAvailability(metadata.availability),
      launchHref:
        typeof metadata.launch_href === "string" && metadata.launch_href
          ? metadata.launch_href
          : null,
      catalogNumber:
        typeof metadata.catalog_number === "number"
          ? metadata.catalog_number
          : null,
    };
  });
}

/**
 * Where a card sits and where it goes — ONE predicate, every surface.
 *
 * Census defect (masterwork-methods-census, row 10): the catalog sectioned
 * cards on `availability` while a separate rule decided the href, so
 * `vision_interview` (`enabled=false`, `availability="available"`) rendered
 * under "Ready now", and any row with an availability but no door rendered as
 * a `<button>` with nothing behind it. A card described by two rules is a card
 * that can lie about itself. From here every consumer asks this one function.
 */
export type ApproachStatus = "ready" | "partial" | "coming_soon";

export interface ApproachState {
  /** Which section the card belongs in — the ONLY source for that heading. */
  status: ApproachStatus;
  /** The one door this Approach opens, or null when it has none. */
  href: string | null;
  /** May the card be clicked? Exactly when it has a door. NO DEAD ENDS. */
  reachable: boolean;
}

/**
 * Can the GUIDED FUNNEL run this Approach? It builds its next URL out of
 * `intake_query`, so a row whose only door is its own page (`launch_href`) is
 * live and reachable from the catalog but cannot be begun by Start. A row with
 * no lane at all dumps the Expert on a bare Rulebook page — the `timeline`
 * class, census row 3.
 *
 * This asks only WHETHER the funnel has a query to hand on. WHICH lane that
 * query opens is a separate, total mapping the Rulebook page owns, and it is
 * the thing that must say so out loud when a row maps to nothing.
 */
export function hasIntakeLane(a: DistillationApproach): boolean {
  return Object.keys(a.intakeQuery).length > 0;
}

export function approachState(a: DistillationApproach): ApproachState {
  if (a.availability === "coming_soon") {
    return { status: "coming_soon", href: null, reachable: false };
  }
  const href = a.launchHref
    ? a.launchHref
    : a.enabled && hasIntakeLane(a)
      ? `/masterwork/new?approach=${encodeURIComponent(a.key)}`
      : null;
  // "Ready now" means all three agree: the registry enabled it, it declares
  // itself available, and it actually has somewhere to go.
  const ready = a.enabled && a.availability === "available" && href !== null;
  return { status: ready ? "ready" : "partial", href, reachable: href !== null };
}

/**
 * The Approaches that may START a new Rulebook inside the guided funnel.
 *
 * A LANE, not a flag: `enabled` says the Approach is live, `intake_query` says
 * the funnel knows how to run it. An Approach whose door is its own page
 * (`launch_href`) is live and reachable from the catalog, but Start cannot
 * begin it — its lane is the page, not a query param.
 */
export function startableApproaches(
  approaches: DistillationApproach[],
): DistillationApproach[] {
  return approaches.filter((a) => a.enabled && hasIntakeLane(a));
}

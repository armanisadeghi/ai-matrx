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

/** The Approaches that may START a new Rulebook — the intake funnel's set. */
export function startableApproaches(
  approaches: DistillationApproach[],
): DistillationApproach[] {
  return approaches.filter((a) => a.enabled);
}

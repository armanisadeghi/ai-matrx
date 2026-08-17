import { supabase } from "@/utils/supabase/client";

/**
 * The Approach registry — the many ways an Expert goes through Distillation.
 *
 * `platform.approach` is a canonical system-variant catalog table (public
 * visibility, seeded rows owned by the Matrx System org). The intake picker
 * reads the ENABLED rows and renders one card per Approach; adding a new
 * Approach that reuses an existing lane shape is a ROW, not code
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
 * The enabled Distillation Approaches, picker order. Throws on a real error —
 * the dialog states the problem instead of silently offering nothing.
 */
export async function fetchDistillationApproaches(): Promise<
  DistillationApproach[]
> {
  const { data, error } = await supabase
    .schema("platform")
    .from("approach")
    .select(
      "id,key,label,blurb,what_it_needs,cost_time_shape,mandate_key,intake_query,sort_order",
    )
    .eq("family", "distillation")
    .eq("enabled", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });
  if (error) throw new Error(`${error.message} (${error.code})`);
  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    blurb: row.blurb,
    whatItNeeds: row.what_it_needs,
    costTimeShape: row.cost_time_shape,
    mandateKey: row.mandate_key,
    intakeQuery: toIntakeQuery(row.intake_query),
    sortOrder: row.sort_order,
  }));
}

"use client";

// features/bindings/treatment-writer.ts
//
// 🚨 THE ONE WRITER for a job's PRESENTATION, exactly as `consumption-writer.ts`
// is the one writer for its consumption. Nothing else in this feature reads or
// mutates `mandate.treatment`.
//
// ONE ROW PER JOB. Every one of the 208 live treatments is `tier = 'widget'`,
// `is_default = true`, `audience = null` — one presentation per mandate — and
// `mandate.vw_shortcut` joins on exactly that triple. This writer keeps the same
// natural key rather than inventing a second one.
//
// THE DATABASE ALREADY ENFORCES IT, which is why `maybeSingle()` below cannot
// surprise anyone and the insert cannot race a second default into existence:
//   CREATE UNIQUE INDEX treatment_default_uq ON mandate.treatment (mandate_id, tier)
//     WHERE (is_default AND deleted_at IS NULL);
// It is also exactly this read's predicate, so both resolvers' presentation
// lookup is an index hit, not a scan on a hot path.
//
// WHAT THE ROW INHERITS, and why none of it is a choice made here:
//   · `organization_id` — the MANDATE's own. Repo law: every write carries an
//     explicit organization_id and no resolver or trigger may pick one, so the
//     job's org travels with the job's presentation. It is also why the drawer
//     says out loud that these options are the job's, org-wide — unlike the
//     holder above, a treatment has no per-person rung and pretending otherwise
//     would be the screen lying.
//   · `visibility` — the mandate's, so a private job's presentation is not more
//     visible than the job it presents.
//   · `name` — the mandate's label, which is what the row is called in the
//     admin browser; it is not a second editable title.

import { createClient } from "@/utils/supabase/client";
import { isJsonObject } from "@/types/json";
import {
  mandateTreatments,
  type MandateTreatmentRow,
} from "@/lib/supabase/mandateStorage";

import {
  TREATMENT_TIER_WIDGET,
  buildTreatmentConfig,
  defaultPresentation,
  parseTreatmentConfig,
  presentationIsDefault,
  type BindingPresentation,
} from "./treatment-shape";

export interface StoredPresentation {
  /** The treatment row's id — null when this job has no stored presentation. */
  treatmentId: string | null;
  presentation: BindingPresentation;
  /** True when the row exists and is switched off. */
  disabled: boolean;
}

/** The mandate a presentation belongs to. */
export interface PresentationOwner {
  mandateId: string;
  organizationId: string;
  label: string;
  visibility: MandateTreatmentRow["visibility"];
}

/**
 * This job's stored presentation, or the defaults when it has none. A job with
 * no row and a job with a default-valued row read identically — see
 * `defaultPresentation`.
 */
export async function readPresentation(
  mandateId: string,
): Promise<StoredPresentation> {
  const supabase = createClient();
  const { data, error } = await mandateTreatments(supabase)
    .select("id, config, is_enabled")
    .eq("mandate_id", mandateId)
    .eq("tier", TREATMENT_TIER_WIDGET)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(
      `This job's display options could not be read: ${error.message}`,
      { cause: error },
    );
  }
  if (!data) {
    return {
      treatmentId: null,
      presentation: defaultPresentation(),
      disabled: false,
    };
  }
  return {
    treatmentId: data.id,
    presentation: parseTreatmentConfig(
      isJsonObject(data.config) ? data.config : null,
    ),
    disabled: data.is_enabled === false,
  };
}

/**
 * Store this job's presentation.
 *
 * A job whose options are all still the defaults and that has NO row keeps none
 * — a stored row that says nothing is a row someone later has to explain. Once
 * a row exists it is updated in place (never deleted on a return-to-defaults),
 * because deleting it would also discard the `is_enabled` answer the row
 * carries.
 */
export async function writePresentation({
  owner,
  presentation,
  treatmentId,
  enabled,
}: {
  owner: PresentationOwner;
  presentation: BindingPresentation;
  treatmentId: string | null;
  enabled: boolean;
}): Promise<string | null> {
  const supabase = createClient();
  const config = buildTreatmentConfig(presentation);

  if (!treatmentId) {
    if (presentationIsDefault(presentation) && enabled) return null;
    const { data, error } = await mandateTreatments(supabase)
      .insert({
        mandate_id: owner.mandateId,
        organization_id: owner.organizationId,
        name: owner.label,
        tier: TREATMENT_TIER_WIDGET,
        is_default: true,
        is_enabled: enabled,
        visibility: owner.visibility,
        config,
      })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        `This job's display options could not be saved: ${error.message}`,
        { cause: error },
      );
    }
    return data.id;
  }

  const { error } = await mandateTreatments(supabase)
    .update({ config, is_enabled: enabled })
    .eq("id", treatmentId);
  if (error) {
    throw new Error(
      `This job's display options could not be saved: ${error.message}`,
      { cause: error },
    );
  }
  return treatmentId;
}

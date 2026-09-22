"use client";

/**
 * relation-knob — WHETHER THIS ORGANIZATION OFFERS A COLUMN THAT POINTS AT
 * ANOTHER TABLE.
 *
 * "Opinions become knobs": whether people here can CREATE a `relation` column
 * is a behavioural choice, so it is `data_tables.relation.relation_columns_enabled`
 * — default FALSE, overridable at the organization rung — and organizations
 * decide, never agents and never a constant in this file.
 *
 * WHY NOT `lib/knobs/featureKnobs`. That module reads
 * `platform.feature_knob.value`, which is the PLATFORM DEFAULT and the same
 * number for everybody. A per-organization answer comes from
 * `platform.knob_index`, which resolves the ladder — platform default, then the
 * organization's own `platform.knob_override` row — and that override is written
 * through `platform.knob_override_set`, the door that checks the writer is an
 * owner or admin of THAT organization and files the audit. A `feature_knob` row
 * is not any organization's to change.
 *
 * IT GATES CREATION, NEVER READING. A column that already exists keeps working
 * and keeps resolving its words whatever this answers: it is DATA, and a switch
 * that could blank a column somebody filled in would be a switch that deletes
 * work. Everything in W2 and W3 is ungated by design.
 *
 * WHILE THE ANSWER IS LOADING the option is ABSENT, never present-and-disabled:
 * a control that is there but dead is the thing "a screen never lies" forbids,
 * and an option that appears a moment later reads as the screen finishing.
 */

import { useEffect, useState } from "react";

import { fetchKnobIndex } from "@/lib/scoped-config/service";

export const RELATION_KNOB_FEATURE = "data_tables.relation";
export const RELATION_KNOB_KEY = "relation_columns_enabled";

/** Resolve the knob for one organization. Never throws; a failure reads as OFF. */
export async function relationColumnsEnabledFor(
  organizationId: string | null | undefined,
): Promise<boolean> {
  if (!organizationId) return false;
  try {
    const keys = await fetchKnobIndex({
      organizationId,
      featurePrefix: RELATION_KNOB_FEATURE,
    });
    const row = keys.find((k) => k.feature === RELATION_KNOB_FEATURE && k.key === RELATION_KNOB_KEY);
    // A key with no register row is not "off by default" — it is a knob nobody
    // seeded, which is a defect. It still reads as off here (an absent option
    // is the safe direction) and the register's own guards are what report it.
    return row?.effective_value === true || row?.effective_value === "true";
  } catch {
    return false;
  }
}

/**
 * `undefined` while the answer is on its way, then `true`/`false`. A caller
 * renders the option only on `true`, so a slow answer shows one fewer option
 * rather than an option that does not work.
 */
export function useRelationColumnsEnabled(
  organizationId: string | null | undefined,
): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setEnabled(undefined);
    void relationColumnsEnabledFor(organizationId).then((v) => {
      if (live) setEnabled(v);
    });
    return () => {
      live = false;
    };
  }, [organizationId]);
  return enabled;
}

/**
 * The predicate the format picker takes. Every format is offered except
 * `relation`, which is offered only where this organization turned it on.
 *
 * It is a PREDICATE and not a list because the picker is a platform primitive
 * that knows nothing about organizations, and the caller — a data-table column
 * editor — is the one place that does.
 */
export function offerFormatWhereRelationIs(enabled: boolean | undefined) {
  return (formatId: string): boolean => formatId !== "relation" || enabled === true;
}

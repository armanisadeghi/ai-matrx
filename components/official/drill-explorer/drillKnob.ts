// components/official/drill-explorer/drillKnob.ts — THE ONE WAY THE EXPLORER READS A DRILL SETTING
// (lane DRILL-LIVE-FIXES, VERIFY-DRILL-LIVE F1).
//
// The defect class: every knob read in the explorer split its own dotted name. The stale knob split
// `drill.usage.stale_after_minutes` at the FIRST dot ("drill" / "usage.stale_after_minutes"), so the
// row (feature `drill.usage`, key `stale_after_minutes`) read as missing and a red sentence sat under
// every usage answer. Six other reads wrote their pairs by hand.
//
// The fix: ONE address rule, the door's own. `platform.drill_knob` (production, read 2026-09-30):
//   v_feature := regexp_replace(p_name, '\.[a-z0-9_]+$', '');
//   v_key     := substring(p_name from '[a-z0-9_]+$');
//   v := platform.knob_resolve(v_feature, v_key, p_organization_id, auth.uid());
// so a drill setting's feature is everything before its LAST segment and its key is that segment —
// the only convention a drill knob can be seeded under, since the door could not read it otherwise.
// The value is the EFFECTIVE one (organization → person ladder) from the one knob snapshot
// (`lib/scoped-config/effectiveKnobs.ts`, one fetch for every knob), never the platform row alone.
//
// Organization: the organization and mine lanes read the explorer's organization's rung, as the door
// does. The platform lane reads with no organization: its organization is the platform's own, which
// the admin seat is not a member of (the snapshot refuses a non-member, 42501), and no organization
// holds a drill.* override (read 2026-09-30) — so the value equals the door's.

import { ensureEffectiveKnob, type KnobAddress } from "@/lib/scoped-config/effectiveKnobs";

/** A drill setting's name: `drill.<area>.<name>` (or `drill.<name>`), lower-case segments. */
const DRILL_KNOB_NAME = /^drill(\.[a-z0-9_]+)+$/;

/** The (feature, key) pair `platform.drill_knob` reads for a drill setting's name. */
export function drillKnobAddress(name: string): KnobAddress {
  if (!DRILL_KNOB_NAME.test(name)) throw new Error(`"${name}" is not a drill setting name (drill.<area>.<name>).`);
  const at = name.lastIndexOf(".");
  return { feature: name.slice(0, at), key: name.slice(at + 1) };
}

export type DrillLane = "mine" | "organization" | "platform";

/** Read one drill setting as a number, the way the door resolves it. Rejects with the reason. */
export async function readDrillKnob(
  name: string,
  seat: { lane: DrillLane; organizationId: string | null; userId: string | null },
): Promise<number> {
  const address = drillKnobAddress(name);
  const organizationId = seat.lane === "platform" ? null : seat.organizationId;
  const value = await ensureEffectiveKnob(organizationId, seat.userId, address);
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) {
    throw new Error(`The drill setting ${name} is not a number (${String(value)}).`);
  }
  return n;
}

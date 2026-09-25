import type {
  MandateLadderRow,
  MandateRung,
} from "@/features/mandates/workspace/useMandateLadder";
import { isJsonObject, type JsonObject } from "@/types/json";

const RUNGS: readonly MandateRung[] = ["system", "org", "user"];

export const MODEL_OVERRIDE_SOURCE: Record<MandateRung, string> = {
  system: "System",
  org: "Organization",
  user: "Personal",
};

/**
 * Editor baseline only — this does not decide which holder runs.
 * service.py::_apply_layer shallow-merges every enabled preceding binding,
 * including a binding whose holder is dropped. UnifiedConfig.apply_overrides
 * ignores a final null: it cancels an earlier override, leaving holder defaults.
 */
export function inheritedModelOverrides(
  rows: readonly Pick<
    MandateLadderRow,
    "rung" | "is_enabled" | "config_overrides"
  >[],
  editingRung: MandateRung,
) {
  const merged: JsonObject = {};
  const sources: Record<string, string> = {};
  // The system rung is included: since aidream 1037 the default carries its own
  // settings, and service.py merges them first (1041 retired the global rung).
  for (const rung of RUNGS.slice(0, RUNGS.indexOf(editingRung))) {
    const row = rows.find((candidate) => candidate.rung === rung);
    if (!row?.is_enabled || row.config_overrides === null) continue;
    if (!isJsonObject(row.config_overrides)) {
      throw new Error(
        `${MODEL_OVERRIDE_SOURCE[rung]} model overrides must be an object`,
      );
    }
    for (const [key, value] of Object.entries(row.config_overrides)) {
      merged[key] = value;
      sources[key] =
        value === null
          ? `${MODEL_OVERRIDE_SOURCE[rung]} · Mandate Holder default`
          : MODEL_OVERRIDE_SOURCE[rung];
    }
  }
  // Keep null cancellation in the provenance, but never erase the authored
  // holder value from the effective baseline sent to the controls.
  const values: JsonObject = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== null) values[key] = value;
  }
  return { values, sources };
}

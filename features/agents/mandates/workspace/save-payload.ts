// features/agents/mandates/workspace/save-payload.ts
//
// The PURE builder for a mandate-binding save — every rule the wholesale-
// replace PUT makes load-bearing lives here, jest-covered, so no UI step can
// reintroduce the two wipe bugs:
//
//   · consumption_map is REPLACED wholesale by the server — every save on a
//     provisioned mandate re-sends the FULL current map; a LEGACY mandate
//     (no provision_key) must send `undefined` (the server 422s on any
//     non-null map there, including {}).
//   · config_overrides is ALSO replaced wholesale — when the settings step
//     was never opened (its Redux slice never initialized), the save FALLS
//     BACK to the binding's stored overrides. Lazy seeding must never wipe
//     what a user set last month.
//
// Version triple (Arman's rule 6): latest = {agentId, useLatest: true};
// pinned = {agentVersionId, useLatest: false}. Exactly one id — the server
// enforces the XOR; we never send both.

import type { JsonObject } from "@/types/json";
import type { ConsumptionMap } from "../provision-shapes";
import type { MandateBindingInput } from "../overrides";

export interface HolderChoice {
  /** The chosen master agent id (floating), or null for settings-only. */
  agentId: string | null;
  /** The pinned definition_version id when the user chose to pin. */
  agentVersionId: string | null;
  /** true = follow latest; false = pinned. */
  useLatest: boolean;
}

export interface SavePayloadArgs {
  holder: HolderChoice;
  /** Whether the MANDATE carries a Provision (decides the map channel). */
  hasProvision: boolean;
  /** The full current consumption map from the mapping step. */
  consumptionMap: ConsumptionMap;
  /**
   * The captured settings deltas (selectSettingsOverridesForApi) — undefined
   * when the settings step was NEVER OPENED this session.
   */
  capturedOverrides: JsonObject | undefined;
  /** The binding's STORED config_overrides as loaded (the wipe-guard fallback). */
  storedOverrides: JsonObject | null;
}

export function buildBindingSavePayload(args: SavePayloadArgs): MandateBindingInput {
  const { holder, hasProvision, consumptionMap, capturedOverrides, storedOverrides } =
    args;

  if (holder.agentId && holder.agentVersionId) {
    // Never trust a UI state that drifted into both — refuse client-side with
    // the same rule the server enforces, before any network call.
    throw new Error(
      "A binding names ONE holder reference: a floating agent or a pinned version, never both.",
    );
  }

  const configOverrides =
    capturedOverrides !== undefined
      ? Object.keys(capturedOverrides).length > 0
        ? capturedOverrides
        : null
      : storedOverrides;

  return {
    agentId: holder.agentId,
    agentVersionId: holder.agentVersionId,
    useLatest: holder.useLatest,
    configOverrides,
    // Legacy mandates: the field must be ABSENT from the wire (undefined), not
    // an empty map — bindings.py 422s on any non-None map without a provision.
    consumptionMap: hasProvision ? consumptionMap : undefined,
  };
}

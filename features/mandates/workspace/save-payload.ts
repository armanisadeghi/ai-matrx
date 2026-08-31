// features/mandates/workspace/save-payload.ts
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

export type HolderChoice =
  | {
      kind?: "agent";
      /** The chosen master agent id (floating), or null for settings-only. */
      agentId: string | null;
      /** The pinned definition_version id when the user chose to pin. */
      agentVersionId: string | null;
      /** true = follow latest; false = pinned. */
      useLatest: boolean;
    }
  | {
      kind: "workflow";
      /** A `workflow.definition` id — NEVER a version id. */
      workflowId: string;
      /** Optional pin to one `workflow.definition_version`. */
      workflowVersionId?: string | null;
    };

export interface SavePayloadArgs {
  holder: HolderChoice;
  /**
   * Whether the MANDATE OFFERS ANYTHING to map (decides the map channel).
   *
   * 🚨 D18.1 — this used to be `hasProvision`, read straight off
   * `provision_key`, which meant a mandate a person authored could never send
   * a consumption map however completely they had described its inputs. A
   * mandate's described inputs ARE its provision; only a mandate that offers
   * nothing at all sends `undefined` here.
   */
  hasOffer: boolean;
  /** The full current consumption map from the mapping step. */
  consumptionMap: ConsumptionMap;
  /**
   * The captured settings deltas (selectSettingsOverridesForApi) — undefined
   * when the settings step was NEVER OPENED this session.
   */
  capturedOverrides: JsonObject | undefined;
  /** The binding's STORED config_overrides as loaded (the wipe-guard fallback). */
  storedOverrides: JsonObject | null;
  /**
   * P14 — "run instantly", as the screen may offer it. Passed straight through:
   * the screen only ever hands `true` here when the live eligibility fact says
   * the mapping leaves nothing to ask, and the server re-checks it anyway. Null
   * = this binding has no opinion.
   */
  autoRun?: boolean | null;
}

export function buildBindingSavePayload(args: SavePayloadArgs): MandateBindingInput {
  const {
    holder,
    hasOffer,
    consumptionMap,
    capturedOverrides,
    storedOverrides,
    autoRun = null,
  } = args;

  const configOverridesFor = () =>
    capturedOverrides !== undefined
      ? Object.keys(capturedOverrides).length > 0
        ? capturedOverrides
        : null
      : storedOverrides;

  // A WORKFLOW Holder carries no agent identity at all — the server 422s on
  // any agent field beside `holder_id`, and the two must never share a slot.
  if (holder.kind === "workflow") {
    return {
      holderType: "workflow",
      holderId: holder.workflowId,
      holderVersionId: holder.workflowVersionId ?? null,
      useLatest: holder.workflowVersionId == null,
      agentId: null,
      agentVersionId: null,
      configOverrides: configOverridesFor(),
      consumptionMap: hasOffer ? consumptionMap : undefined,
      autoRun,
    };
  }

  if (holder.agentId && holder.agentVersionId) {
    // Never trust a UI state that drifted into both — refuse client-side with
    // the same rule the server enforces, before any network call.
    throw new Error(
      "A binding names ONE holder reference: a floating agent or a pinned version, never both.",
    );
  }

  const configOverrides = configOverridesFor();

  return {
    holderType: "agent",
    agentId: holder.agentId,
    agentVersionId: holder.agentVersionId,
    useLatest: holder.useLatest,
    configOverrides,
    // A mandate that offers NOTHING: the field must be ABSENT from the wire
    // (undefined), not an empty map — bindings.py 422s on any non-None map
    // when there is nothing to consume from.
    consumptionMap: hasOffer ? consumptionMap : undefined,
    autoRun,
  };
}

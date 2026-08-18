/**
 * Surface manifest — Credential Vault (`matrx-user/vault`).
 *
 * `/vault`: where the user manages their stored credentials
 * (`features/secrets/**`).
 *
 * Declared 2026-08-17 to close an undeclared route — and declared
 * DELIBERATELY NARROW. A vault entry's secret value is NOT a surface value and
 * must never become one: only the non-secret shape of the vault (how many
 * entries exist, what they are named, which providers they cover) is declared
 * here, so that an agent bound to this page can help the user organize
 * credentials without any path by which a secret reaches a model.
 *
 * Curated groups (band 0-899):
 *   vault_inventory  Non-secret shape of the user's vault
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "vault_inventory",
    label: "Vault inventory",
    sortOrder: 100,
    description:
      "The non-secret shape of the user's vault — never any credential value.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "credential_count",
    label: "Credential count",
    description:
      "How many credentials the user has stored. Always populated — zero on an empty vault.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 100,
    group: "vault_inventory",
  },
  {
    name: "credential_labels",
    label: "Credential labels",
    description:
      "The user-facing NAMES of the stored credentials, in display order — names only, never values. Always populated; empty array on an empty vault.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 110,
    group: "vault_inventory",
  },
  {
    name: "credential_providers",
    label: "Credential providers",
    description:
      "Distinct provider identifiers the stored credentials cover (never keys or tokens). Always populated; empty array on an empty vault.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 120,
    group: "vault_inventory",
  },
];

export const vaultManifest: SurfaceManifest = {
  surfaceName: "matrx-user/vault",
  readiness: "stub",
  readinessNote:
    "Deliberately narrow non-secret vocabulary declared 2026-08-17 to close the undeclared /vault route. Secret values are intentionally NOT declarable here; no runtime emitter is wired.",
  label: "Credential Vault",
  urlPattern: "/vault",
  intro: `<surface_intro>
You are on the Credential Vault: where the user manages the credentials the platform stores on their behalf.
You can see only the NON-SECRET shape of this vault — how many credentials exist, what they are called, and which providers they cover. No credential value is available to you here, by design, and you must never ask the user to paste one into a conversation.
Help with naming, organizing, and spotting gaps or duplicates. Anything that requires the secret itself belongs in the vault UI, performed by the user.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** Type-safe payload helper — required keys mirror `alwaysAvailable: true`. */
export function createVaultScope(values: {
  credential_count: number;
  credential_labels: string[];
  credential_providers: string[];
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

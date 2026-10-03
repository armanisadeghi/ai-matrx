/**
 * THE DEFECT THIS GUARDS: a write product can silently select the wrong Google
 * product or over-request scopes, or lose the organization needed by its first
 * action. The expected requests below come from Google's documented write
 * scopes plus the provider's identity bundle.
 */

import { GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";
import { buildConsentPlan } from "../consent-plan";
import type { ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const writeProducts = [
  {
    key: "contacts_edits",
    capabilityKey: "contacts_write",
    scope: GOOGLE_SCOPE.contactsWrite,
    forbiddenScopes: [GOOGLE_SCOPE.contactsReadonly, GOOGLE_SCOPE.tasksWrite],
    action: {
      kind: "overlay",
      overlayId: "googleContactsImportWindow",
      needs: ["organizationId"],
    },
  },
  {
    key: "tasks_changes",
    capabilityKey: "tasks_write",
    scope: GOOGLE_SCOPE.tasksWrite,
    forbiddenScopes: [GOOGLE_SCOPE.tasksReadonly, GOOGLE_SCOPE.contactsWrite],
    action: {
      kind: "overlay",
      overlayId: "googleTasksImportWindow",
      needs: ["organizationId"],
    },
  },
] as const;

function catalog(
  capabilityKey: string,
  eligible: boolean,
): ConnectorCapabilityRollout[] {
  return [
    {
      capabilityKey,
      // The server uses pending for capabilities limited to approved testers.
      phase: "pending",
      eligible,
      requiredScopes: [],
      ineligibleReason: eligible ? null : "Not enabled for this account",
    },
  ];
}

describe.each(writeProducts)("Google $key consent selection", (product) => {
  it("requests only its write scope, its server capability, and identity for an admitted tester", () => {
    const selected = GOOGLE_CONNECTOR_PROVIDER.products.find(
      (candidate) => candidate.key === product.key,
    );
    expect(selected?.capabilityKeys).toEqual([product.capabilityKey]);
    expect(selected?.scopes).toEqual([
      ...GOOGLE_IDENTITY_SCOPES,
      product.scope,
    ]);
    expect(selected?.firstAction).toMatchObject(product.action);

    const plan = buildConsentPlan({
      provider: GOOGLE_CONNECTOR_PROVIDER,
      selectedProductKeys: [product.key],
      account: null,
      rollout: catalog(product.capabilityKey, true),
    });

    expect(plan.request?.capabilityKeys).toEqual([product.capabilityKey]);
    expect(new Set(plan.request?.scopes)).toEqual(
      new Set([...GOOGLE_IDENTITY_SCOPES, product.scope]),
    );
    expect(plan.request?.scopes).toEqual(
      expect.not.arrayContaining(product.forbiddenScopes),
    );
  });

  it("cannot request the write scope when the server disables it or has not returned it", () => {
    for (const rollout of [
      catalog(product.capabilityKey, false),
      [] satisfies ConnectorCapabilityRollout[],
    ]) {
      const plan = buildConsentPlan({
        provider: GOOGLE_CONNECTOR_PROVIDER,
        selectedProductKeys: [product.key],
        account: null,
        rollout,
      });

      expect(plan.request).toBeNull();
      expect(plan.blocked.map((row) => row.productKey)).toEqual([product.key]);
    }
  });
});

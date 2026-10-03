"use client";

import { ConnectorConsentBody } from "@/features/connectors/ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

const provider = {
  ...GOOGLE_CONNECTOR_PROVIDER,
  products: GOOGLE_CONNECTOR_PROVIDER.products.filter((product) =>
    ["gmail_read", "contacts_write", "tasks_write"].includes(product.key),
  ),
};

export default function GoogleAccessFixture() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-3 text-xl font-semibold">Simulated connection inventory — local UI verification only</h1>
      <p className="mb-4 text-sm">This fixture does not prove Google permission or provider operations. Do not submit its consent.</p>
      <ConnectorConsentBody
        provider={provider}
        accounts={[{
          id: "cedar-fixture-account",
          label: "Cedar review account",
          ownerKind: "person",
          organizationId: null,
          providerSubject: "cedar-fixture-subject",
          grantedScopes: [GOOGLE_SCOPE.gmailModify],
          usable: true,
          statusLabel: "Connected",
          statusReason: "Simulated fixture account",
          statusRemedy: null,
          lastVerifiedAt: null,
          lastRefusalSentence: null,
        }]}
        rollout={provider.products.map((product) => ({
          capabilityKey: product.capabilityKeys[0],
          phase: "pending",
          eligible: true,
          requiredScopes: product.scopes.filter((scope) => !provider.identityScopes.includes(scope)),
          ineligibleReason: null,
        }))}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => undefined}
        initialAccountId="cedar-fixture-account"
        initialProductKeys={[]}
      />
    </main>
  );
}

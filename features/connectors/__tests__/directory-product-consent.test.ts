import { GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";
import { buildConsentPlan } from "../consent-plan";
import {
  GOOGLE_CONNECTOR_PROVIDER,
  userOwnedGoogleProductNames,
} from "../provider-config";

const rollout = [
  {
    capabilityKey: "directory",
    phase: "pending" as const,
    eligible: true,
    requiredScopes: [GOOGLE_SCOPE.directoryReadonly],
    ineligibleReason: null,
  },
];

it("selects Directory with only identity and directory.readonly", () => {
  const product = GOOGLE_CONNECTOR_PROVIDER.products.find(
    (candidate) => candidate.key === "directory",
  );
  expect(product).toMatchObject({
    capabilityKeys: ["directory"],
    firstAction: {
      kind: "overlay",
      overlayId: "googleContactsImportWindow",
      data: { initialView: "directory" },
      needs: ["organizationId"],
    },
  });
  expect(product?.scopes).toEqual([
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.directoryReadonly,
  ]);

  const plan = buildConsentPlan({
    provider: GOOGLE_CONNECTOR_PROVIDER,
    selectedProductKeys: ["directory"],
    account: null,
    rollout,
  });
  expect(plan.request?.capabilityKeys).toEqual(["directory"]);
  expect(plan.request?.scopes).toEqual([
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.directoryReadonly,
  ]);
  expect(plan.request?.scopes).not.toContain(GOOGLE_SCOPE.contactsReadonly);
  expect(plan.request?.scopes).not.toContain(GOOGLE_SCOPE.contactsWrite);
  expect(plan.request?.scopes).not.toContain(
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
  );
});

it("keeps every user-owned product in a mixed-selection refusal", () => {
  expect(
    userOwnedGoogleProductNames(["workspace_files", "meet", "directory"]),
  ).toEqual(["Google Meet review", "Workspace Directory"]);
});

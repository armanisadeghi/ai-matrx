/**
 * THE DEFECT THIS GUARDS: a write product can silently select the wrong Google
 * product or over-request scopes, or lose the organization needed by its first
 * action. The expected requests below come from Google's documented write
 * scopes plus the provider's identity bundle.
 */

import { GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";
import { buildConsentPlan } from "../consent-plan";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER, scopeLanguage } from "../provider-config";

const writeProducts = [
  {
    key: "calendar_changes",
    capabilityKey: "calendar_write",
    scope: GOOGLE_SCOPE.calendarEventsWrite,
    additionalScopes: [GOOGLE_SCOPE.calendarListReadonly],
    forbiddenScopes: [
      GOOGLE_SCOPE.calendarEventsReadonly,
      GOOGLE_SCOPE.calendarEventsOwnedReadonly,
      GOOGLE_SCOPE.contactsWrite,
      GOOGLE_SCOPE.tasksWrite,
    ],
    action: {
      kind: "overlay",
      overlayId: "googleAgendaWindow",
      needs: ["organizationId"],
    },
  },
  {
    key: "contacts_edits",
    capabilityKey: "contacts_write",
    scope: GOOGLE_SCOPE.contactsWrite,
    additionalScopes: [],
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
    additionalScopes: [],
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
      ...product.additionalScopes,
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
      new Set([
        ...GOOGLE_IDENTITY_SCOPES,
        ...product.additionalScopes,
        product.scope,
      ]),
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

it("explains Calendar event-write reach in plain language without overstating app actions", () => {
  expect(scopeLanguage(GOOGLE_CONNECTOR_PROVIDER, GOOGLE_SCOPE.calendarEventsWrite)).toBe(
    "Google permits viewing and editing events on all your calendars. AI Matrx only runs the exact create, move, cancel, or RSVP you review",
  );
});


// Google Events.list accepts calendar.events; combining reads and writes must
// not newly request redundant event-read access or discard a held literal grant.
const calendarRollout = [
  ...catalog("calendar_shared", true),
  ...catalog("calendar_write", true),
];
function calendarAccount(scopes: string[]): ConnectorAccount {
  return { id: "calendar-test", label: "Cedar review", ownerKind: "person",
    organizationId: null, providerSubject: "cedar-subject", grantedScopes: scopes,
    usable: true, statusLabel: "Connected", statusReason: "Connected",
    statusRemedy: null, lastVerifiedAt: null, lastRefusalSentence: null };
}
it("newly requests only list and write when both Calendar products are selected", () => {
  const plan = buildConsentPlan({ provider: GOOGLE_CONNECTOR_PROVIDER,
    selectedProductKeys: ["calendar_shared", "calendar_changes"], account: null, rollout: calendarRollout });
  expect(new Set(plan.request?.scopes)).toEqual(new Set([...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.calendarListReadonly, GOOGLE_SCOPE.calendarEventsWrite]));
  expect(plan.request?.capabilityKeys).toEqual(["calendar_shared", "calendar_write"]);
  expect(plan.request?.addedScopes).not.toContain(GOOGLE_SCOPE.calendarEventsReadonly);
});
it("retains held event-read access while adding Calendar writes", () => {
  const plan = buildConsentPlan({ provider: GOOGLE_CONNECTOR_PROVIDER,
    selectedProductKeys: ["calendar_shared", "calendar_changes"],
    account: calendarAccount([GOOGLE_SCOPE.calendarListReadonly, GOOGLE_SCOPE.calendarEventsReadonly]),
    rollout: calendarRollout });
  expect(plan.request?.scopes).toContain(GOOGLE_SCOPE.calendarEventsReadonly);
  expect(plan.request?.scopes).toContain(GOOGLE_SCOPE.calendarEventsWrite);
  expect(plan.request?.addedScopes).toEqual([GOOGLE_SCOPE.calendarEventsWrite]);
});
it("uses already-held Calendar write access for reads without another approval", () => {
  const plan = buildConsentPlan({ provider: GOOGLE_CONNECTOR_PROVIDER,
    selectedProductKeys: ["calendar_shared"],
    account: calendarAccount([GOOGLE_SCOPE.calendarListReadonly, GOOGLE_SCOPE.calendarEventsWrite]),
    rollout: calendarRollout });
  expect(plan.request).toBeNull();
  expect(plan.alreadyGranted.map(p => p.key)).toEqual(["calendar_shared"]);
});
it("keeps read-only selection narrow", () => {
  const plan = buildConsentPlan({ provider: GOOGLE_CONNECTOR_PROVIDER,
    selectedProductKeys: ["calendar_shared"], account: null, rollout: calendarRollout });
  expect(new Set(plan.request?.scopes)).toEqual(new Set([...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.calendarListReadonly, GOOGLE_SCOPE.calendarEventsReadonly]));
  expect(plan.request?.scopes).not.toContain(GOOGLE_SCOPE.calendarEventsWrite);
});


describe("Search Console management coverage", () => {
  const rollout = [...catalog("search_console", true), ...catalog("search_console_write", true)];
  it("asks only for full access when both Search Console products are newly selected", () => {
    const plan = buildConsentPlan({provider: GOOGLE_CONNECTOR_PROVIDER,
      selectedProductKeys: ["search_console", "search_console_write"], account: null, rollout});
    expect(new Set(plan.request?.scopes)).toEqual(new Set([...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.webmasters]));
    expect(plan.request?.capabilityKeys).toEqual(["search_console", "search_console_write"]);
    expect(plan.request?.addedScopes).not.toContain(GOOGLE_SCOPE.webmastersReadonly);
  });
  it("preserves held read-only access while adding management", () => {
    const plan = buildConsentPlan({provider: GOOGLE_CONNECTOR_PROVIDER,
      selectedProductKeys: ["search_console", "search_console_write"],
      account: calendarAccount([GOOGLE_SCOPE.webmastersReadonly]), rollout});
    expect(plan.request?.scopes).toContain(GOOGLE_SCOPE.webmastersReadonly);
    expect(plan.request?.addedScopes).toEqual([GOOGLE_SCOPE.webmasters]);
  });
  it("uses held management access for Search Console reads without another approval", () => {
    const plan = buildConsentPlan({provider: GOOGLE_CONNECTOR_PROVIDER,
      selectedProductKeys: ["search_console"], account: calendarAccount([GOOGLE_SCOPE.webmasters]), rollout});
    expect(plan.request).toBeNull();
    expect(plan.alreadyGranted.map(product => product.key)).toEqual(["search_console"]);
  });
  it("keeps an ordinary read-only selection narrow", () => {
    const plan = buildConsentPlan({provider: GOOGLE_CONNECTOR_PROVIDER,
      selectedProductKeys: ["search_console"], account: null, rollout});
    expect(new Set(plan.request?.scopes)).toEqual(new Set([...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.webmastersReadonly]));
    expect(plan.request?.scopes).not.toContain(GOOGLE_SCOPE.webmasters);
  });
});

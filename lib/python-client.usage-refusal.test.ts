/** @jest-environment node */
/**
 * The regular request path (`lib/python-client` — `apiPost`/`postJson`, what
 * the CRM journalist-beat card and every typed-client caller use) answers the
 * usage gate's 402 the SAME way the chat stream and `callApi` do: the person
 * is held `over` and the upgrade dialog opens (`usageGate.refusal`), through
 * the one shared `noticeUsageRefusal`. Before 2026-10-05 this path only showed
 * the sentence; Redux never learned the person was over.
 *
 * Real: python-client, the usage-gate handler, the entitlements reducer.
 * Mocked: fetch (the live 402 body), the session token, diagnostics.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
    },
  },
  createClient: jest.fn(),
}));
jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));
jest.mock("@/features/entitlements/usage-gate/usageRead", () => ({
  readUsageSnapshot: jest.fn(async () => null),
}));

import { combineReducers, configureStore } from "@reduxjs/toolkit";
import entitlementsReducer from "@/features/entitlements/state/entitlementsSlice";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const store = configureStore({
  reducer: combineReducers({
    entitlements: entitlementsReducer,
    appContext: () => ({ organization_id: ORG, orgBootstrapResolved: true }),
    userAuth: () => ({ id: "87a6e699-3622-4869-8843-d0867456c0dd" }),
  }),
});

jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => store,
  getStoreSingleton: () => store,
}));

import { postJson } from "@/lib/python-client";

const SENTENCE =
  "You've reached your AI usage limit for now. Upgrade your plan to keep going.";
const WINDOW = {
  period: "week",
  limit: 6000000,
  used: 6334254,
  remaining: 0,
  resets_at: "2026-10-12T00:00:00+00:00",
  state: "over",
};
const USAGE = {
  scope: "user",
  subject_id: "87a6e699-3622-4869-8843-d0867456c0dd",
  plan_key: "personal-max-plus",
  plan_name: "Personal Max Plus",
  required_tier: "team",
  state: "over",
  enforced: true,
  near_ratio: 0.8,
  binding_period: "week",
  resets_at: WINDOW.resets_at,
  windows: [WINDOW],
  computed_at: "2026-10-05T23:19:07+00:00",
};
const LIVE_402 = {
  error: "usage_limit_reached",
  message: SENTENCE,
  fix_action: "upgrade_plan",
  required_tier: "team",
  plan_key: "personal-max-plus",
  state: "over",
  binding_period: "week",
  limit: WINDOW.limit,
  used: WINDOW.used,
  resets_at: WINDOW.resets_at,
  usage: USAGE,
};

function respond(status: number, body: unknown): void {
  global.fetch = jest.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

describe("python-client: a 402 usage refusal", () => {
  it("holds the person over and opens the upgrade dialog, keeping the sentence", async () => {
    respond(402, LIVE_402);
    await expect(
      postJson("/crm/parties/p/journalist-beat", { pitch: "x" }, { captureErrors: false }),
    ).rejects.toMatchObject({ status: 402, userMessage: SENTENCE });
    const gate = store.getState().entitlements.usageGate;
    expect(gate.state).toBe("over");
    expect(gate.refusal).not.toBeNull();
  });

  it("leaves an unrelated failure alone", async () => {
    const before = store.getState().entitlements.usageGate.refusal;
    respond(402, { error: "payment_method_required", message: "Add a card." });
    await expect(postJson("/billing/x", {}, { captureErrors: false })).rejects.toBeTruthy();
    expect(store.getState().entitlements.usageGate.refusal).toBe(before);
  });
});

/**
 * The cap-full 409 as the LIVE server puts it on the wire: the structured
 * detail's extra keys (`occupants`, `ceiling`) sit at the ROOT of the body,
 * beside the envelope's `error`/`message`/`user_message` and a null `details`.
 * Through the real python-client the person must still get the list with a
 * Stop button on each box (the bug: the list never rendered, only the sentence).
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
jest.mock("@/lib/services/fingerprint-service", () => ({ getCachedFingerprint: () => null }));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));
jest.mock("@/features/entitlements/usage-gate/usageRead", () => ({
  readUsageSnapshot: jest.fn(async () => null),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => ({
    getState: () => ({
      appContext: { organization_id: "884d1ce8-0000-4000-8000-000000000000", orgBootstrapResolved: true },
      userAuth: { id: "u1" },
    }),
    dispatch: jest.fn(),
  }),
}));
const submit = jest.fn(async () => ({ admitted: true }));
jest.mock("@/lib/sandbox/useSandboxLifecycleSubmission", () => ({
  useSandboxLifecycleSubmission: () => ({ submit }),
}));

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { capacityRefusalOf, startOwnPlanSignIn } from "@/features/ai-work/lib/ownPlan";
import { SandboxCapacityList } from "@/features/ai-work/components/SandboxCapacityList";

const SENTENCE = "All 5 of your 5 sandbox slots are in use. Stop one of your sandboxes to continue.";
const WIRE = {
  code: "sandbox_capacity_full",
  ceiling: 5,
  occupants: [
    { row_id: "r1", sandbox_id: "sbx-cd6d53863995", template: "bare", status: "running", organization_id: "884d1ce8-0000-4000-8000-000000000000", last_heartbeat_at: "2026-10-09T20:00:00Z" },
    { row_id: "r2", sandbox_id: "sbx-731d191d4e25", template: "aidream", status: "running" },
  ],
  error: "sandbox_capacity_full",
  message: SENTENCE,
  user_message: SENTENCE,
  details: null,
  request_id: "req-1",
};

describe("cap-full 409 on the wire", () => {
  it("keeps the occupants through the real client and renders a Stop per box", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify(WIRE), { status: 409, headers: { "Content-Type": "application/json" } }),
    ) as unknown as typeof fetch;

    const cause = await startOwnPlanSignIn("claude_code", "primary").then(
      () => null,
      (e: unknown) => e,
    );
    console.log("CAUSE", cause instanceof Error ? cause.constructor.name : typeof cause, JSON.stringify(cause), (cause as {details?: unknown})?.details);
    const refusal = capacityRefusalOf(cause);
    expect(refusal?.occupants).toHaveLength(2);

    const onStopped = jest.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SandboxCapacityList capacity={refusal!} onStopped={onStopped} />);
    });
    expect(host.textContent).toContain(SENTENCE);
    const buttons = Array.from(host.querySelectorAll("button")).filter((b) =>
      (b.getAttribute("aria-label") ?? "").startsWith("Stop sbx-"),
    );
    expect(buttons).toHaveLength(2);

    await act(async () => {
      buttons[0].click();
    });
    expect(submit).toHaveBeenCalledWith({ rowId: "r1", sandboxId: "sbx-cd6d53863995", kind: "stop" });
    expect(onStopped).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});

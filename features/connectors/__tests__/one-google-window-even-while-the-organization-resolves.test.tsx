/**
 * 🚨 THE ONE-WINDOW LOCK COVERS EVERY AWAIT IN THE RUNNER — INCLUDING THE
 * ORGANIZATION WAIT (Bugbot MEDIUM on d9dbbc61, lane F-89).
 *
 * `useGoogleConsentRunner().run` guards "one Google authorization window at a
 * time" with a ref. F-89 gave it an organization WAIT, so a press on a cold load
 * no longer refuses on a boot race — and took the lock AFTER that wait. The wait
 * is the longest await in the function (multi-second on a cold load, which is
 * the whole reason it exists), so a second press inside it walked straight past
 * `running.current` and Google opened a SECOND authorization window: two
 * consent popups, two exchanges, for one intent.
 *
 * This pins both halves of the repair:
 *
 *   1. the lock is taken on the line after the guard, so a second press DURING
 *      the organization wait is refused and Google is asked exactly once;
 *   2. a refused wait RELEASES the lock — a press that never opened a window
 *      must not leave the runner stuck for the rest of the session.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The organization wait, held open by the test so two presses can overlap.
 * EVERY pending wait is released together — one press per resolver would let a
 * second `run` sit on its own promise and the defect would read as a timeout
 * instead of what it is: two Google windows for one intent.
 */
const pendingWaits: ((value: unknown) => void)[] = [];
let workspaceReady = true;
const authorizationCalls: string[][] = [];

jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitEffectiveOrganizationId: () =>
    new Promise((resolve) => {
      pendingWaits.push(resolve);
    }),
}));

jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  useGoogleAPI: () => ({
    isGoogleLoaded: true,
    requestAuthorizationCode: async (scopes: string[]) => {
      authorizationCalls.push(scopes);
      return "auth-code";
    },
    startAuthorizationCodeRedirect: async () => undefined,
  }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "dddddddd-1111-2222-3333-444444444444",
  useAppDispatch: () => () => {},
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "dddddddd-1111-2222-3333-444444444444",
}));

const mutateAsync = jest.fn(async () => ({ connectionId: "connection-1" }));
jest.mock("@/features/marketing/google/hooks", () => ({
  useConnectGoogle: () => ({ mutateAsync }),
  useGoogleCapabilities: () => ({ data: null, isLoading: false }),
  useGoogleConnectionInventory: () => ({ data: null, isLoading: false, refetch: async () => {} }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useGoogleConsentRunner } = require("@/features/connectors/google-adapter") as {
  useGoogleConsentRunner: () => {
    run: (
      request: { scopes: string[]; capabilityKeys: string[]; targetAccountId?: string | null },
      options: { owner: { type: "user" }; loginHint: string | null },
    ) => Promise<{ connectionId: string }>;
  };
};

function mountRunner(): { run: ReturnType<typeof useGoogleConsentRunner>["run"]; unmount: () => void } {
  let captured: ReturnType<typeof useGoogleConsentRunner> | null = null;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Probe() {
    captured = useGoogleConsentRunner();
    return null;
  }
  act(() => {
    root.render(<Probe />);
  });
  return {
    run: captured!.run,
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

/** Settle every organization wait taken so far. */
function releaseWorkspace(): void {
  const answer = workspaceReady
    ? { status: "ready", organizationId: "11111111-2222-3333-4444-555555555555" }
    : { status: "unavailable", reason: "We could not tell which workspace to file this in." };
  const waiting = pendingWaits.splice(0, pendingWaits.length);
  for (const resolve of waiting) resolve(answer);
}

const REQUEST = { scopes: ["https://www.googleapis.com/auth/drive.file"], capabilityKeys: ["drive_files"] };
const OPTIONS = { owner: { type: "user" as const }, loginHint: null };

describe("one Google authorization window, even while the organization resolves", () => {
  beforeEach(() => {
    authorizationCalls.length = 0;
    pendingWaits.length = 0;
    workspaceReady = true;
    mutateAsync.mockClear();
  });

  it("refuses a second press made DURING the organization wait", async () => {
    const runner = mountRunner();
    try {
      const first = runner.run(REQUEST, OPTIONS);
      // The wait is still pending — this is the window the lock has to cover.
      const second = runner.run(REQUEST, OPTIONS).then(
        () => "opened a SECOND window",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      releaseWorkspace();
      expect(await second).toBe("A Google authorization window is already open.");
      await expect(first).resolves.toEqual({ connectionId: "connection-1" });
      // Google was asked EXACTLY once.
      expect(authorizationCalls).toHaveLength(1);
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    } finally {
      runner.unmount();
    }
  });

  it("a refused wait releases the lock, so the next press runs", async () => {
    const runner = mountRunner();
    try {
      workspaceReady = false;
      const refused = runner.run(REQUEST, OPTIONS);
      releaseWorkspace();
      await expect(refused).rejects.toThrow(/could not tell which workspace/);
      expect(authorizationCalls).toHaveLength(0);

      // The lock is free: the next press opens the window it asked for.
      workspaceReady = true;
      const second = runner.run(REQUEST, OPTIONS);
      releaseWorkspace();
      await expect(second).resolves.toEqual({ connectionId: "connection-1" });
      expect(authorizationCalls).toHaveLength(1);
    } finally {
      runner.unmount();
    }
  });
});

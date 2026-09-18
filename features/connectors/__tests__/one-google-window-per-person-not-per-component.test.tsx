/**
 * 🚨 ONE GOOGLE AUTHORIZATION WINDOW PER PERSON — NOT PER COMPONENT
 * (V-23 NEW-3, lane F-103).
 *
 * F-89 put a lock in `useGoogleConsentRunner` and covered the organization wait
 * with it. The lock was a `useRef`, so it lived per MOUNTED COMPONENT: Settings →
 * Connectors and the consent dialog are both mounted in a normal session, each
 * held its own ref, and each opened its own Google consent window for one
 * person's one intent — two popups, two exchanges. Seventeen further call sites
 * held no lock at all.
 *
 * The gate is now module state shared by every authorization call site. This
 * pins the part a ref could never do:
 *
 *   1. TWO separate runner instances pressing in the same tick ask Google
 *      EXACTLY ONCE — the second is refused, by its sentence, not dropped;
 *   2. the refusal reaches the second component even while the FIRST is still
 *      inside its organization wait (the multi-second gap);
 *   3. a finished window RELEASES the gate, for any component, so the platform
 *      does not wedge for the session.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pendingWaits: ((value: unknown) => void)[] = [];
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
      request: { scopes: string[]; capabilityKeys: string[] },
      options: { owner: { type: "user" }; loginHint: string | null },
    ) => Promise<{ connectionId: string }>;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  GOOGLE_AUTHORIZATION_BUSY_MESSAGE,
  googleAuthorizationGateIsHeld,
  resetGoogleAuthorizationGateForTests,
} = require("@/providers/google-provider/googleAuthorizationGate") as {
  GOOGLE_AUTHORIZATION_BUSY_MESSAGE: string;
  googleAuthorizationGateIsHeld: () => boolean;
  resetGoogleAuthorizationGateForTests: () => void;
};

type Runner = ReturnType<typeof useGoogleConsentRunner>;

/** A SEPARATE mounted component with its own hook instance — the whole point. */
function mountRunner(): { runner: Runner; unmount: () => void } {
  let captured: Runner | null = null;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Probe() {
    captured = useGoogleConsentRunner();
    return null;
  }
  act(() => {
    root.render(<Probe />);
  });
  return { runner: captured!, unmount: () => act(() => root.unmount()) };
}

function releaseWorkspace(): void {
  const answer = {
    status: "ready",
    organizationId: "11111111-2222-3333-4444-555555555555",
  };
  for (const resolve of pendingWaits.splice(0, pendingWaits.length)) resolve(answer);
}

const REQUEST = {
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  capabilityKeys: ["drive_files"],
};
const OPTIONS = { owner: { type: "user" as const }, loginHint: null };

describe("one Google authorization window per person, not per component", () => {
  beforeEach(() => {
    authorizationCalls.length = 0;
    pendingWaits.length = 0;
    mutateAsync.mockClear();
    resetGoogleAuthorizationGateForTests();
  });

  it("two mounted components pressing in the same tick ask Google exactly once", async () => {
    const settings = mountRunner();
    const dialog = mountRunner();
    try {
      const first = settings.runner.run(REQUEST, OPTIONS);
      // A DIFFERENT component instance: under the old useRef this pressed
      // straight through and Google opened a second window.
      const second = dialog.runner.run(REQUEST, OPTIONS).then(
        () => "opened a SECOND window",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );

      // Still inside the FIRST press's organization wait. A refusal has to come
      // back NOW; racing it against a short sentinel is what turns the old
      // behaviour into a stated failure instead of a five-second timeout — the
      // second press used to sail past the ref and sit on its own wait, which
      // IS the second window.
      const verdict = await Promise.race([
        second,
        new Promise<string>((resolve) =>
          setTimeout(
            () =>
              resolve(
                "the second press was NOT refused — it went on to open its own Google window",
              ),
            50,
          ),
        ),
      ]);
      expect(verdict).toBe(GOOGLE_AUTHORIZATION_BUSY_MESSAGE);
      // Only ONE press ever reached the organization wait.
      expect(pendingWaits).toHaveLength(1);

      releaseWorkspace();
      await expect(first).resolves.toEqual({ connectionId: "connection-1" });
      expect(authorizationCalls).toHaveLength(1);
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    } finally {
      settings.unmount();
      dialog.unmount();
    }
  });

  it("a finished window releases the gate for every component", async () => {
    const settings = mountRunner();
    const dialog = mountRunner();
    try {
      const first = settings.runner.run(REQUEST, OPTIONS);
      releaseWorkspace();
      await expect(first).resolves.toEqual({ connectionId: "connection-1" });
      expect(googleAuthorizationGateIsHeld()).toBe(false);

      // The OTHER component now gets its window.
      const second = dialog.runner.run(REQUEST, OPTIONS);
      releaseWorkspace();
      await expect(second).resolves.toEqual({ connectionId: "connection-1" });
      expect(authorizationCalls).toHaveLength(2);
    } finally {
      settings.unmount();
      dialog.unmount();
    }
  });

  it("an unmounted component does not leave the gate held", async () => {
    const settings = mountRunner();
    const first = settings.runner.run(REQUEST, OPTIONS);
    releaseWorkspace();
    await expect(first).resolves.toEqual({ connectionId: "connection-1" });
    settings.unmount();
    expect(googleAuthorizationGateIsHeld()).toBe(false);
  });
});

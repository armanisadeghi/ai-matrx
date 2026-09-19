/**
 * 🚨 THE RAW PRIMITIVES THEMSELVES TAKE THE ONE-WINDOW GATE
 * (V-23 NEW-3, lane F-103).
 *
 * The gate is only a gate if it cannot be walked around. Every surface is routed
 * through `useGoogleAuthorizationWindow` and `check:google-auth-gate` keeps it
 * that way — but the last line of defence is here: `requestAuthorizationCode`
 * and `startAuthorizationCodeRedirect` take the gate themselves, so a caller
 * that forgets still cannot open a second Google window.
 *
 * This runs the REAL provider against a stubbed Google Identity Services client
 * (GIS does not load in the sandbox). What it pins:
 *
 *   1. two popup requests in the SAME TICK reach GIS exactly once — the state
 *      flag the provider used to read was stale in that tick and both went
 *      through;
 *   2. the refusal is the named sentence, not silence;
 *   3. the resolved window RELEASES the gate;
 *   4. the REDIRECT path takes the same gate — a popup press and a redirect
 *      press are one window between them, not one each.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GoogleAPIProvider = require("./GoogleApiProvider").default as React.ComponentType<{
  children: React.ReactNode;
}>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useGoogleAPI } = require("./GoogleApiProvider") as {
  useGoogleAPI: () => {
    isGoogleLoaded: boolean;
    error: string | null;
    requestAuthorizationCode: (scopes: string[]) => Promise<string>;
    startAuthorizationCodeRedirect: (
      scopes: string[],
      options: Record<string, unknown>,
    ) => Promise<void>;
    signIn: (scopes: string[]) => Promise<string | null>;
    requestScopes: (scopes: string[]) => Promise<boolean>;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  GOOGLE_AUTHORIZATION_BUSY_MESSAGE,
  googleAuthorizationGateIsHeld,
  resetGoogleAuthorizationGateForTests,
} = require("./googleAuthorizationGate") as {
  GOOGLE_AUTHORIZATION_BUSY_MESSAGE: string;
  googleAuthorizationGateIsHeld: () => boolean;
  resetGoogleAuthorizationGateForTests: () => void;
};

/** Every GIS code client the provider asked for, and how to answer it. */
type StubbedClient = {
  config: { callback?: (response: { code?: string }) => void };
  requested: boolean;
};
let clients: StubbedClient[] = [];

/**
 * The TOKEN clients — the other shape of Google window. `signIn` and
 * `requestScopes` open one of these, which is why they belong to the same gate.
 */
type StubbedTokenClient = {
  config: {
    callback?: (response: Record<string, unknown>) => void;
    error_callback?: (response: { type: string }) => void;
  };
  requested: boolean;
};
let tokenClients: StubbedTokenClient[] = [];

function installGoogleIdentityStub(): void {
  clients = [];
  tokenClients = [];
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initCodeClient: (config: StubbedClient["config"]) => {
          const client: StubbedClient = { config, requested: false };
          clients.push(client);
          return {
            requestCode: () => {
              client.requested = true;
            },
          };
        },
        initTokenClient: (config: StubbedTokenClient["config"]) => {
          const client: StubbedTokenClient = { config, requested: false };
          tokenClients.push(client);
          return {
            requestAccessToken: () => {
              client.requested = true;
            },
          };
        },
        revoke: (_token: string, done: () => void) => done(),
      },
    },
  };
  // The provider short-circuits its script loader when the GIS tag is already
  // in the document, which is the only way to reach `isGoogleLoaded` offline.
  if (
    !document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
  ) {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    document.body.appendChild(script);
  }
}

function mountProvider(): {
  api: () => ReturnType<typeof useGoogleAPI>;
  unmount: () => void;
} {
  let captured: ReturnType<typeof useGoogleAPI> | null = null;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Probe() {
    captured = useGoogleAPI();
    return null;
  }
  act(() => {
    root.render(
      <GoogleAPIProvider>
        <Probe />
      </GoogleAPIProvider>,
    );
  });
  return { api: () => captured!, unmount: () => act(() => root.unmount()) };
}

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const REDIRECT_OPTIONS = {
  owner: { type: "user" as const },
  organizationContextId: "11111111-2222-3333-4444-555555555555",
};

/**
 * 🚨 A PRESS IS DELIBERATELY *NOT* WRAPPED IN `act`.
 *
 * `act` flushes React state between the two presses, so the second one would
 * read a freshly rendered `authInProgress === true` and refuse — which is
 * exactly the false green the old code gave. The defect is two presses inside
 * ONE render: both read the stale `false` from the same closure. Calling
 * straight through reproduces that, at the cost of React's
 * "not wrapped in act(...)" warnings on stdout, which are noise here, not a
 * finding.
 */
function press<T>(start: () => Promise<T>): Promise<T> {
  return start();
}

function reasonOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "no refusal — a SECOND Google window was opened",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

describe("the provider primitives take the one-window gate themselves", () => {
  beforeEach(() => {
    resetGoogleAuthorizationGateForTests();
    installGoogleIdentityStub();
  });

  it("two popup requests in the same tick reach Google exactly once", async () => {
    const mounted = mountProvider();
    try {
      expect(mounted.api().isGoogleLoaded).toBe(true);

      const first = press(() => mounted.api().requestAuthorizationCode(SCOPES));
      const second = reasonOf(
        press(() => mounted.api().requestAuthorizationCode(SCOPES)),
      );

      expect(await second).toBe(GOOGLE_AUTHORIZATION_BUSY_MESSAGE);
      expect(clients).toHaveLength(1);
      expect(clients[0].requested).toBe(true);

      // Google answers the one window it was asked for.
      await act(async () => {
        clients[0].config.callback?.({ code: "auth-code" });
      });
      await expect(first).resolves.toBe("auth-code");
      expect(googleAuthorizationGateIsHeld()).toBe(false);

      // The gate is free, so the next press gets its window.
      const third = press(() => mounted.api().requestAuthorizationCode(SCOPES));
      expect(clients).toHaveLength(2);
      await act(async () => {
        clients[1].config.callback?.({ code: "auth-code-2" });
      });
      await expect(third).resolves.toBe("auth-code-2");
    } finally {
      mounted.unmount();
    }
  });

  it("a redirect press and a popup press are ONE window between them", async () => {
    const mounted = mountProvider();
    try {
      const popup = press(() => mounted.api().requestAuthorizationCode(SCOPES));
      const redirect = reasonOf(
        press(() =>
          mounted.api().startAuthorizationCodeRedirect(SCOPES, REDIRECT_OPTIONS),
        ),
      );
      expect(await redirect).toBe(GOOGLE_AUTHORIZATION_BUSY_MESSAGE);
      expect(clients).toHaveLength(1);

      await act(async () => {
        clients[0].config.callback?.({ code: "auth-code" });
      });
      await expect(popup).resolves.toBe("auth-code");
    } finally {
      mounted.unmount();
    }
  });

  it("a dismissed window releases the gate", async () => {
    const mounted = mountProvider();
    try {
      const first = reasonOf(
        press(() => mounted.api().requestAuthorizationCode(SCOPES)),
      );
      await act(async () => {
        (
          clients[0].config as {
            error_callback?: (response: { type: string }) => void;
          }
        ).error_callback?.({ type: "popup_closed" });
      });
      expect(await first).toBe(
        "Google authorization was closed before it finished.",
      );
      expect(googleAuthorizationGateIsHeld()).toBe(false);
    } finally {
      mounted.unmount();
    }
  });
});

/**
 * 🚨 THE TOKEN-WINDOW PRIMITIVES TAKE THE SAME GATE (the F-103 class, finished).
 *
 * F-103 routed nineteen call sites through the gate and made
 * `requestAuthorizationCode` / `startAuthorizationCodeRedirect` take it
 * themselves — but `signIn` and `requestScopes` were left behind the very guard
 * F-103 proved was not one: `if (authInProgress)`, a state flag read from a
 * rendered closure. Two presses in one tick both saw the stale `false`, and
 * `signIn` is what a "Connect Google" button and the presentation export call.
 * So there were still two locks and one of them was not a lock.
 *
 * Both now take the ONE module-level gate, and because their contracts are
 * `string | null` / `boolean` — called straight from a button's `onClick`, where
 * a throw would be an unhandled rejection — the refusal is surfaced on the
 * provider's own `error`, the channel every caller already shows, rather than
 * the `console.log` nobody reads.
 */
describe("signIn and requestScopes are on the same one-window gate", () => {
  beforeEach(() => {
    resetGoogleAuthorizationGateForTests();
    installGoogleIdentityStub();
  });

  it("two signIn presses in the same tick reach Google exactly once", async () => {
    const mounted = mountProvider();
    try {
      const first = press(() => mounted.api().signIn(SCOPES));
      const second = press(() => mounted.api().signIn(SCOPES));

      expect(await second).toBeNull();
      expect(tokenClients).toHaveLength(1);
      expect(tokenClients[0].requested).toBe(true);

      await act(async () => {
        tokenClients[0].config.callback?.({
          access_token: "token-1",
          expires_in: 3600,
          scope: SCOPES.join(" "),
        });
      });
      await expect(first).resolves.toBe("token-1");
      expect(googleAuthorizationGateIsHeld()).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  it("the refused press is TOLD — the named sentence, on the provider's error", async () => {
    const mounted = mountProvider();
    try {
      const first = press(() => mounted.api().signIn(SCOPES));
      await act(async () => {
        await mounted.api().signIn(SCOPES);
      });
      expect(mounted.api().error).toContain(GOOGLE_AUTHORIZATION_BUSY_MESSAGE);

      await act(async () => {
        tokenClients[0].config.callback?.({
          access_token: "token-1",
          expires_in: 3600,
          scope: SCOPES.join(" "),
        });
      });
      await first;
    } finally {
      mounted.unmount();
    }
  });

  it("a signIn press and an authorization-code press are ONE window between them", async () => {
    const mounted = mountProvider();
    try {
      const popup = press(() => mounted.api().requestAuthorizationCode(SCOPES));
      const token = press(() => mounted.api().signIn(SCOPES));

      expect(await token).toBeNull();
      expect(tokenClients).toHaveLength(0);
      expect(clients).toHaveLength(1);

      await act(async () => {
        clients[0].config.callback?.({ code: "auth-code" });
      });
      await expect(popup).resolves.toBe("auth-code");
    } finally {
      mounted.unmount();
    }
  });

  it("requestScopes is on the same gate, and a dismissed window releases it", async () => {
    const mounted = mountProvider();
    try {
      // `requestScopes` needs the token client `signIn` mints, so take one
      // window first and let Google answer it.
      const first = press(() => mounted.api().signIn(SCOPES));
      await act(async () => {
        tokenClients[0].config.callback?.({
          access_token: "token-1",
          expires_in: 3600,
          scope: SCOPES.join(" "),
        });
      });
      await first;
      expect(googleAuthorizationGateIsHeld()).toBe(false);

      const scopeRequest = press(() => mounted.api().requestScopes(SCOPES));
      expect(googleAuthorizationGateIsHeld()).toBe(true);
      const refused = press(() => mounted.api().signIn(["another.scope"]));
      expect(await refused).toBeNull();
      expect(tokenClients).toHaveLength(2);

      await act(async () => {
        tokenClients[1].config.error_callback?.({ type: "popup_closed" });
      });
      await expect(scopeRequest).resolves.toBe(false);
      expect(googleAuthorizationGateIsHeld()).toBe(false);
    } finally {
      mounted.unmount();
    }
  });
});

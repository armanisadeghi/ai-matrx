/**
 * DD-240 — MEET READS WHO IS ACTING FROM THE SESSION, AND THIS HOST NEVER TELLS
 * IT.
 *
 * THE DEFECT THIS WOULD HAVE CAUGHT, in the words the database used. This file
 * passed `selectUserId` — Redux's copy of the signed-in user — into
 * `<MeetProvider userId>`. That copy is written when the app boots and nothing
 * rewrites it when the domain-wide auth cookie rotates to another account, so a
 * tab left open went on issuing
 *
 *   communication.meet_pending_call_invites(p_user_id => <the stale copy>)
 *
 * while the JWT on the very same request named somebody else. PostgREST
 * answered 42501 at HTTP 403 and the function said it plainly: *"meet: the
 * acting user (4cf62e4e…) is not the authenticated user"*. Two rows on
 * production on 2026-09-14, from tabs 8.8 h and 32.9 h old (register DD-238
 * §1c, DD-240).
 *
 * 🚨 THIS TEST DRIVES THE REAL PACKAGE. It renders `<MeetHost>` — the app's one
 * Meet mount, unmocked — over the published `@ai-matrx/meet`, and asserts THE
 * ARGUMENT THAT REACHES THE CLIENT. That argument is the exact value the
 * database compares against `auth.uid()`, so this can only go green when the
 * real thing works. A test that asserted a prop instead would have been green
 * throughout the outage.
 *
 * RED PROOF (2026-09-14): against `@ai-matrx/meet` 0.5.16 — the version
 * installed while this was written — both cases fail. The 0.5.x provider needs
 * a `userId` prop to build a runtime at all, so with this host no longer
 * passing one it stays inert and `meet_pending_call_invites` is never issued.
 * Against 0.6.0 the package reads the session itself and both pass.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The package's realtime and session work is asynchronous by nature; 5 s is not
// enough head-room for two mounts on a cold transform.
jest.setTimeout(20_000);

const REDUX_COPY = "11111111-1111-4111-8111-111111111111";
const SESSION_USER = "22222222-2222-4222-8222-222222222222";
const SWITCHED_USER = "33333333-3333-4333-8333-333333333333";

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
let authListeners: Array<(event: string, session: unknown) => void> = [];
let sessionUser: string | null = SESSION_USER;

function sessionOf(id: string | null) {
  return id === null ? null : { user: { id }, access_token: "token" };
}

jest.mock("@/utils/supabase/client", () => {
  const table: Record<string, unknown> = {};
  Object.assign(table, {
    select: () => table,
    eq: () => table,
    order: () => table,
    limit: () => table,
    single: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
  });
  const channel: Record<string, unknown> = {};
  Object.assign(channel, {
    on: () => channel,
    subscribe: (callback?: (status: string) => void) => {
      callback?.("SUBSCRIBED");
      return channel;
    },
    send: () => undefined,
    track: () => undefined,
    untrack: () => undefined,
    presenceState: () => ({}),
    unsubscribe: async () => "ok",
  });
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { data: [], error: null };
  };
  return {
    supabase: {
      schema: () => ({ from: () => table, rpc }),
      from: () => table,
      rpc,
      channel: () => channel,
      removeChannel: () => undefined,
      auth: {
        getSession: async () => ({ data: { session: sessionOf(sessionUser) }, error: null }),
        onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
          authListeners.push(callback);
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  authListeners = authListeners.filter((listener) => listener !== callback);
                },
              },
            },
          };
        },
      },
    },
  };
});

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: () => unknown) => selector(),
  useAppStore: () => ({ getState: () => ({}) }),
}));

// THE STALE COPY, verbatim: Redux names one account for the whole test.
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => REDUX_COPY,
  selectDisplayName: () => "Ana Rivera",
  selectActiveUserAvatarUrl: () => null,
}));

jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => "44444444-4444-4444-8444-444444444444",
}));

jest.mock("@/features/meet/lib/meetBaseUrl", () => ({
  meetBaseUrl: () => "https://server.test",
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MeetHost } = require("./MeetHost") as typeof import("./MeetHost");

function pendingInviteUsers(): string[] {
  return rpcCalls
    .filter((call) => call.fn === "meet_pending_call_invites")
    .map((call) => String(call.args?.["p_user_id"]));
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountHost(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const element = (
    <MeetHost>
      <div>surface</div>
    </MeetHost>
  );
  await act(async () => {
    root?.render(element);
  });
}

/** Poll inside `act`, so React's queued work runs between attempts. */
async function until(condition: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(
    `${what} — never happened within ${timeoutMs}ms. ` +
      `meet_pending_call_invites was issued for: [${pendingInviteUsers().join(", ")}]`,
  );
}

describe("MeetHost identity comes from the session, never from Redux (DD-240)", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    authListeners = [];
    sessionUser = SESSION_USER;
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("asks for pending call invites as the SESSION's user while Redux names another account", async () => {
    await mountHost();
    await until(
      () => pendingInviteUsers().length > 0,
      "the package never asked for pending call invites",
    );
    expect(pendingInviteUsers()).toEqual([SESSION_USER]);
    // The 403 class, named: the stale copy must never reach the wire.
    expect(pendingInviteUsers()).not.toContain(REDUX_COPY);
  });

  it("follows an account switch under an open tab — the 32.9-hour tab, reproduced", async () => {
    await mountHost();
    await until(
      () => pendingInviteUsers().includes(SESSION_USER),
      "the first read never named the session's user",
    );

    await act(async () => {
      sessionUser = SWITCHED_USER;
      for (const listener of [...authListeners]) listener("SIGNED_IN", sessionOf(SWITCHED_USER));
    });

    await until(
      () => pendingInviteUsers().includes(SWITCHED_USER),
      "the switched-to account never reached the wire",
    );
    expect(pendingInviteUsers()).not.toContain(REDUX_COPY);
  });
});

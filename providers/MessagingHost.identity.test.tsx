/**
 * DD-241 — MESSAGING READS WHO IS ACTING FROM THE SESSION, AND THIS APP NEVER
 * TELLS IT. Not through the provider, and not through the service either.
 *
 * THE DEFECT THIS WOULD HAVE CAUGHT. Two doors in this repo handed
 * `@ai-matrx/messaging` a user id, and both were fed the same thing: Redux's
 * `selectUserId`, a copy written when the app boots that nothing rewrites when
 * the domain-wide auth cookie rotates to another account.
 *
 *   `providers/MessagingHost.tsx`  → `<MessagingProvider userId={…}>`
 *   `features/messaging/service/sendDirectActionMessage.ts`
 *                                  → `createMessagingRepository({ identity: { userId } })`
 *
 * The second one is the one V-110 found still open (finding F1) after DD-240
 * closed Meet's, and it is the worse of the two, because in messaging that copy
 * is not only a read argument — it is a WRITE argument. The package puts it on
 * the wire as `p_user1_id` (the direct-conversation pair the RPC requires the
 * caller to occupy), and as `sender_id` and `created_by` on the message row. So
 * after a sign-out/sign-in in the same tab the send was either refused at 403 —
 * `access denied: caller is not the target user` — or, where RLS let it
 * through, landed as the wrong person.
 *
 * 🚨 THESE TESTS DRIVE THE REAL PACKAGE. They render the app's one
 * `<MessagingHost>` and call the app's real `sendDirectActionMessage`, both over
 * the published `@ai-matrx/messaging`, and assert THE ARGUMENT THAT REACHES THE
 * CLIENT — the exact value the database compares against `auth.uid()` and the
 * exact value that would be written into the row. A test that asserted a prop,
 * or that the surface rendered, would have been green throughout.
 *
 * RED PROOF: against `@ai-matrx/messaging` 0.11.9 — the version installed while
 * this was written — every case fails, because 0.11.x takes the id the caller
 * hands it and this app no longer hands one: the provider stays inert and the
 * service's repository refuses for want of an org. Against 0.12.0 the package
 * reads the session itself and they pass.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.setTimeout(20_000);

/** Redux's copy. Nobody may put this on the wire. */
const REDUX_COPY = "11111111-1111-4111-8111-111111111111";
const SESSION_USER = "22222222-2222-4222-8222-222222222222";
const SWITCHED_USER = "33333333-3333-4333-8333-333333333333";
const ORG = "44444444-4444-4444-8444-444444444444";
const RECIPIENT = "55555555-5555-4555-8555-555555555555";

interface RpcCall {
  fn: string;
  args: Record<string, unknown> | undefined;
}
interface TableWrite {
  table: string;
  op: string;
  payload: unknown;
}

const rpcCalls: RpcCall[] = [];
const tableWrites: TableWrite[] = [];
let authListeners: Array<(event: string, session: unknown) => void> = [];
let sessionUser: string | null = SESSION_USER;

function sessionOf(id: string | null) {
  return id === null ? null : { user: { id }, access_token: "token" };
}

jest.mock("@/utils/supabase/client", () => {
  const builderFor = (table: string): Record<string, unknown> => {
    const row = {
      id: "66666666-6666-4666-8666-666666666666",
      conversation_id: "77777777-7777-4777-8777-777777777777",
      sender_id: sessionUser,
      organization_id: ORG,
      content: "hi",
      message_type: "text",
      status: "sent",
      created_at: "2026-09-14T00:00:00.000Z",
      metadata: {},
    };
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      insert: (payload: unknown) => {
        tableWrites.push({ table, op: "insert", payload });
        return builder;
      },
      update: (payload: unknown) => {
        tableWrites.push({ table, op: "update", payload });
        return builder;
      },
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: () => builder,
      lt: () => builder,
      gt: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: row, error: null }),
      maybeSingle: async () => ({ data: row, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    });
    return builder;
  };
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
    if (fn === "dm_get_or_create_direct_conversation") {
      return { data: "77777777-7777-4777-8777-777777777777", error: null };
    }
    return { data: [], error: null };
  };
  const supabase = {
    schema: () => ({ from: (table: string) => builderFor(table), rpc }),
    from: (table: string) => builderFor(table),
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
  };
  return { supabase, createClient: () => supabase };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
  usePathname: () => "/messages",
  useSearchParams: () => new URLSearchParams(),
}));

// A minimal store shape. Anything this host reads from Redux is app chrome or a
// settings scope — the identity under test comes from the session, not from here.
const REDUX_STATE = {
  userPreferences: { messaging: { sound: false, desktop: false } },
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(REDUX_STATE),
  useAppStore: () => ({ getState: () => REDUX_STATE }),
}));

// THE STALE COPY, verbatim: Redux names one account for the whole file.
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => REDUX_COPY,
  selectDisplayName: () => "Ana Rivera",
  selectActiveUserAvatarUrl: () => null,
}));

jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => ORG,
}));

jest.mock("@/lib/redux/preferences/userPreferenceSelectors", () => ({
  selectArchivedDefault: () => "hide",
}));

// The four messaging mandates and the transcript-cap knob are the AI seam, not
// the identity seam. Nothing here is under test; resolving them would drag the
// whole mandate + knob stack into a test about one user id.
jest.mock("@/features/messaging/lib/useMessagingIntelligences", () => ({
  useMessagingIntelligences: () => ({ agents: undefined, maxTranscriptMessages: undefined }),
}));

jest.mock("@/lib/api/matrx-transport", () => ({
  createMatrxTransport: () => ({ stream: async () => undefined }),
}));

jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: async () => ORG,
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

/** Every user id this app's messaging put on the wire, in order. */
function idsOnTheWire(): string[] {
  const ids: string[] = [];
  for (const call of rpcCalls) {
    for (const key of ["p_user_id", "p_user1_id"]) {
      const value = call.args?.[key];
      if (typeof value === "string") ids.push(value);
    }
  }
  for (const write of tableWrites) {
    const rows = Array.isArray(write.payload) ? write.payload : [write.payload];
    for (const row of rows) {
      if (row === null || typeof row !== "object") continue;
      for (const key of ["sender_id", "created_by", "updated_by"]) {
        const value = (row as Record<string, unknown>)[key];
        if (typeof value === "string") ids.push(value);
      }
    }
  }
  return ids;
}

function inboxReaders(): string[] {
  return rpcCalls
    .filter((call) => call.fn === "get_dm_conversations_with_details")
    .map((call) => String(call.args?.["p_user_id"]));
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountHost(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessagingHost } = require("./MessagingHost") as typeof import("./MessagingHost");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MessagingHost>
        <div>surface</div>
      </MessagingHost>,
    );
  });
}

/** Poll inside `act`, so React's queued work runs between attempts. */
async function until(condition: () => boolean, what: string, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(
    `${what} — never happened within ${timeoutMs}ms. ` +
      `Ids on the wire so far: [${idsOnTheWire().join(", ")}]`,
  );
}

beforeEach(() => {
  rpcCalls.length = 0;
  tableWrites.length = 0;
  authListeners = [];
  sessionUser = SESSION_USER;
});

afterEach(async () => {
  if (root !== null) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

describe("the messaging SERVICE sends as the session's user, never a handed-in copy (V-110 F1)", () => {
  it("a direct-action message names the SESSION's user in p_user1_id and sender_id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendDirectActionMessage } =
      require("@/features/messaging/service/sendDirectActionMessage") as typeof import("@/features/messaging/service/sendDirectActionMessage");

    await sendDirectActionMessage({
      recipientId: RECIPIENT,
      content: "Your agent needs attention.",
    });

    const pair = rpcCalls.find((call) => call.fn === "dm_get_or_create_direct_conversation");
    expect(pair?.args?.["p_user1_id"]).toBe(SESSION_USER);
    const insert = tableWrites.find(
      (write) => write.table === "dm_messages" && write.op === "insert",
    );
    const row = insert?.payload as Record<string, unknown>;
    expect(row["sender_id"]).toBe(SESSION_USER);
    expect(row["created_by"]).toBe(SESSION_USER);
    // The whole point: Redux's copy names somebody else and never reaches it.
    expect(idsOnTheWire()).not.toContain(REDUX_COPY);
  });

  it("a SIGN-OUT/SIGN-IN under the same tab moves the sender with the session", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendDirectActionMessage } =
      require("@/features/messaging/service/sendDirectActionMessage") as typeof import("@/features/messaging/service/sendDirectActionMessage");

    await sendDirectActionMessage({ recipientId: RECIPIENT, content: "first" });
    // The cookie rotates. Redux is untouched — that is the whole defect.
    sessionUser = SWITCHED_USER;
    for (const listener of [...authListeners]) listener("SIGNED_IN", sessionOf(SWITCHED_USER));
    await sendDirectActionMessage({ recipientId: RECIPIENT, content: "second" });

    const senders = tableWrites
      .filter((write) => write.table === "dm_messages" && write.op === "insert")
      .map((write) => String((write.payload as Record<string, unknown>)["sender_id"]));
    expect(senders).toEqual([SESSION_USER, SWITCHED_USER]);
    expect(idsOnTheWire()).not.toContain(REDUX_COPY);
  });

  it("nobody signed in is a refusal with a remedy, never a write as nobody", async () => {
    sessionUser = null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendDirectActionMessage } =
      require("@/features/messaging/service/sendDirectActionMessage") as typeof import("@/features/messaging/service/sendDirectActionMessage");

    const failure = await sendDirectActionMessage({
      recipientId: RECIPIENT,
      content: "nobody",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as { remedy?: string }).remedy ?? "").toMatch(/sign in/i);
    expect(tableWrites.filter((write) => write.op === "insert")).toHaveLength(0);
  });
});

describe("MessagingHost identity comes from the session, never from Redux (DD-241)", () => {
  it("reads the inbox as the SESSION's user while Redux names another account", async () => {
    await mountHost();
    await until(() => inboxReaders().length > 0, "the package never read the inbox");
    // EVERY inbox read, not just the first: the engine issues page one and the
    // archived count through the same RPC, and both must name the same person.
    expect([...new Set(inboxReaders())]).toEqual([SESSION_USER]);
    expect(idsOnTheWire()).not.toContain(REDUX_COPY);
  });

  it("follows an account switch under an open tab", async () => {
    await mountHost();
    await until(
      () => inboxReaders().includes(SESSION_USER),
      "the first inbox read never named the session's user",
    );

    await act(async () => {
      sessionUser = SWITCHED_USER;
      for (const listener of [...authListeners]) listener("SIGNED_IN", sessionOf(SWITCHED_USER));
    });

    await until(
      () => inboxReaders().includes(SWITCHED_USER),
      "the switched-to account never reached the wire",
    );
    expect(idsOnTheWire()).not.toContain(REDUX_COPY);
  });

  it("a SIGNED-OUT tab issues no user-scoped read at all", async () => {
    sessionUser = null;
    await mountHost();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(inboxReaders()).toEqual([]);
    expect(idsOnTheWire()).toEqual([]);
  });
});

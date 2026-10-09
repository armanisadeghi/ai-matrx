/**
 * THE ONE HANDOVER (G2 guest data): every session replacement brings the browser's guest records into the
 * account it ends in (claim), sign-up keeps the same account (promotion, revive before and after), and a
 * failure screams and keeps the guest for the next try — never a silent orphan.
 */
jest.mock("server-only", () => ({}), { virtual: true });

const jar = new Map<string, string>();
const deleted: string[] = [];
jest.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => {
      deleted.push(name);
      jar.delete(name);
    },
  }),
}));

let claims: Record<string, unknown> | null = null;
jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }) } }),
}));

const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let rpcError: { message: string } | null = null;
let registry: { auth_user_id: string }[] = [];
let anonymousIds = new Set<string>();
let updateError: { message: string; code?: string } | null = null;
const updates: { id: string; attrs: Record<string, unknown> }[] = [];
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => ({
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcs.push({ fn, args });
        return fn === "claim_guest_workspace" && rpcError ? { data: null, error: rpcError } : { data: { status: "claimed", records: 3 }, error: null };
      },
      from: () => {
        const chain = {
          select: () => chain,
          in: () => chain,
          not: async () => ({ data: registry, error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
        return chain;
      },
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, is_anonymous: anonymousIds.has(id) } } }),
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          updates.push({ id, attrs });
          return { error: updateError };
        },
      },
    },
  }),
}));

jest.mock("@/lib/guest/guest-db", () => ({
  claimGuestWorkspace: async (args: Record<string, unknown>) => {
    rpcs.push({ fn: "claim_guest_workspace", args });
    return rpcError ? { data: null, error: rpcError } : { data: { status: "claimed", records: 3 }, error: null };
  },
  reviveGuest: async (id: string) => {
    rpcs.push({ fn: "guest_revive", args: { p_guest: id } });
    return { data: { ok: true }, error: null };
  },
}));

import { handOverSession, promoteGuest, readGuestPossession } from "@/lib/guest/session-handover";

const GUEST = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const signedIn = (id: string, anon = false) => async () => ({ data: { user: { id, is_anonymous: anon } }, error: null });

beforeEach(() => {
  jar.clear();
  deleted.length = 0;
  rpcs.length = 0;
  updates.length = 0;
  rpcError = null;
  updateError = null;
  registry = [];
  anonymousIds = new Set();
  claims = null;
});

function holdGuestSession() {
  jar.set("sb-matrx-guest", "base64-session");
  claims = { sub: GUEST, is_anonymous: true };
}

it("logging in to another account claims the browser's guest workspace and drops the guest cookie", async () => {
  holdGuestSession();
  const out = await handOverSession("password_login", signedIn(ACCOUNT));
  expect(out.guestClaim).toEqual({ status: "claimed", guestId: GUEST, records: 3 });
  expect(rpcs).toEqual([{ fn: "claim_guest_workspace", args: { p_guest: GUEST, p_target: ACCOUNT, p_via: "password_login" } }]);
  expect(deleted).toContain("sb-matrx-guest");
});

it("a refused sign-in claims nothing", async () => {
  holdGuestSession();
  const out = await handOverSession("password_login", async () => ({ data: { user: null }, error: { message: "bad password" } }));
  expect(out.guestClaim).toEqual({ status: "none" });
  expect(rpcs).toEqual([]);
});

it("a failed claim screams and KEEPS the guest cookie so the next sign-in retries", async () => {
  holdGuestSession();
  rpcError = { message: "boom" };
  const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const out = await handOverSession("oauth_callback", signedIn(ACCOUNT));
  expect(out.guestClaim).toMatchObject({ status: "failed", guestId: GUEST });
  expect(deleted).not.toContain("sb-matrx-guest");
  expect(spy.mock.calls.some((c) => String(c[0]).includes("LOUD"))).toBe(true);
  spy.mockRestore();
});

it("signing in as the guest itself (after promotion) is not a claim", async () => {
  holdGuestSession();
  const out = await handOverSession("sign_up", signedIn(GUEST));
  expect(out.guestClaim).toEqual({ status: "same_account" });
  expect(rpcs).toEqual([]);
});

it("a LOST guest session is still found through the visitor id (adopt proof), and claimed", async () => {
  registry = [{ auth_user_id: GUEST }];
  anonymousIds.add(GUEST);
  expect(await readGuestPossession("A".repeat(24))).toEqual({ guestId: GUEST, proof: "visitor_id" });
  const out = await handOverSession("email_otp", signedIn(ACCOUNT), { visitorId: "A".repeat(24) });
  expect(out.guestClaim).toMatchObject({ status: "claimed", guestId: GUEST });
});

it("a guessable temp_ visitor id is never a proof", async () => {
  registry = [{ auth_user_id: GUEST }];
  anonymousIds.add(GUEST);
  expect(await readGuestPossession("temp_1700000000000_abcdefgh")).toBeNull();
});

it("sign-up promotes the SAME guest, reviving it before and after (C2 + the C3 backstop)", async () => {
  holdGuestSession();
  expect(await promoteGuest({ email: "a@b.co", password: "secret12" })).toEqual({ kind: "promoted", userId: GUEST });
  expect(rpcs.map((r) => r.fn)).toEqual(["guest_revive", "guest_revive"]);
  expect(updates).toEqual([{ id: GUEST, attrs: { email: "a@b.co", password: "secret12", email_confirm: true } }]);
});

it("an email that already has an account never becomes a fresh account: it is sent to log in", async () => {
  holdGuestSession();
  updateError = { message: "A user with this email address has already been registered", code: "email_exists" };
  expect(await promoteGuest({ email: "a@b.co", password: "secret12" })).toEqual({ kind: "email_in_use" });
});

it("no guest: nothing to promote", async () => {
  expect(await promoteGuest({ email: "a@b.co", password: "secret12" })).toEqual({ kind: "no_guest" });
});

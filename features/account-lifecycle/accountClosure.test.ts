const sendEmail = jest.fn();
const getStripe = jest.fn();
const lease = jest.fn(async (_c: string, _l: boolean, work: (held: () => Promise<void>) => Promise<unknown>) => work(async () => undefined));
let journal: Record<string, unknown> | null = null;
let customers: Array<Record<string, unknown>> = [];
let owned: Array<Record<string, unknown>> = [];
let members = 0;
let coowners = 0;
let leaseConflict = false;
let failClosedWrite = false;
const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
  if (name === "account_closure_claim") {
    if (leaseConflict) return Promise.resolve({ data: null, error: null });
    const initial = args.p_initial_journal as Record<string, unknown>;
    if (!journal || (journal.state === "restored" && initial.state === "closing")) journal = initial;
  }
  if (name === "account_closure_write" && failClosedWrite && (args.p_journal as Record<string, unknown>).state === "closed") return Promise.resolve({ data: false, error: null });
  if (name === "account_closure_write") journal = args.p_journal as Record<string, unknown>;
  return Promise.resolve({ data: name === "account_closure_claim" ? journal : true, error: null });
});
const signOut = jest.fn(); const updateUserById = jest.fn(); const generateLink = jest.fn();

jest.mock("@/lib/email/client", () => ({ sendEmail }));
jest.mock("@/lib/stripe/server", () => ({ getStripe }));
jest.mock("@/features/entitlements/stripe/checkoutLease", () => ({ withCheckoutLease: lease }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: () => ({
  rpc,
  schema: () => ({ from: (table: string) => {
    const filters: string[] = [];
    const value = () => table === "customer" ? { data: customers, error: null }
      : table === "subscription" ? { data: { stripe_subscription_id: "sub" }, error: null }
      : filters.includes("user_id") ? { data: owned, error: null }
      : filters.includes("role") ? { data: null, count: coowners, error: null } : { data: null, count: members, error: null };
    const q: Record<string, unknown> = { select: () => q, eq: (k: string) => { filters.push(k); return q; }, neq: () => q, is: () => q,
      range: () => Promise.resolve(value()), maybeSingle: () => Promise.resolve(value()), then: (f: (v: unknown) => unknown) => Promise.resolve(value()).then(f) };
    return q;
  } }),
  auth: { admin: { signOut, updateUserById, generateLink, getUserById: jest.fn(() => Promise.resolve({ data: { user: { app_metadata: { account_closure: journal } } }, error: null })) } },
}) }));

import { closeAccount, recoveryToken, restoreAccount } from "./accountClosure";

const userId = "11111111-1111-4111-8111-111111111111";
const input = { userId, email: "person@example.com", metadata: {}, origin: "http://localhost", accessToken: "verified-jwt" };
const personal = (id: string, state = "active") => ({ id, status: state, metadata: { beneficiary_user_id: userId }, items: { data: [{ price: { metadata: { purpose: "platform_subscription" } } }] } });

beforeEach(() => { jest.clearAllMocks(); journal = null; customers = []; owned = []; members = 0; coowners = 0; leaseConflict = false; failClosedWrite = false;
  sendEmail.mockResolvedValue({ success: true }); signOut.mockResolvedValue({ error: null }); updateUserById.mockResolvedValue({ error: null }); generateLink.mockResolvedValue({ data: { properties: { action_link: "http://signin" } }, error: null }); });

describe("account lifecycle orchestration", () => {
  it("releases the journal fence when recovery email fails before Stripe", async () => {
    sendEmail.mockResolvedValue({ success: false });
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 502 });
    expect(getStripe).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([n]) => n)).toContain("account_closure_release");
  });

  it("cancels only verified personal TEST and LIVE subscriptions before JWT signout", async () => {
    customers = [{ stripe_customer_id: "test_customer", livemode: false }, { stripe_customer_id: "live_customer", livemode: true }];
    const cancelled: string[] = [];
    getStripe.mockImplementation((mode: string) => ({ customers: { retrieve: jest.fn().mockResolvedValue({ deleted: false, metadata: { beneficiary_user_id: userId } }) }, subscriptions: {
      list: async function* () { yield personal(`sub_${mode}`); yield { ...personal(`company_${mode}`), metadata: { beneficiary_user_id: "company" } }; },
      cancel: jest.fn((id: string, opts: unknown) => { cancelled.push(`${id}:${JSON.stringify(opts)}`); return Promise.resolve(); }), retrieve: jest.fn((id: string) => Promise.resolve(personal(id, "canceled"))),
    } }));
    const result = await closeAccount(input);
    expect(cancelled).toEqual(expect.arrayContaining(["sub_test:{\"invoice_now\":false,\"prorate\":false}", "sub_live:{\"invoice_now\":false,\"prorate\":false}"]));
    expect(signOut).toHaveBeenCalledWith("verified-jwt", "global"); expect(lease).toHaveBeenCalledTimes(2);
    expect(result.journal.checkpoints.access_disabled).toBeDefined();
  });

  it("blocks sole owners of shared orgs and permits co-owners", async () => {
    owned = [{ organization_id: "org" }]; members = 2;
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 409, blockers: ["org"] });
    coowners = 1; sendEmail.mockResolvedValue({ success: false });
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 502 });
  });

  it("retries link creation after unban without invalidating recovery token", async () => {
    const token = recoveryToken(); journal = { requestId: "r", state: "closed", requestedAt: "now", email: input.email, checkpoints: { access_disable_started: "now" }, receipts: {}, errors: [], recoveryTokenHash: token.hash };
    generateLink.mockResolvedValueOnce({ data: { properties: {} }, error: new Error("no link") });
    await expect(restoreAccount({ userId, requestId: "r", token: token.token })).rejects.toMatchObject({ status: 502 });
    expect(journal!.recoveryTokenHash).toBe(token.hash);
    await expect(restoreAccount({ userId, requestId: "r", token: token.token })).resolves.toEqual({ actionLink: "http://signin" });
    expect(journal!.state).toBe("restored"); expect(journal!.recoveryTokenHash).toBeUndefined();
  });

  it("keeps recovery possible when final closure persistence and unban compensation both fail", async () => {
    failClosedWrite = true;
    let recoveryLink = "";
    sendEmail.mockImplementation(async ({ html }: { html: string }) => { recoveryLink = html.match(/href="([^"]+)/)?.[1] ?? ""; return { success: true }; });
    updateUserById.mockImplementation(async (_id: string, patch: { ban_duration: string }) => ({ error: patch.ban_duration === "none" ? new Error("unban unavailable") : null }));
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 409 });
    const url = new URL(recoveryLink); const token = url.searchParams.get("token")!; const requestId = url.searchParams.get("request")!;
    expect(journal!.state).toBe("failed"); expect((journal!.checkpoints as Record<string, string>).access_disable_started).toBeDefined();
    failClosedWrite = false; updateUserById.mockResolvedValue({ error: null });
    await expect(restoreAccount({ userId, requestId, token })).resolves.toEqual({ actionLink: "http://signin" });
  });

  it("starts a fresh reclosure after restore and refuses a conflicting live lease", async () => {
    const previous = { requestId: "old", state: "restored", requestedAt: "then", email: input.email, checkpoints: { restored: "then" }, receipts: { old: ["sub"] }, errors: [] };
    sendEmail.mockResolvedValue({ success: false });
    await expect(closeAccount({ ...input, metadata: { account_closure: previous } })).rejects.toMatchObject({ status: 502 });
    expect(journal!.requestId).not.toBe("old"); expect(journal!.checkpoints).not.toHaveProperty("restored");
    journal = null; leaseConflict = true;
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 409 }); expect(sendEmail).not.toHaveBeenCalled();
  });
});

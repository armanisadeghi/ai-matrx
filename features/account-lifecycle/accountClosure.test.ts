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
let openClosure: Record<string, unknown> | null = null;
function currentJournal() {
  if (!journal) throw new Error("Expected a persisted closure journal");
  return journal;
}
const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
  if (name === "account_closure_claim") {
    if (leaseConflict) return Promise.resolve({ data: null, error: null });
    const initial = args.p_initial_journal as Record<string, unknown>;
    if (!journal || ((journal.state === "restored" || journal.state === "closed") && initial.state === "closing")) journal = initial;
  }
  if (name === "account_closure_write" && failClosedWrite && (args.p_journal as Record<string, unknown>).state === "closed") return Promise.resolve({ data: false, error: null });
  if (name === "account_closure_write") journal = args.p_journal as Record<string, unknown>;
  return Promise.resolve({ data: name === "account_closure_claim" ? journal : true, error: null });
});
const signOut = jest.fn(); const updateUserById = jest.fn(); const generateLink = jest.fn();
// The iam doors (iam.close_account / iam.reopen_account) reached through admin.schema("iam").rpc.
const iamRpc = jest.fn();

jest.mock("@/lib/email/client", () => ({ sendEmail }));
jest.mock("@/lib/stripe/server", () => ({ getStripe }));
jest.mock("@/features/entitlements/stripe/checkoutLease", () => ({ withCheckoutLease: lease }));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: () => ({
  rpc,
  schema: () => ({ rpc: iamRpc, from: (table: string) => {
    const filters: string[] = [];
    const value = () => table === "account_closure" ? { data: openClosure, error: null }
      : table === "customer" ? { data: customers, error: null }
      : table === "subscription" ? { data: { stripe_subscription_id: "sub" }, error: null }
      : filters.includes("user_id") ? { data: owned, error: null }
      : filters.includes("role") ? { data: null, count: coowners, error: null } : { data: null, count: members, error: null };
    const q: Record<string, unknown> = { select: () => q, eq: (k: string) => { filters.push(k); return q; }, neq: () => q, is: () => q, order: () => q, limit: () => q,
      range: () => Promise.resolve(value()), maybeSingle: () => Promise.resolve(value()), then: (f: (v: unknown) => unknown) => Promise.resolve(value()).then(f) };
    return q;
  } }),
  auth: { admin: { signOut, updateUserById, generateLink, getUserById: jest.fn(() => Promise.resolve({ data: { user: { app_metadata: { account_closure: journal } } }, error: null })) } },
}) }));

import { closeAccount, recoveryToken, restoreAccount } from "./accountClosure";

const userId = "11111111-1111-4111-8111-111111111111";
const input = { userId, email: "person@example.com", metadata: {}, origin: "http://localhost" };
const personal = (id: string, state = "active") => ({ id, status: state, metadata: { beneficiary_user_id: userId }, items: { data: [{ price: { metadata: { purpose: "platform_subscription" } } }] } });

beforeEach(() => { jest.clearAllMocks(); journal = null; customers = []; owned = []; members = 0; coowners = 0; leaseConflict = false; failClosedWrite = false; openClosure = null;
  sendEmail.mockResolvedValue({ success: true }); signOut.mockResolvedValue({ error: null }); updateUserById.mockResolvedValue({ error: null }); generateLink.mockResolvedValue({ data: { properties: { action_link: "http://signin" } }, error: null }); iamRpc.mockResolvedValue({ data: { ok: true }, error: null }); });

describe("account lifecycle orchestration", () => {
  it("releases the journal fence when recovery email fails before Stripe", async () => {
    sendEmail.mockResolvedValue({ success: false });
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 502 });
    expect(getStripe).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([n]) => n)).toContain("account_closure_release");
  });

  it("cancels only verified personal TEST and LIVE subscriptions before closing through iam.close_account", async () => {
    customers = [{ stripe_customer_id: "test_customer", livemode: false }, { stripe_customer_id: "live_customer", livemode: true }];
    const cancelled: string[] = [];
    getStripe.mockImplementation((mode: string) => ({ customers: { retrieve: jest.fn().mockResolvedValue({ deleted: false, metadata: { beneficiary_user_id: userId } }) }, subscriptions: {
      list: async function* () { yield personal(`sub_${mode}`); yield { ...personal(`company_${mode}`), metadata: { beneficiary_user_id: "company" } }; },
      cancel: jest.fn((id: string, opts: unknown) => { cancelled.push(`${id}:${JSON.stringify(opts)}`); return Promise.resolve(); }), retrieve: jest.fn((id: string) => Promise.resolve(personal(id, "canceled"))),
    } }));
    const result = await closeAccount(input);
    expect(cancelled).toEqual(expect.arrayContaining(["sub_test:{\"invoice_now\":false,\"prorate\":false}", "sub_live:{\"invoice_now\":false,\"prorate\":false}"]));
    expect(iamRpc).toHaveBeenCalledWith("close_account", expect.objectContaining({ p_user: userId })); expect(lease).toHaveBeenCalledTimes(2);
    expect(updateUserById).not.toHaveBeenCalled();
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
    expect(currentJournal().recoveryTokenHash).toBe(token.hash);
    await expect(restoreAccount({ userId, requestId: "r", token: token.token })).resolves.toEqual({ actionLink: "http://signin" });
    expect(currentJournal().state).toBe("restored"); expect(currentJournal().recoveryTokenHash).toBeUndefined();
  });

  it("keeps recovery possible when final closure persistence and unban compensation both fail", async () => {
    failClosedWrite = true;
    let recoveryLink = "";
    sendEmail.mockImplementation(async ({ html }: { html: string }) => { recoveryLink = html.match(/href="([^"]+)/)?.[1] ?? ""; return { success: true }; });
    iamRpc.mockImplementation(async (name: string) => ({ data: null, error: name === "reopen_account" ? new Error("reopen unavailable") : null }));
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 409 });
    const url = new URL(recoveryLink); const token = url.searchParams.get("token"); const requestId = url.searchParams.get("request");
    if (!token || !requestId) throw new Error("Expected the emailed recovery token and request");
    expect(currentJournal().state).toBe("failed"); expect((currentJournal().checkpoints as Record<string, string>).access_disable_started).toBeDefined();
    failClosedWrite = false; iamRpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(restoreAccount({ userId, requestId, token })).resolves.toEqual({ actionLink: "http://signin" });
    expect(iamRpc).toHaveBeenLastCalledWith("reopen_account", expect.objectContaining({ p_user: userId }));
  });

  it("starts a fresh reclosure after restore and refuses a conflicting live lease", async () => {
    const previous = { requestId: "old", state: "restored", requestedAt: "then", email: input.email, checkpoints: { restored: "then" }, receipts: { old: ["sub"] }, errors: [] };
    sendEmail.mockResolvedValue({ success: false });
    await expect(closeAccount({ ...input, metadata: { account_closure: previous } })).rejects.toMatchObject({ status: 502 });
    expect(currentJournal().requestId).not.toBe("old"); expect(currentJournal().checkpoints).not.toHaveProperty("restored");
    journal = null; leaseConflict = true; sendEmail.mockClear();
    await expect(closeAccount(input)).rejects.toMatchObject({ status: 409 }); expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reads closed from the DB record: open record is already closed, a stale closed journal after reopen starts fresh", async () => {
    const stale = { requestId: "old", state: "closed", requestedAt: "then", email: input.email, checkpoints: { recovery_email_sent: "then" }, receipts: {}, errors: [], recoveryTokenHash: "x" };
    openClosure = { closed_at: "now" };
    await expect(closeAccount({ ...input, metadata: { account_closure: stale } })).resolves.toMatchObject({ alreadyClosed: true });
    expect(sendEmail).not.toHaveBeenCalled();
    openClosure = null; sendEmail.mockResolvedValue({ success: false });
    await expect(closeAccount({ ...input, metadata: { account_closure: stale } })).rejects.toMatchObject({ status: 502 });
    expect(sendEmail).toHaveBeenCalledTimes(1); expect(currentJournal().requestId).not.toBe("old");
  });
});

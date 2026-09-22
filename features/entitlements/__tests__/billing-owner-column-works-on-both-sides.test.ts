// features/entitlements/__tests__/billing-owner-column-works-on-both-sides.test.ts
//
// INVARIANT: THE STRIPE WRITE PATH NAMES `organization_id` WHEN THAT COLUMN EXISTS
// AND `user_id` WHEN IT DOES NOT, WITHOUT A REDEPLOY BETWEEN THE TWO.
//
// `w1_org_billing_lets_go_of_auth_users_on_main.sql` and
// `w1_org_billing_owner_columns_move_on_main.sql` rename the owner column on all
// three Stripe-facing tables in the middle of the night, unattended, inside the
// 1-4 AM Pacific window. The deployed bundle does not change at the moment they
// commit — so the SERVED code has to be right on both sides of that transaction, and
// this suite is what holds it. Guess `user_id` after the move and every Stripe
// webhook writes to a column that is not there; guess `organization_id` before it and
// the same thing happens in the other direction.
//
// WHY IT IS A REAL TEST AND NOT A MIRROR OF THE IMPLEMENTATION. Nothing here is told
// which column is live. The suite stands up a PostgREST-shaped fake that either HAS
// `billing.customer.organization_id` or answers `42703 column ... does not exist`,
// exactly as the real one does, and then asserts on the SQL-shaped calls the seam
// makes. A version of `billingOwner.ts` with either column hardcoded fails one half.
//
// Its red twin is `billing-owner-column-red-twin.test.ts`, which plants exactly that
// hardcoding and proves this suite can go red.

import {
  billingOwnerCheck,
  billingOwnerColumn,
  billingOwnerRef,
  billingOwnerRefFromRow,
  isBillingOrganizationRequiredError,
  ownerPayload,
  readRequestOrganizationId,
  resetBillingOwnerShapeCache,
} from "../stripe/billingOwner";

/** What the fake database is pretending to be, set per test. */
let shape: "organization" | "user" | "unreachable" = "user";
/** Every `.select(...)` the seam asked for, in order. */
let selects: string[] = [];

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => ({
    schema: () => ({
      from: () => ({
        select: (columns: string) => {
          selects.push(columns);
          const answer =
            shape === "unreachable"
              ? { data: null, error: { code: "PGRST002", message: "schema cache reloading" } }
              : shape === "organization" || !columns.includes("organization_id")
                ? { data: [], error: null }
                : {
                    data: null,
                    error: {
                      code: "42703",
                      message: 'column customer.organization_id does not exist',
                    },
                  };
          return { limit: () => Promise.resolve(answer) };
        },
      }),
    }),
  }),
}));

const PERSON = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  resetBillingOwnerShapeCache();
  selects = [];
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("before the column move — the database still has user_id", () => {
  beforeEach(() => {
    shape = "user";
  });

  it("reads the shape from the catalog, not from a flag", async () => {
    await expect(billingOwnerCheck()).resolves.toEqual({ state: "user" });
    // It asked the one question that answers it, and asked it of the real column.
    expect(selects.some((s) => s.includes("organization_id"))).toBe(true);
  });

  it("names user_id and carries the PERSON", async () => {
    await expect(
      billingOwnerRef({ userId: PERSON, organizationId: ORGANIZATION }),
    ).resolves.toEqual({ column: "user_id", value: PERSON });
  });

  it("does not demand an organization it cannot yet store", async () => {
    await expect(billingOwnerRef({ userId: PERSON })).resolves.toEqual({
      column: "user_id",
      value: PERSON,
    });
  });
});

describe("after the column move — organization_id is there", () => {
  beforeEach(() => {
    shape = "organization";
  });

  it("names organization_id and carries the ORGANIZATION, never the person", async () => {
    const ref = await billingOwnerRef({ userId: PERSON, organizationId: ORGANIZATION });
    expect(ref).toEqual({ column: "organization_id", value: ORGANIZATION });
    expect(ref.value).not.toBe(PERSON);
  });

  const refusalFor = async (input: { userId: string; organizationId?: string | null }) => {
    try {
      await billingOwnerRef(input);
    } catch (err) {
      return err;
    }
    return null;
  };

  it("REFUSES rather than substituting an organization (Arman, 2026-09-19, F2)", async () => {
    // The whole ruling in one assertion: no default organization, no personal
    // workspace, no "the first one they belong to". It asks.
    expect(isBillingOrganizationRequiredError(await refusalFor({ userId: PERSON }))).toBe(true);
    expect(
      isBillingOrganizationRequiredError(
        await refusalFor({ userId: PERSON, organizationId: "   " }),
      ),
    ).toBe(true);
  });

  it("tells the caller what to send, in a sentence", async () => {
    const err = await refusalFor({ userId: PERSON });
    expect((err as Error).message).toContain("X-Organization-Id");
    expect((err as Error).message).toContain("organization");
  });
});

describe("the seam that has to be right on BOTH sides", () => {
  it("builds the payload under whichever name is live", async () => {
    shape = "user";
    const before = ownerPayload(await billingOwnerRef({ userId: PERSON }), {
      stripe_customer_id: "cus_1",
    });
    expect(before).toEqual({ user_id: PERSON, stripe_customer_id: "cus_1" });

    resetBillingOwnerShapeCache();
    shape = "organization";
    const after = ownerPayload(
      await billingOwnerRef({ userId: PERSON, organizationId: ORGANIZATION }),
      { stripe_customer_id: "cus_1" },
    );
    expect(after).toEqual({ organization_id: ORGANIZATION, stripe_customer_id: "cus_1" });
  });

  it("reads the owner back off a mirror row on either side (the webhook path)", () => {
    expect(billingOwnerRefFromRow({ user_id: PERSON })).toEqual({
      column: "user_id",
      value: PERSON,
    });
    expect(billingOwnerRefFromRow({ organization_id: ORGANIZATION })).toEqual({
      column: "organization_id",
      value: ORGANIZATION,
    });
    // A row with neither is not an owner, and is never invented into one.
    expect(billingOwnerRefFromRow({ stripe_account_id: "acct_1" })).toBeNull();
    expect(billingOwnerRefFromRow(null)).toBeNull();
  });
});

describe("nothing fails silently", () => {
  it("an unreachable database is `unavailable` with its cause — never a guessed column", async () => {
    shape = "unreachable";
    const check = await billingOwnerCheck();
    expect(check.state).toBe("unavailable");
    expect(check.state === "unavailable" && check.reason).toContain("PGRST002");
    await expect(billingOwnerColumn()).rejects.toThrow(/organization_id/);
  });

  it("does not cache an `unavailable` answer into a half-minute of refusals", async () => {
    shape = "unreachable";
    await billingOwnerCheck();
    shape = "organization";
    await expect(billingOwnerCheck()).resolves.toEqual({ state: "organization" });
  });
});

describe("the organization comes from the request and nowhere else", () => {
  const req = (headers: Record<string, string>) => ({
    headers: { get: (name: string) => headers[name] ?? null },
  });

  it("reads the header", () => {
    expect(readRequestOrganizationId(req({ "X-Organization-Id": ORGANIZATION }))).toBe(
      ORGANIZATION,
    );
  });

  it("is null when absent or blank — never a fallback", () => {
    expect(readRequestOrganizationId(req({}))).toBeNull();
    expect(readRequestOrganizationId(req({ "X-Organization-Id": "  " }))).toBeNull();
  });
});

// features/entitlements/stripe/billingOwner.ts
//
// THE ONE SEAM BETWEEN STRIPE'S WRITE PATH AND REC-62, AND THERE IS NOT A SECOND ONE.
//
// WHAT IS MOVING. `w1_org_billing_lets_go_of_auth_users_on_main.sql` (step 1) and
// `w1_org_billing_owner_columns_move_on_main.sql` (step 2) rename the owner column
// on all three Stripe-facing tables:
//
//     billing.customer.user_id         -> billing.customer.organization_id
//     billing.connect_account.user_id  -> billing.connect_account.organization_id
//     billing.subscription.user_id     -> DROPPED; billing.subscription.org_id
//                                        -> billing.subscription.organization_id
//
// and re-points every foreign key from `auth.users` to `iam.organizations`. That is
// REC-62/REC-63 reaching Stripe: a Stripe customer, a subscription and a Connect
// payout account belong to an ORGANIZATION, never to a human being.
//
// WHY THIS FILE EXISTS: THE CODE HAS TO BE RIGHT ON BOTH SIDES OF THAT TRANSACTION.
// The migration runs unattended inside the 1-4 AM Pacific window, on a night when
// nobody is watching, and the deployed bundle does not change at the moment it
// commits. So the served code must name `user_id` before the file lands and
// `organization_id` after it lands, with no redeploy in between and no window in
// which a Stripe webhook writes to a column that is not there. That is the
// safe-cutover rule: read the new column when present, the old when not.
//
// IT DETECTS, IT IS NOT SET. Every other switch in this repo is a knob somebody
// turns (`platform.feature_knob`). This one is not, deliberately:
//
//   * A knob has to be flipped by a second actor at the same instant the DDL
//     commits, or the code and the database disagree for as long as the gap. At
//     02:05 in the morning there is no second actor.
//   * A knob can be WRONG. The catalog cannot: `organization_id` either exists on
//     `billing.customer` or it does not, and PostgREST answers that question in one
//     round trip. The switch and the thing it is switching on are the same fact.
//
// So `billingOwnerCheck()` asks the database what shape it is, caches the answer for
// `SHAPE_CACHE_MS`, and re-asks after that. The cache is short on purpose: it has to
// be shorter than a person's patience on the night of the cutover, and it costs one
// `limit 0` select per server process per half-minute.
//
// NOTHING FAILS SILENTLY. A probe that cannot reach the database returns
// `unavailable` WITH ITS CAUSE, and every caller refuses out loud rather than
// guessing a column. Guessing `user_id` after the move would write to a column that
// does not exist; guessing `organization_id` before it would do the same. There is
// no safe default here, so there is no default.
//
// AND NOTHING SUBSTITUTES AN ORGANIZATION (Arman, 2026-09-19, F2). Once the columns
// have moved, every one of these writes needs an organization, and it comes from the
// CALLER - the `X-Organization-Id` header the person's client already sends. This
// module never picks one, never falls back to a personal workspace and never reads
// `iam.default_organization_id`. When the organization is missing it refuses with a
// sentence that says what to do, and the route answers with the standard
// organization-required envelope so the picker can open.
//
// SAFE TO DO TODAY, MEASURED RATHER THAN ARGUED: all three tables hold ZERO rows on
// production and on the nightly clone (re-measured 2026-09-22), so no Stripe
// customer, subscription or Connect account exists yet and nothing in production is
// exercising these paths. Requiring the organization is a change to code nobody has
// run, not an outage.

import { createAdminClient } from "@/utils/supabase/adminClient";

/** The column that carries a billing row's owner, on whichever side of REC-62 we are. */
export type BillingOwnerColumn = "organization_id" | "user_id";

/** The header a client sends the organization it is acting in. */
export const ORGANIZATION_HEADER = "X-Organization-Id";

/**
 * How long a shape answer is trusted. Short because the shape changes exactly once,
 * in the middle of the night, and a stale answer on either side of that moment is a
 * write to a column that is not there.
 */
export const SHAPE_CACHE_MS = 30_000;

/**
 * The honest three-state answer, never collapsed to a boolean.
 *
 *   `organization` - REC-62 has landed; the owner column is `organization_id`.
 *   `user`         - it has not; the owner column is still `user_id`.
 *   `unavailable`  - we could not ask. NOT the same as either, and never treated as
 *                    one: the caller refuses and says why.
 */
export type BillingOwnerShape =
  | { state: "organization" }
  | { state: "user" }
  | { state: "unavailable"; reason: string };

/**
 * A resolved owner: the column to write and the id to put in it. Opaque on purpose -
 * a caller that has one does not need to know which side of the move it is on, which
 * is what keeps the branch in ONE file instead of ten.
 */
export interface BillingOwnerRef {
  column: BillingOwnerColumn;
  value: string;
}

/** The refusal a route turns into the organization-required envelope. */
export class BillingOrganizationRequiredError extends Error {
  override name = "BillingOrganizationRequiredError" as const;
  constructor() {
    super(
      "Choose the organization this billing account belongs to and send it with " +
        `the request (the ${ORGANIZATION_HEADER} header), then try again. A Stripe ` +
        "customer, subscription and payout account belong to an organization, and " +
        "nothing here picks one for you.",
    );
  }
}

export function isBillingOrganizationRequiredError(
  error: unknown,
): error is BillingOrganizationRequiredError {
  return (
    error instanceof BillingOrganizationRequiredError ||
    (error instanceof Error && error.name === "BillingOrganizationRequiredError")
  );
}

/** The refusal when the database could not be asked what shape it is. */
export class BillingOwnerShapeUnavailableError extends Error {
  override name = "BillingOwnerShapeUnavailableError" as const;
  constructor(reason: string) {
    super(
      "Could not read whether billing's owner column has moved to organization_id " +
        `(${reason}). Nothing was written, because writing to the wrong column ` +
        "would either fail or silently label a person as an organization. Try " +
        "again; if it persists, check billing.customer in the database.",
    );
  }
}

// ── the probe ────────────────────────────────────────────────────────────────

let cached: { at: number; shape: BillingOwnerShape } | null = null;

/** Tests only: forget the cached shape so the next call probes again. */
export function resetBillingOwnerShapeCache(): void {
  cached = null;
}

/**
 * PostgREST's answer when a column is not there. `42703` is PostgreSQL's own
 * `undefined_column`, which PostgREST forwards for a `select` of a column the table
 * does not have; `PGRST204` is its schema-cache form for a write. Either one means
 * "this column does not exist", which is the whole question being asked.
 */
function meansColumnAbsent(error: { code?: string | null; message?: string | null }): boolean {
  const code = error.code ?? "";
  if (code === "42703" || code === "PGRST204") return true;
  const message = error.message ?? "";
  return /organization_id.*does not exist|does not exist.*organization_id/i.test(message);
}

/**
 * Which shape is the database in RIGHT NOW? One `limit 0` select of
 * `billing.customer.organization_id`: it comes back empty if the column is there and
 * `42703` if it is not, and it reads no rows either way.
 */
async function probeShape(): Promise<BillingOwnerShape> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .schema("billing")
      .from("customer")
      .select("organization_id")
      .limit(0);
    if (!error) return { state: "organization" };
    if (meansColumnAbsent(error)) return { state: "user" };
    return {
      state: "unavailable",
      reason: `${error.code ?? "no code"}: ${error.message ?? "no message"}`,
    };
  } catch (err) {
    return {
      state: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * The shape, cached for `SHAPE_CACHE_MS`. An `unavailable` answer is NOT cached — a
 * transient schema-cache reload must not freeze the whole process into refusing for
 * half a minute.
 */
export async function billingOwnerCheck(): Promise<BillingOwnerShape> {
  const now = Date.now();
  if (cached && now - cached.at < SHAPE_CACHE_MS) return cached.shape;
  const shape = await probeShape();
  if (shape.state === "unavailable") {
    console.error(
      `[billing/owner] LOUD: could not read billing.customer's owner column — ${shape.reason}. ` +
        "Every Stripe write refuses until this answers; nothing was guessed.",
    );
    return shape;
  }
  cached = { at: now, shape };
  return shape;
}

/** The owner column, or a refusal that says why it could not be read. */
export async function billingOwnerColumn(): Promise<BillingOwnerColumn> {
  const shape = await billingOwnerCheck();
  if (shape.state === "unavailable") {
    throw new BillingOwnerShapeUnavailableError(shape.reason);
  }
  return shape.state === "organization" ? "organization_id" : "user_id";
}

// ── the organization's own three states ──────────────────────────────────────
//
// A NULLABLE ID IS NOT AN ANSWER, AND THIS SEAM USED TO TREAT IT AS ONE. Until
// 2026-09-22 `billingOwnerRef` read `input.organizationId?.trim()` and refused the
// moment it was falsy. That is the defect `check-org-three-states` exists for, in
// its server-side form: `null` arriving here meant THREE different things at once —
// the request named no organization, the caller had not resolved one YET, or the
// read that would have answered FAILED — and all three came out as the same
// terminal sentence telling a person to choose an organization nobody had looked
// for.
//
// So the organization arrives as a STATE, never as a nullable id:
//
//   `ready`       — an organization is named, and here it is.
//   `required`    — the question was asked and the answer is genuinely "none".
//                   THIS is the only state that spells the refusal.
//   `unavailable` — we could not read what the request says. NOT the refusal:
//                   nothing was written, and the caller says so with its cause.
//
// There is no `resolving` arm because there is nothing on this seam to wait FOR: a
// request is a settled snapshot, not a booting client, and the one thing here that
// genuinely resolves over time — which column is live — is `BillingOwnerShape`,
// which has carried its own three states since this module was written.

/** Which organization this billing write belongs to, as an answer with a state. */
export type BillingOrganizationState =
  | { state: "ready"; organizationId: string }
  | { state: "required" }
  | { state: "unavailable"; reason: string };

/** The refusal when we could not read WHICH organization the request is acting in. */
export class BillingOrganizationContextUnavailableError extends Error {
  override name = "BillingOrganizationContextUnavailableError" as const;
  constructor(reason: string) {
    super(
      `Could not read which organization this request is acting in (${reason}). ` +
        "Nothing was written, because a Stripe customer, subscription or payout " +
        "account labelled with the wrong owner is worse than one that is missing. " +
        "Send the request again.",
    );
  }
}

export function isBillingOrganizationContextUnavailableError(
  error: unknown,
): error is BillingOrganizationContextUnavailableError {
  return (
    error instanceof BillingOrganizationContextUnavailableError ||
    (error instanceof Error &&
      error.name === "BillingOrganizationContextUnavailableError")
  );
}

/**
 * The state for a caller that has ALREADY resolved the organization authoritatively
 * — a class's own `organization_id`, a scope row, a header the route read. This is
 * the one place a nullable id becomes a state, it is named, and it says what the
 * conversion means: the caller finished asking and came back with nothing, which on
 * a settled request is `required` and never a race.
 *
 * A caller that has NOT finished asking must not call this — it passes its own
 * `unavailable` (or does not call the seam yet), which is exactly what
 * `readRequestOrganizationState` does when it cannot read the request.
 */
export function resolvedBillingOrganization(
  organizationId: string | null | undefined,
): BillingOrganizationState {
  const value = organizationId?.trim();
  return value ? { state: "ready", organizationId: value } : { state: "required" };
}

/**
 * The owner to write, for a caller who knows both the person and the organization
 * they are acting in.
 *
 * After REC-62 the organization is REQUIRED and nothing substitutes one. Before it,
 * the organization is carried but unused — so a client that already sends the header
 * needs no second change on the night, and a client that does not keeps working
 * until the column moves and is then told, in a sentence, what to send.
 *
 * `organization` is the honest input: a state, with its three arms kept apart.
 * `organizationId` remains for callers that resolved the id themselves and is
 * funnelled through `resolvedBillingOrganization`, so the nullable-to-terminal
 * conversion happens in ONE named place instead of inside this function's `if`.
 */
export async function billingOwnerRef(input: {
  userId: string;
  organization?: BillingOrganizationState;
  organizationId?: string | null;
}): Promise<BillingOwnerRef> {
  const column = await billingOwnerColumn();
  if (column === "user_id") return { column, value: input.userId };
  const organizationState: BillingOrganizationState =
    input.organization ?? resolvedBillingOrganization(input.organizationId);
  switch (organizationState.state) {
    case "ready":
      return { column, value: organizationState.organizationId };
    case "unavailable":
      throw new BillingOrganizationContextUnavailableError(organizationState.reason);
    case "required":
      throw new BillingOrganizationRequiredError();
  }
}

/**
 * The owner READ BACK off a mirror row — for the webhook, which has no header and no
 * person, only the row Stripe's account id matches. Opaque in exactly the same way,
 * so the webhook never learns which side of the move it is on.
 */
export function billingOwnerRefFromRow(
  row: Record<string, unknown> | null | undefined,
): BillingOwnerRef | null {
  if (!row) return null;
  const organizationId = row["organization_id"];
  if (typeof organizationId === "string" && organizationId) {
    return { column: "organization_id", value: organizationId };
  }
  const userId = row["user_id"];
  if (typeof userId === "string" && userId) return { column: "user_id", value: userId };
  return null;
}

// ── the typed seam ───────────────────────────────────────────────────────────
//
// `types/database.types.ts` is generated from whichever side of the move the database
// is on, so it can only ever describe ONE of the two shapes — and this module has to
// compile against both. The three helpers below are where that is admitted, once,
// in a file whose whole subject is the move. Everywhere else stays fully typed.
//
// The rule they keep: a column name only ever comes from a `BillingOwnerRef`, which
// only ever comes from `billingOwnerColumn()`, which only ever comes from the live
// catalog. There is no string literal to get wrong.

/** `.eq(ref.column, ref.value)` on a builder typed for the other shape. */
export function ownerEq<T>(builder: { eq(column: string, value: string): T }, ref: BillingOwnerRef): T {
  return (builder as unknown as { eq(column: string, value: string): T }).eq(ref.column, ref.value);
}

/**
 * An insert/upsert payload carrying the owner under whichever name is live.
 *
 * `T` defaults to `never` because supabase-js types an `.upsert()` argument as a
 * UNION (one row or many) generated from ONE side of the move, so there is nothing
 * for TypeScript to infer from and nothing it could infer that would be right on both
 * sides. `never` is assignable to either, which is exactly the "this payload is
 * checked against the live catalog, not against the generated file" statement this
 * seam exists to make — and it is made HERE, once, in the module whose subject is the
 * move, rather than as a cast at each of the call sites.
 */
export function ownerPayload<T = never>(
  ref: BillingOwnerRef,
  rest: Record<string, unknown>,
): T {
  return { [ref.column]: ref.value, ...rest } as T;
}

/** A row from any of the three tables, as a plain bag, so a moved column can be read. */
export function asRowBag(row: unknown): Record<string, unknown> | null {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

// ── the request's organization ───────────────────────────────────────────────

/**
 * The organization the caller says they are acting in. The header and nothing else:
 * no cookie, no last-used, no personal fallback. `null` when absent, which becomes a
 * refusal at the moment an organization is actually needed, never a substitution.
 */
export function readRequestOrganizationState(request: {
  headers: { get(name: string): string | null };
}): BillingOrganizationState {
  let raw: string | null;
  try {
    raw =
      request.headers.get(ORGANIZATION_HEADER) ??
      request.headers.get(ORGANIZATION_HEADER.toLowerCase());
  } catch (err) {
    // We could not read what the request SAYS. That is not "the request named no
    // organization" — it is not knowing, and it must not come out as the sentence
    // that tells a person to go and choose one.
    return {
      state: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  const value = raw?.trim();
  return value ? { state: "ready", organizationId: value } : { state: "required" };
}

/**
 * The header's value, or `null`. Kept for callers that only need the id and hand it
 * straight back to `billingOwnerRef`/`ensureStripeCustomer`, which funnel it through
 * `resolvedBillingOrganization`. New code reads the STATE:
 * `readRequestOrganizationState` is the same read without the collapse.
 */
export function readRequestOrganizationId(request: {
  headers: { get(name: string): string | null };
}): string | null {
  const organizationState = readRequestOrganizationState(request);
  return organizationState.state === "ready" ? organizationState.organizationId : null;
}

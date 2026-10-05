import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  getStripe,
  isStripeConfigured,
  requiredStripeMode,
} from "@/lib/stripe/server";
import {
  withCheckoutLease,
  CheckoutBusyError,
} from "@/features/entitlements/stripe/checkoutLease";
import {
  assertSchedulablePersonalSubscription,
  createScheduledPersonalChange,
  ScheduledChangeError,
  undoScheduledPersonalChange,
  type ScheduledChangePreview,
} from "@/features/entitlements/stripe/scheduledChange";
import { readClosureJournal } from "@/features/account-lifecycle/accountClosure";

type ChangeRequest = { planKey?: string; cycle?: "monthly" | "annual" };

function responseError(error: unknown) {
  if (error instanceof ScheduledChangeError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof CheckoutBusyError)
    return NextResponse.json(
      {
        error:
          "Another billing change is in progress. Please try again shortly.",
      },
      { status: 409 },
    );
  console.error("[stripe/scheduled-change]", error);
  return NextResponse.json(
    { error: "Scheduled plan changes are unavailable right now." },
    { status: 500 },
  );
}

async function personalContext() {
  if (!isStripeConfigured())
    throw new ScheduledChangeError("Billing is not configured yet.", 503);
  const client = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(client);
  if (!user) throw new ScheduledChangeError("Not authenticated", 401);
  const admin = createAdminClient();
  const livemode = requiredStripeMode() === "live";
  const { data: customer, error } = await admin
    .schema("billing")
    .from("customer")
    .select("stripe_customer_id")
    .eq("beneficiary_user_id", user.id)
    .eq("livemode", livemode)
    .maybeSingle();
  if (error) throw error;
  if (!customer?.stripe_customer_id)
    throw new ScheduledChangeError(
      "No personal billing account was found.",
      404,
    );
  return {
    admin,
    livemode,
    customerId: customer.stripe_customer_id,
    userId: user.id,
  };
}

/** Access JWTs can outlive a global sign-out, so this is deliberately fresh. */
async function assertAccountCanChangePlan(userId: string) {
  const fresh = await createAdminClient().auth.admin.getUserById(userId);
  if (fresh.error || !fresh.data.user)
    throw (
      fresh.error ??
      new ScheduledChangeError(
        "Your account could not be verified for this billing change.",
        401,
      )
    );
  const state = readClosureJournal(fresh.data.user.app_metadata)?.state;
  if (state === "closing" || state === "closed" || state === "failed")
    throw new ScheduledChangeError(
      "This account is closing or closed and cannot schedule a billing change.",
      409,
    );
}

async function previewFor(input: ChangeRequest) {
  if (!input.planKey || (input.cycle !== "monthly" && input.cycle !== "annual"))
    throw new ScheduledChangeError(
      "Choose a paid personal plan and billing cycle.",
    );
  const { admin, livemode, customerId, userId } = await personalContext();
  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const candidates = subscriptions.data.filter((subscription) =>
    ["active", "trialing"].includes(subscription.status),
  );
  if (candidates.length !== 1)
    throw new ScheduledChangeError(
      "Exactly one active personal subscription is required to schedule a change.",
      409,
    );
  const subscription = await stripe.subscriptions.retrieve(candidates[0].id);
  // A confirmation retry may arrive after the schedule was created but before
  // the browser received its response. Validate the subscription unchanged,
  // then return that exact owned schedule below without another Stripe write.
  const item = assertSchedulablePersonalSubscription(
    subscription.schedule ? { ...subscription, schedule: null } : subscription,
    customerId,
  );
  const currentPrice = await stripe.prices.retrieve(item.price.id);
  const currentPlanKey = currentPrice.metadata.plan_key;
  if (
    currentPrice.metadata.purpose !== "platform_subscription" ||
    !currentPlanKey
  )
    throw new ScheduledChangeError(
      "This subscription is not a platform plan and cannot be changed here.",
    );
  const { data: currentPlan, error: currentPlanError } = await admin
    .schema("billing")
    .from("plan")
    .select("plan_key,rank,audience")
    .eq("plan_key", currentPlanKey)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (currentPlanError) throw currentPlanError;
  const { data: targetPlan, error: targetPlanError } = await admin
    .schema("billing")
    .from("plan")
    .select("plan_key,rank,audience,monthly_cents,annual_cents")
    .eq("plan_key", input.planKey)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetPlanError) throw targetPlanError;
  if (
    !currentPlan ||
    !targetPlan ||
    currentPlan.audience !== "personal" ||
    targetPlan.audience !== "personal"
  )
    throw new ScheduledChangeError(
      "Choose a current personal plan from the platform catalog.",
    );
  if (!Number.isFinite(currentPlan.rank) || !Number.isFinite(targetPlan.rank))
    throw new ScheduledChangeError(
      "This plan does not have an approved change rank.",
    );
  if (targetPlan.rank > currentPlan.rank)
    throw new ScheduledChangeError(
      "Upgrades are confirmed immediately in Stripe. Choose the upgrade from pricing instead.",
    );
  const currentCycle =
    currentPrice.recurring?.interval === "year"
      ? "annual"
      : currentPrice.recurring?.interval === "month"
        ? "monthly"
        : null;
  if (
    !currentCycle ||
    (targetPlan.rank === currentPlan.rank &&
      currentPlan.plan_key === targetPlan.plan_key &&
      currentCycle === input.cycle)
  )
    throw new ScheduledChangeError("Choose a different plan or billing cycle.");
  const amount =
    input.cycle === "monthly"
      ? targetPlan.monthly_cents
      : targetPlan.annual_cents == null
        ? null
        : targetPlan.annual_cents * 12;
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new ScheduledChangeError(
      "That plan does not have a current paid price for this billing cycle.",
    );
  const { data: targetPrice, error: targetPriceError } = await admin
    .schema("billing")
    .from("price")
    .select(
      "stripe_price_id,unit_amount,currency,interval,interval_count,metadata",
    )
    .eq("livemode", livemode)
    .eq("active", true)
    .is("deleted_at", null)
    .contains("metadata", {
      plan_key: targetPlan.plan_key,
      purpose: "platform_subscription",
    })
    .eq("interval", input.cycle === "monthly" ? "month" : "year")
    .eq("interval_count", 1)
    .eq("unit_amount", amount)
    .maybeSingle();
  if (targetPriceError) throw targetPriceError;
  if (!targetPrice?.stripe_price_id)
    throw new ScheduledChangeError(
      "The current catalog price is unavailable. Refresh pricing and try again.",
      409,
    );
  const exactPrice = await stripe.prices.retrieve(targetPrice.stripe_price_id);
  if (
    !exactPrice.active ||
    exactPrice.livemode !== livemode ||
    exactPrice.unit_amount !== targetPrice.unit_amount ||
    exactPrice.currency !== targetPrice.currency ||
    exactPrice.metadata.plan_key !== targetPlan.plan_key ||
    exactPrice.metadata.purpose !== "platform_subscription" ||
    exactPrice.recurring?.interval !== targetPrice.interval ||
    exactPrice.recurring.interval_count !== targetPrice.interval_count
  )
    throw new ScheduledChangeError(
      "The Stripe price and platform catalog disagree. No change was made.",
      409,
    );
  const preview: ScheduledChangePreview = {
    subscriptionId: subscription.id,
    currentPlanKey,
    targetPlanKey: targetPlan.plan_key,
    targetPriceId: exactPrice.id,
    targetAmount: exactPrice.unit_amount ?? amount,
    currency: exactPrice.currency,
    effectiveAt: item.current_period_end,
    quantity: item.quantity ?? 1,
  };
  if (!subscription.schedule)
    return { stripe, subscription, customerId, userId, preview };
  const scheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule.id;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const scheduleCustomer =
    typeof schedule.customer === "string"
      ? schedule.customer
      : schedule.customer.id;
  if (
    schedule.metadata?.purpose !== "matrx_personal_plan_change" ||
    scheduleCustomer !== customerId ||
    schedule.subscription !== subscription.id
  )
    throw new ScheduledChangeError(
      "A plan change is already managed in billing. Manage it there instead.",
      409,
    );
  const future = schedule.phases.find(
    (phase) => phase.start_date >= item.current_period_end,
  );
  const scheduledPrice = future?.items[0]?.price;
  const scheduledPriceId =
    typeof scheduledPrice === "string" ? scheduledPrice : scheduledPrice?.id;
  if (scheduledPriceId !== exactPrice.id)
    throw new ScheduledChangeError(
      "A different plan change is already scheduled. Undo it before choosing another plan.",
      409,
    );
  return {
    stripe,
    subscription,
    customerId,
    userId,
    preview,
    existingSchedule: { scheduleId, effectiveAt: item.current_period_end },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object")
      throw new ScheduledChangeError("Choose a plan before continuing.");
    const action = "action" in body ? body.action : "preview";
    const input: ChangeRequest = {
      planKey:
        "planKey" in body && typeof body.planKey === "string"
          ? body.planKey
          : undefined,
      cycle:
        "cycle" in body && (body.cycle === "monthly" || body.cycle === "annual")
          ? body.cycle
          : undefined,
    };
    if (action !== "preview" && action !== "confirm")
      throw new ScheduledChangeError("Unknown scheduled billing action.");
    const context = await previewFor(input);
    if (action === "preview")
      return NextResponse.json({ preview: context.preview });
    if (context.existingSchedule)
      return NextResponse.json({
        scheduled: { ...context.preview, ...context.existingSchedule },
      });
    const result = await withCheckoutLease(
      context.customerId,
      context.subscription.livemode,
      async (assertHeld) => {
        await assertHeld();
        await assertAccountCanChangePlan(context.userId);
        await assertHeld();
        const fresh = await context.stripe.subscriptions.retrieve(
          context.subscription.id,
        );
        const created = await createScheduledPersonalChange({
          ...context,
          subscription: fresh,
        });
        return created;
      },
    );
    return NextResponse.json({ scheduled: { ...context.preview, ...result } });
  } catch (error) {
    return responseError(error);
  }
}

/** Read only the schedule this surface created; unrelated Stripe schedules stay untouched. */
export async function GET() {
  try {
    const { customerId } = await personalContext();
    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const subscription = subscriptions.data.find(
      (candidate) =>
        ["active", "trialing"].includes(candidate.status) && candidate.schedule,
    );
    if (!subscription) return NextResponse.json({ scheduled: null });
    const scheduleId =
      typeof subscription.schedule === "string"
        ? subscription.schedule
        : subscription.schedule.id;
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    if (schedule.metadata?.purpose !== "matrx_personal_plan_change")
      return NextResponse.json({ scheduled: null, managedElsewhere: true });
    const future = schedule.phases.find(
      (phase) =>
        phase.start_date >=
        (schedule.current_phase?.end_date ?? Number.MAX_SAFE_INTEGER),
    );
    const target = future?.items[0];
    const priceId =
      typeof target?.price === "string" ? target.price : target?.price?.id;
    if (!schedule.current_phase || !priceId)
      throw new ScheduledChangeError(
        "The scheduled plan change is incomplete. Manage it in billing instead.",
        409,
      );
    return NextResponse.json({
      scheduled: {
        scheduleId,
        effectiveAt: schedule.current_phase.end_date,
        targetPriceId: priceId,
      },
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE() {
  try {
    const { customerId, livemode } = await personalContext();
    const stripe = getStripe();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const subscription = subscriptions.data.find(
      (candidate) =>
        ["active", "trialing"].includes(candidate.status) && candidate.schedule,
    );
    if (!subscription)
      throw new ScheduledChangeError(
        "There is no scheduled plan change to undo.",
        404,
      );
    await withCheckoutLease(customerId, livemode, async (assertHeld) => {
      await assertHeld();
      await undoScheduledPersonalChange({
        stripe,
        subscription: await stripe.subscriptions.retrieve(subscription.id),
        customerId,
      });
    });
    return NextResponse.json({ undone: true });
  } catch (error) {
    return responseError(error);
  }
}

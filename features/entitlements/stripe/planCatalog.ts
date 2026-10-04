// features/entitlements/stripe/planCatalog.ts
//
// Stripe FOLLOWS billing.plan. A plan's monthly_cents / annual_cents are the
// one price truth (set on Billing › Plans & pricing); this module makes the
// Stripe product, its recurring prices and the billing.product / billing.price
// mirror agree with them. It never creates a charge.
//
// Stripe prices are immutable, so a changed amount gets a NEW price under a
// deterministic lookup key (`matrx_<plan>_<cycle>_usd_<amount>`) and the older
// prices for that plan × cycle are archived (Stripe `active: false`, mirror
// `active = false`). Existing subscriptions keep the price they bought.
//
// Callers: checkout (one plan, on demand, when no mirrored price matches the
// plan), the admin "save price" path (every plan, then the billing-portal
// switch lists), and scripts/stripe-plan-catalog.ts.

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { StripeMode } from "@/lib/stripe/server";

type Db = SupabaseClient<Database>;
type Cycle = "monthly" | "annual";

interface CatalogPlanRow {
  plan_key: string;
  name: string;
  audience: string;
  tier: Database["billing"]["Tables"]["plan"]["Row"]["tier"];
  monthly_cents: number | null;
  annual_cents: number | null;
  organization_id: string | null;
}

export interface PlanPriceSyncRow {
  plan: string;
  cycle: Cycle;
  amount: number;
  price: string;
  created: boolean;
  archived: number;
}

const PLAN_COLUMNS = "plan_key,name,audience,tier,monthly_cents,annual_cents,organization_id";

/** The amount Stripe bills per cycle: monthly cents, or 12 × the annual per-month cents. */
export function cycleAmount(plan: Pick<CatalogPlanRow, "monthly_cents" | "annual_cents">, cycle: Cycle): number | null {
  if (cycle === "monthly") return plan.monthly_cents;
  return plan.annual_cents == null ? null : plan.annual_cents * 12;
}

function productIdFor(planKey: string): string {
  return `matrx_plan_${planKey.replaceAll("-", "_")}`;
}

async function ensureProduct(stripe: Stripe, db: Db, plan: CatalogPlanRow): Promise<{ productId: string; mirrorId: string }> {
  const productId = productIdFor(plan.plan_key);
  const name = `AI Matrx ${plan.audience === "company" ? "Business " : ""}${plan.name}`;
  let product: Stripe.Product | null = null;
  try {
    product = await stripe.products.retrieve(productId);
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
  }
  if (!product) {
    product = await stripe.products.create(
      { id: productId, name, metadata: { plan_key: plan.plan_key, purpose: "platform_subscription" } },
      { idempotencyKey: `catalog-product-${productId}` },
    );
  } else if (product.name !== name || !product.active) {
    // A renamed plan renames its product (invoices and the portal show it).
    product = await stripe.products.update(productId, { name, active: true });
  }
  const { data, error } = await db
    .schema("billing")
    .from("product")
    .upsert(
      {
        stripe_product_id: productId,
        name: product.name,
        tier: plan.tier,
        organization_id: plan.organization_id,
        active: true,
        metadata: { plan_key: plan.plan_key, purpose: "platform_subscription" },
      },
      { onConflict: "stripe_product_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`billing.product mirror for ${plan.plan_key}: ${error.message}`);
  return { productId, mirrorId: data.id };
}

async function syncCycle(
  stripe: Stripe,
  db: Db,
  mode: StripeMode,
  plan: CatalogPlanRow,
  product: { productId: string; mirrorId: string },
  cycle: Cycle,
  amount: number,
): Promise<PlanPriceSyncRow> {
  const interval = cycle === "monthly" ? "month" : "year";
  const lookupKey = `matrx_${plan.plan_key}_${cycle}_usd_${amount}`;
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 2 });
  if (found.data.length > 1) throw new Error(`Duplicate Stripe price: ${lookupKey}`);
  let price = found.data[0];
  let created = false;
  if (
    price &&
    (price.livemode !== (mode === "live") ||
      price.product !== product.productId ||
      price.unit_amount !== amount ||
      price.currency !== "usd" ||
      price.recurring?.interval !== interval ||
      price.recurring.interval_count !== 1)
  ) {
    throw new Error(`Stripe price ${lookupKey} does not match the plan`);
  }
  if (price && !price.active) price = await stripe.prices.update(price.id, { active: true });
  if (!price) {
    price = await stripe.prices.create(
      {
        product: product.productId,
        currency: "usd",
        unit_amount: amount,
        recurring: { interval },
        lookup_key: lookupKey,
        metadata: { plan_key: plan.plan_key, billing_cycle: cycle, purpose: "platform_subscription" },
      },
      { idempotencyKey: `catalog-price-${lookupKey}` },
    );
    created = true;
  }
  const { error } = await db
    .schema("billing")
    .from("price")
    .upsert(
      {
        stripe_price_id: price.id,
        product_id: product.mirrorId,
        organization_id: plan.organization_id,
        currency: "usd",
        unit_amount: amount,
        interval,
        interval_count: 1,
        active: true,
        livemode: mode === "live",
        metadata: { plan_key: plan.plan_key, billing_cycle: cycle, stripe_mode: mode, purpose: "platform_subscription" },
      },
      { onConflict: "stripe_price_id" },
    );
  if (error) throw new Error(`billing.price mirror for ${lookupKey}: ${error.message}`);

  // Archive every other active price for this plan × cycle in this ledger.
  const { data: stale, error: staleError } = await db
    .schema("billing")
    .from("price")
    .select("stripe_price_id")
    .eq("livemode", mode === "live")
    .eq("active", true)
    .eq("interval", interval)
    .contains("metadata", { plan_key: plan.plan_key })
    .neq("stripe_price_id", price.id);
  if (staleError) throw new Error(`billing.price read for ${plan.plan_key}: ${staleError.message}`);
  for (const row of stale ?? []) {
    if (!row.stripe_price_id) continue;
    await stripe.prices.update(row.stripe_price_id, { active: false });
    const { error: archiveError } = await db
      .schema("billing")
      .from("price")
      .update({ active: false })
      .eq("stripe_price_id", row.stripe_price_id);
    if (archiveError) throw new Error(`billing.price archive ${row.stripe_price_id}: ${archiveError.message}`);
  }
  return { plan: plan.plan_key, cycle, amount, price: price.id, created, archived: stale?.length ?? 0 };
}

/** Bring one plan's Stripe product + prices in line with its billing.plan row. */
export async function syncPlanPrices(stripe: Stripe, db: Db, mode: StripeMode, planKey: string): Promise<PlanPriceSyncRow[]> {
  const { data: plan, error } = await db
    .schema("billing")
    .from("plan")
    .select(PLAN_COLUMNS)
    .eq("plan_key", planKey)
    .eq("active", true)
    .is("deleted_at", null)
    .single();
  if (error) throw new Error(`billing.plan ${planKey}: ${error.message}`);
  return syncOne(stripe, db, mode, plan);
}

async function syncOne(stripe: Stripe, db: Db, mode: StripeMode, plan: CatalogPlanRow): Promise<PlanPriceSyncRow[]> {
  if (!plan.monthly_cents || plan.monthly_cents <= 0) return [];
  const product = await ensureProduct(stripe, db, plan);
  const rows: PlanPriceSyncRow[] = [];
  for (const cycle of ["monthly", "annual"] as const) {
    const amount = cycleAmount(plan, cycle);
    if (amount == null || amount <= 0) continue;
    if (!Number.isSafeInteger(amount)) throw new Error(`Invalid ${plan.plan_key} ${cycle} amount`);
    rows.push(await syncCycle(stripe, db, mode, plan, product, cycle, amount));
  }
  return rows;
}

/**
 * Every active paid plan, then the billing-portal "switch plan" lists so a
 * subscriber can move to the current prices. Returns one row per plan × cycle.
 */
export async function syncAllPlanPrices(stripe: Stripe, db: Db, mode: StripeMode): Promise<PlanPriceSyncRow[]> {
  const { data: plans, error } = await db
    .schema("billing")
    .from("plan")
    .select(PLAN_COLUMNS)
    .eq("active", true)
    .is("deleted_at", null)
    .gt("monthly_cents", 0)
    .order("rank");
  if (error) throw new Error(`billing.plan: ${error.message}`);
  const rows: PlanPriceSyncRow[] = [];
  const portalProducts: Array<{ product: string; prices: string[]; audience: string }> = [];
  for (const plan of plans ?? []) {
    const planRows = await syncOne(stripe, db, mode, plan);
    rows.push(...planRows);
    if (planRows.length) {
      portalProducts.push({
        product: productIdFor(plan.plan_key),
        prices: planRows.map((r) => r.price),
        audience: plan.audience,
      });
    }
  }
  await syncPortalConfigurations(stripe, portalProducts);
  return rows;
}

async function syncPortalConfigurations(
  stripe: Stripe,
  portalProducts: Array<{ product: string; prices: string[]; audience: string }>,
): Promise<void> {
  const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
  for (const audience of ["personal", "company"] as const) {
    const configuration = configs.data.find(
      (c) => c.metadata?.purpose === "platform_subscription" && c.metadata?.audience === audience,
    );
    const products = portalProducts
      .filter((p) => p.audience === audience)
      .map(({ product, prices }) => ({ product, prices }));
    const settings = {
      business_profile: {
        headline: "Manage your AI Matrx subscription",
        privacy_policy_url: "https://www.aimatrx.com/privacy-policy",
        terms_of_service_url: "https://www.aimatrx.com/terms-of-service",
      },
      default_return_url: "https://www.aimatrx.com/pricing",
      metadata: { purpose: "platform_subscription", audience },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" as const },
        subscription_update: products.length
          ? {
              enabled: true,
              default_allowed_updates: ["price" as const],
              proration_behavior: "create_prorations" as const,
              products,
            }
          : { enabled: false },
      },
    };
    if (configuration) await stripe.billingPortal.configurations.update(configuration.id, settings);
    else
      await stripe.billingPortal.configurations.create(settings, {
        idempotencyKey: `matrx-subscription-portal-${audience}-v1`,
      });
  }
}

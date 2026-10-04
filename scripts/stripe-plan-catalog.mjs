/** Reconcile Stripe's recurring prices to billing.plan; never creates a charge.
 * Usage: node scripts/stripe-plan-catalog.mjs --mode=test [--apply]
 * Separate, explicit runs are required for test and live. Existing prices are
 * immutable: changed catalog amounts receive a new deterministic lookup key.
 */
import fs from "node:fs";
import dotenv from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv.find((arg) => arg.startsWith("--mode="))?.slice(7);
if (mode !== "test" && mode !== "live") throw new Error("Specify --mode=test or --mode=live");
const apply = process.argv.includes("--apply");
const env = { ...dotenv.parse(fs.readFileSync(".env")), ...dotenv.parse(fs.readFileSync(".env.local")), ...process.env };
const key = env[mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_TEST_MODE_SECRET_KEY"];
if (!key || !env.SUPABASE_SECRET_KEY) throw new Error("Required credentials are missing");
const stripe = new Stripe(key);
const db = createClient("https://db.matrxserver.com", env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: plans, error } = await db.schema("billing").from("plan")
  .select("plan_key,name,audience,monthly_cents,annual_cents,per_seat,min_seats,organization_id,tier")
  .eq("active", true).is("deleted_at", null).gt("monthly_cents", 0).order("rank");
if (error) throw new Error(error.message);
const portalProducts = [];
for (const plan of plans) {
  const productId = `matrx_plan_${plan.plan_key.replaceAll("-", "_")}`;
  let product;
  try { product = await stripe.products.retrieve(productId); }
  catch (error) { if (error.code !== "resource_missing") throw error; }
  if (apply && !product) product = await stripe.products.create({
    id: productId, name: `AI Matrx ${plan.audience === "company" ? "Business " : ""}${plan.name}`,
    metadata: { plan_key: plan.plan_key, purpose: "platform_subscription" },
  }, { idempotencyKey: `catalog-product-${productId}` });
  let mirrorProduct;
  if (apply) {
    const result = await db.schema("billing").from("product").upsert({
      stripe_product_id: productId, name: product.name, tier: plan.tier,
      organization_id: plan.organization_id, active: true,
      metadata: { plan_key: plan.plan_key, purpose: "platform_subscription" },
    }, { onConflict: "stripe_product_id" }).select("id").single();
    if (result.error) throw new Error(result.error.message);
    mirrorProduct = result.data;
  }
  const priceIds = [];
  for (const cycle of ["monthly", "annual"]) {
    const amount = cycle === "monthly" ? plan.monthly_cents : plan.annual_cents == null ? null : plan.annual_cents * 12;
    if (amount == null) continue;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Invalid ${plan.plan_key} amount`);
    const interval = cycle === "monthly" ? "month" : "year";
    const lookupKey = `matrx_${plan.plan_key}_${cycle}_usd_${amount}`;
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 2 });
    if (found.data.length > 1) throw new Error(`Duplicate price: ${lookupKey}`);
    let price = found.data[0];
    if (price && (price.livemode !== (mode === "live") || price.product !== productId || price.unit_amount !== amount || price.currency !== "usd" || price.recurring?.interval !== interval || price.recurring.interval_count !== 1 || !price.active)) {
      throw new Error(`Existing price does not match catalog: ${lookupKey}`);
    }
    if (!price && apply) price = await stripe.prices.create({
      product: productId, currency: "usd", unit_amount: amount,
      recurring: { interval }, lookup_key: lookupKey,
      metadata: { plan_key: plan.plan_key, billing_cycle: cycle, purpose: "platform_subscription" },
    }, { idempotencyKey: `catalog-price-${lookupKey}` });
    if (apply) {
      const result = await db.schema("billing").from("price").upsert({
        stripe_price_id: price.id, product_id: mirrorProduct.id,
        organization_id: plan.organization_id, currency: "usd", unit_amount: amount,
        interval, interval_count: 1, active: true,
        livemode: mode === "live",
        metadata: { plan_key: plan.plan_key, billing_cycle: cycle, stripe_mode: mode, purpose: "platform_subscription" },
      }, { onConflict: "stripe_price_id" });
      if (result.error) throw new Error(result.error.message);
    }
    console.log(JSON.stringify({ mode, plan: plan.plan_key, cycle, amount, quantity: plan.per_seat ? plan.min_seats : 1, price: price?.id ?? "would_create" }));
    if (price) priceIds.push(price.id);
  }
  if (priceIds.length) portalProducts.push({ product: productId, prices: priceIds, audience: plan.audience });
}
if (apply) {
  const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
  for (const audience of ["personal", "company"]) {
  const configuration = configs.data.find((c) => c.metadata?.purpose === "platform_subscription" && c.metadata?.audience === audience);
  const settings = {
    business_profile: { headline: "Manage your AI Matrx subscription", privacy_policy_url: "https://www.aimatrx.com/privacy-policy", terms_of_service_url: "https://www.aimatrx.com/terms-of-service" },
    default_return_url: "https://www.aimatrx.com/pricing",
    metadata: { purpose: "platform_subscription", audience },
    features: {
      invoice_history: { enabled: true }, payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products: portalProducts.filter((p) => p.audience === audience).map(({product,prices}) => ({product,prices})) },
    },
  };
  const portal = configuration ? await stripe.billingPortal.configurations.update(configuration.id, settings)
    : await stripe.billingPortal.configurations.create(settings, { idempotencyKey: `matrx-subscription-portal-${audience}-v1` });
  console.log(JSON.stringify({ mode, audience, portal: portal.id, active: portal.active, default: portal.is_default }));
  }
}

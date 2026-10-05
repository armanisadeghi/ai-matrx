/**
 * Reconcile canonical billing.subscription mirrors from Stripe's subscription
 * ledger. It never creates charges, changes subscriptions, or schedules itself.
 *
 * Usage:
 *   pnpm tsx scripts/stripe-subscription-reconcile.ts --mode=test
 *   pnpm tsx scripts/stripe-subscription-reconcile.ts --mode=test --apply
 *   pnpm tsx scripts/stripe-subscription-reconcile.ts --mode=test --starting-after=sub_...
 */
import fs from "node:fs";
import dotenv from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { syncSubscription } from "../features/entitlements/stripe/sync";

type Mode = "test" | "live";

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

const mode = argument("--mode");
if (mode !== "test" && mode !== "live") {
  throw new Error("Specify the Stripe ledger explicitly: --mode=test or --mode=live");
}
const apply = process.argv.includes("--apply");
const startingAfter = argument("--starting-after");
const max = Number(argument("--max") ?? "100");
if (!Number.isSafeInteger(max) || max <= 0) throw new Error("--max must be a positive integer");

const read = (file: string) => (fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {});
const operatorEnv = { ...process.env };
Object.assign(process.env, read(".env"), read(".env.local"), operatorEnv);
const key = process.env[mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_TEST_MODE_SECRET_KEY"];
if (!key || !process.env.SUPABASE_SECRET_KEY) throw new Error("Required credentials are missing");

const stripe = new Stripe(key);
const db = createClient<Database>("https://db.matrxserver.com", process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

async function knownPlatformSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return "missing_subscription_price";

  const [{ data: customer, error: customerError }, { data: price, error: priceError }] = await Promise.all([
    db.schema("billing").from("customer").select("stripe_customer_id").eq("stripe_customer_id", customerId).eq("livemode", subscription.livemode).maybeSingle(),
    db.schema("billing").from("price").select("stripe_price_id,metadata").eq("stripe_price_id", priceId).eq("livemode", subscription.livemode).contains("metadata", { purpose: "platform_subscription" }).maybeSingle(),
  ]);
  if (customerError) throw customerError;
  if (priceError) throw priceError;
  if (!customer) return "unknown_customer_mapping";
  if (!price) return "unknown_platform_price";
  return null;
}

async function main(): Promise<void> {
  let cursor = startingAfter;
  let scanned = 0;
  let candidates = 0;
  let repaired = 0;
  let skipped = 0;

  while (true) {
    const page = await stripe.subscriptions.list({ status: "all", limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    for (const subscription of page.data) {
      if (scanned >= max) break;
      scanned += 1;
      cursor = subscription.id;
      const skip = await knownPlatformSubscription(subscription);
      if (skip) {
        skipped += 1;
        console.log(JSON.stringify({ mode, action: "skip", subscription: subscription.id, reason: skip }));
        continue;
      }
      candidates += 1;
      if (!apply) {
        console.log(JSON.stringify({ mode, action: "would_sync", subscription: subscription.id }));
        continue;
      }
      await syncSubscription(subscription);
      repaired += 1;
      console.log(JSON.stringify({ mode, action: "synced", subscription: subscription.id }));
    }
    if (!page.has_more || scanned >= max) break;
  }
  console.log(JSON.stringify({ mode, apply, scanned, candidates, repaired, skipped, resume_from: cursor ?? null }));
}

void main();

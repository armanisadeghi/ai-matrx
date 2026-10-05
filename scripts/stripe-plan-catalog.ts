/** Reconcile Stripe's products, recurring prices and portal plan lists to
 * billing.plan; never creates a charge. The logic is the app's own
 * (features/entitlements/stripe/planCatalog.ts) — the plan editor runs the same
 * sync after a price save, and checkout runs it per plan on demand.
 * Usage: pnpm tsx scripts/stripe-plan-catalog.ts --mode=test|live
 */
import fs from "node:fs";
import dotenv from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { syncAllPlanPrices } from "../features/entitlements/stripe/planCatalog";

const requestedMode = process.argv
  .find((arg) => arg.startsWith("--mode="))
  ?.slice(7);
if (requestedMode !== "test" && requestedMode !== "live")
  throw new Error("Specify --mode=test or --mode=live");
const mode: "test" | "live" = requestedMode;
const read = (file: string) =>
  fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
const env = { ...read(".env"), ...read(".env.local"), ...process.env };
const key =
  env[mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_TEST_MODE_SECRET_KEY"];
const supabaseKey = env.SUPABASE_SECRET_KEY;
if (!key || !supabaseKey) throw new Error("Required credentials are missing");
const db = createClient<Database>("https://db.matrxserver.com", supabaseKey, {
  auth: { persistSession: false },
});
async function main(validatedMode: "test" | "live", stripeKey: string) {
  const { rows, retired, errors } = await syncAllPlanPrices(
    new Stripe(stripeKey),
    db,
    validatedMode,
  );
  for (const row of rows)
    console.log(JSON.stringify({ mode: validatedMode, ...row }));
  for (const row of retired)
    console.log(JSON.stringify({ mode: validatedMode, retired: row }));
  for (const row of errors)
    console.error(JSON.stringify({ mode: validatedMode, error: row }));
  if (errors.length) process.exitCode = 1;
}

void main(mode, key);

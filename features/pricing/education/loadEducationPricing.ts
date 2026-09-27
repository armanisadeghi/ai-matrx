// features/pricing/education/loadEducationPricing.ts
//
// DB-backed loader for the public education /pricing route (P8 F5). Reads the
// LIVE billing tables — never a hardcoded PLANS[]:
//   - Premium plan  ← billing.product + billing.price (Stripe-mirrored). Today
//     that's the seeded TEST row ("AI Matrx Premium (TEST)", $10/mo). The REAL
//     Premium number is Arman's call (product decision) — seed the real
//     billing.price row and this page reflects it with no code change.
//   - Free-tier caps ← billing.capability_limit (tier=free, month/day windows),
//     the SAME single source the resolver/meters read. How each unit reads to
//     a visitor is phrased here (HEADLINE_FREE), never the registry's action
//     label.
//
// All three tables are public-read (RLS: anon+authenticated SELECT, deny-write),
// so this runs for anonymous visitors. Reads go DIRECT to Supabase per the
// data-flow doctrine (no Python hop).

import { createClient } from "@/utils/supabase/server";
import type { Capability } from "@/features/entitlements/registry";

export interface PremiumPlan {
  /** billing.price.id — pass to /api/stripe/checkout to start a session. */
  priceId: string;
  productName: string;
  description: string | null;
  /** Price in the currency's minor unit (cents). */
  amountCents: number;
  currency: string;
  /** Billing interval ("month" | "year" | …). */
  interval: string;
  // No "is this price final" flag: the only source (product.metadata) is not
  // anon-readable, and a "test pricing" caveat is internal wording that must
  // not reach a visitor (page-pass 2026-09-27). The page shows the live active
  // price; a final price is a new billing.price row, no code change.
}

export interface FreeHighlight {
  capability: Capability;
  /** What one unit of the limit buys, phrased for a visitor ("flashcard decks"). */
  unit: string;
  limit: number;
  /** The metering window the number is counted over. */
  period: "month" | "day";
}

export interface EducationPricing {
  premium: PremiumPlan | null;
  freeHighlights: FreeHighlight[];
}

// The capabilities we headline on the Free card, in display order, each with
// the window it is shown in and how one unit reads to a visitor. The NUMBER
// always comes from billing.capability_limit (tier=free) — the same rows the
// resolver enforces; a capability with no row for its window is not shown.
// The registry labels are imperative action names ("Ingest a document"), which
// read as machine text behind a number, so the pricing page phrases the unit.
const HEADLINE_FREE: ReadonlyArray<{
  capability: Capability;
  period: "month" | "day";
  unit: string;
}> = [
  { capability: "education.ingest_document", period: "month", unit: "documents to study from" },
  { capability: "education.generate_cards", period: "month", unit: "flashcard decks" },
  { capability: "education.quiz_generate", period: "month", unit: "quizzes" },
  { capability: "education.mindmap_generate", period: "month", unit: "mind maps" },
  { capability: "education.notes_generate", period: "month", unit: "sets of smart notes" },
  { capability: "education.audio_generate", period: "month", unit: "study audio sessions" },
  { capability: "education.tutor_message", period: "day", unit: "AI tutor messages" },
  { capability: "education.live_grade", period: "day", unit: "live AI gradings" },
];

// PRELAUNCH_COMPLIMENTARY_PREMIUM lives in ./pricingPolicy.ts — a plain module,
// because the client card needs it and this loader is server-only.

/**
 * Every read here is BOUNDED. This loader runs inside the server render of a
 * public page; an unanswered database read used to hold that render until the
 * hosting platform killed it (504 FUNCTION_INVOCATION_TIMEOUT at ~15 s, seen
 * 2026-09-27 while every anon PostgREST read hung). A bounded read fails fast
 * with a sentence naming the table, and the route's error boundary renders —
 * never a silent empty card, never a platform timeout page.
 */
export const PRICING_READ_TIMEOUT_MS = 6000;

async function bounded<T>(table: string, query: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `The public pricing page could not read ${table}: the database did not ` +
              `answer within ${PRICING_READ_TIMEOUT_MS} ms.`,
          ),
        ),
      PRICING_READ_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([Promise.resolve(query), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadEducationPricing(): Promise<EducationPricing> {
  const supabase = await createClient();

  // --- Premium: active product + its active recurring price -----------------
  let premium: PremiumPlan | null = null;
  // DD-230 (2026-09-14): this loader runs on a PUBLIC route, so for a
  // signed-out visitor `createClient()` carries no cookie and the read runs as
  // `anon` — which holds a COLUMN grant on billing.product, not a table grant.
  // `metadata` is one of the five columns it may NOT read (DD-186: identity,
  // bookkeeping and metadata leave regardless), so asking for it returned
  // **42501 for the whole row** and this loader — which ignored `error` —
  // silently set `premium = null` and the page rendered "Coming soon" over a
  // live, active product. Measured on production that morning: five
  // `product?select=id,name,description,metadata` 401s with no JWT in 24 h.
  const { data: product, error: productError } = await bounded(
    "billing.product",
    supabase
      .schema("billing")
      .from("product")
      .select("id, name, description, tier, active")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  );

  // Nothing fails silently: "Coming soon" is a claim about the catalogue, and a
  // refused query cannot support it.
  if (productError) {
    throw new Error(
      `The public pricing page could not read billing.product: ` +
        `${productError.message}` +
        (productError.code ? ` (${productError.code})` : "") +
        `. The signed-out column bound for this table is declared in ` +
        `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE.`,
    );
  }

  if (product) {
    const { data: price, error: priceError } = await bounded(
      "billing.price",
      supabase
        .schema("billing")
        .from("price")
        .select("id, unit_amount, currency, interval, active")
        .eq("product_id", product.id)
        .eq("active", true)
        .order("unit_amount", { ascending: true })
        .limit(1)
        .maybeSingle(),
    );

    if (priceError) {
      throw new Error(
        `The public pricing page could not read billing.price: ` +
          `${priceError.message}` +
          (priceError.code ? ` (${priceError.code})` : "") +
          `. The signed-out column bound for this table is declared in ` +
          `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE.`,
      );
    }

    if (price && price.unit_amount != null) {
      premium = {
        priceId: price.id,
        productName: product.name,
        description: product.description,
        amountCents: price.unit_amount,
        currency: price.currency ?? "usd",
        interval: price.interval ?? "month",
      };
    }
  }

  // --- Free-tier headline caps (monthly + daily windows) --------------------
  const { data: limits, error: limitsError } = await bounded(
    "billing.capability_limit",
    supabase
      .schema("billing")
      .from("capability_limit")
      .select("capability, limit_value, period, tier")
      .eq("tier", "free")
      .in("period", ["month", "day"]),
  );

  // Same rule as the product/price reads: a Free card silently missing its
  // limits would claim "no limits" over a refused query.
  if (limitsError) {
    throw new Error(
      `The public pricing page could not read billing.capability_limit: ` +
        `${limitsError.message}` +
        (limitsError.code ? ` (${limitsError.code})` : "") +
        `. The signed-out column bound for this table is declared in ` +
        `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE.`,
    );
  }

  const limitByCapPeriod = new Map<string, number>();
  for (const row of limits ?? []) {
    if (row.limit_value != null) {
      limitByCapPeriod.set(`${row.capability}:${row.period}`, row.limit_value);
    }
  }

  const freeHighlights: FreeHighlight[] = HEADLINE_FREE.flatMap((h) => {
    const limit = limitByCapPeriod.get(`${h.capability}:${h.period}`);
    if (limit == null) return [];
    return [{ capability: h.capability, unit: h.unit, limit, period: h.period }];
  });

  return { premium, freeHighlights };
}

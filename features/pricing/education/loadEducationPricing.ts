// features/pricing/education/loadEducationPricing.ts
//
// DB-backed loader for the public education /pricing route (P8 F5). Reads the
// LIVE billing tables — never a hardcoded PLANS[]:
//   - Premium plan  ← billing.product + billing.price (Stripe-mirrored). Today
//     that's the seeded TEST row ("AI Matrx Premium (TEST)", $10/mo). The REAL
//     Premium number is Arman's call (product decision) — seed the real
//     billing.price row and this page reflects it with no code change.
//   - Free-tier caps ← billing.capability_limit (tier=free, monthly window),
//     the SAME single source the resolver/meters read. Labels come from the
//     client capability registry (pure TS, import-safe on the server).
//
// All three tables are public-read (RLS: anon+authenticated SELECT, deny-write),
// so this runs for anonymous visitors. Reads go DIRECT to Supabase per the
// data-flow doctrine (no Python hop).

import { createClient } from "@/utils/supabase/server";
import { CAPABILITY_REGISTRY, type Capability } from "@/features/entitlements/registry";

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
  /**
   * True when the page cannot PROVE this price is final, which — until a
   * signed-off price is seeded — is always. See `loadEducationPricing`.
   */
  isTest: boolean;
}

export interface FreeHighlight {
  capability: Capability;
  label: string;
  monthly: number;
}

export interface EducationPricing {
  premium: PremiumPlan | null;
  freeHighlights: FreeHighlight[];
}

// The capabilities we headline on the Free card, in display order. A curated
// subset of the metered set (the full matrix lives in billing.capability_limit).
const HEADLINE_FREE: Capability[] = [
  "education.ingest_document",
  "education.generate_cards",
  "education.quiz_generate",
  "education.mindmap_generate",
  "education.notes_generate",
  "education.audio_generate",
];

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
  const { data: product, error: productError } = await supabase
    .schema("billing")
    .from("product")
    .select("id, name, description, tier, active")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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
    const { data: price, error: priceError } = await supabase
      .schema("billing")
      .from("price")
      .select("id, unit_amount, currency, interval, active")
      .eq("product_id", product.id)
      .eq("active", true)
      .order("unit_amount", { ascending: true })
      .limit(1)
      .maybeSingle();

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
        // FAIL-SAFE, not a guess. The flag that used to answer this lived in
        // `billing.product.metadata.matrx_test`, which a signed-out reader may
        // not read and must not — so the page cannot prove a price is final and
        // therefore never claims one is. It always renders the "introductory
        // test pricing — final pricing coming soon" caveat beside the number.
        // When a signed-off price ships, the honest way to drop the caveat is a
        // column `anon` may read (a `billing.price.is_final`), not a metadata
        // grant. Until then the caveat is the truthful state.
        isTest: true,
      };
    }
  }

  // --- Free-tier headline caps (monthly window) -----------------------------
  const { data: limits } = await supabase
    .schema("billing")
    .from("capability_limit")
    .select("capability, limit_value, period, tier")
    .eq("tier", "free")
    .eq("period", "month");

  const monthlyByCap = new Map<string, number>();
  for (const row of limits ?? []) {
    if (row.limit_value != null) monthlyByCap.set(row.capability, row.limit_value);
  }

  const freeHighlights: FreeHighlight[] = HEADLINE_FREE.flatMap((cap) => {
    const monthly = monthlyByCap.get(cap);
    if (monthly == null) return [];
    return [{ capability: cap, label: CAPABILITY_REGISTRY[cap].label, monthly }];
  });

  return { premium, freeHighlights };
}

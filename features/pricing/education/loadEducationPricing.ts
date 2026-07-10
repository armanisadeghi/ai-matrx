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
  /** True when this is the seeded placeholder, not a real signed-off price. */
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
  const { data: product } = await supabase
    .schema("billing")
    .from("product")
    .select("id, name, description, metadata")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (product) {
    const { data: price } = await supabase
      .schema("billing")
      .from("price")
      .select("id, unit_amount, currency, interval, active")
      .eq("product_id", product.id)
      .eq("active", true)
      .order("unit_amount", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (price && price.unit_amount != null) {
      const meta = (product.metadata ?? {}) as Record<string, unknown>;
      premium = {
        priceId: price.id,
        productName: product.name,
        description: product.description,
        amountCents: price.unit_amount,
        currency: price.currency ?? "usd",
        interval: price.interval ?? "month",
        isTest: meta.matrx_test === true,
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

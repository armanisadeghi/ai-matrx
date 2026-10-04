// Education uses the same paid plan catalog as every other upgrade surface.
import { parsePlanCatalog } from "@/features/entitlements/catalog/parse";
import { createClient } from "@/utils/supabase/server";
import type { Capability } from "@/features/entitlements/registry";

export interface PremiumPlan {
  /** Registered platform plan — checkout resolves its mode-specific price. */
  planKey: string;
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

/**
 * The Free tier's rolling 5-hour pacing, shown as a real limit line (not small
 * print): one representative capability's `rolling_5h` row.
 */
export interface FreePacing {
  unit: string;
  limit: number;
}

export interface EducationPricing {
  premium: PremiumPlan | null;
  freeHighlights: FreeHighlight[];
  /** `null` when no rolling_5h row exists for the pacing capability. */
  freePacing: FreePacing | null;
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
  {
    capability: "education.ingest_document",
    period: "month",
    unit: "documents to study from",
  },
  {
    capability: "education.generate_cards",
    period: "month",
    unit: "flashcard decks",
  },
  { capability: "education.quiz_generate", period: "month", unit: "quizzes" },
  {
    capability: "education.mindmap_generate",
    period: "month",
    unit: "mind maps",
  },
  {
    capability: "education.notes_generate",
    period: "month",
    unit: "sets of smart notes",
  },
  {
    capability: "education.audio_generate",
    period: "month",
    unit: "study audio sessions",
  },
  {
    capability: "education.tutor_message",
    period: "day",
    unit: "AI tutor messages",
  },
  {
    capability: "education.live_grade",
    period: "day",
    unit: "live AI gradings",
  },
];

// PRELAUNCH_COMPLIMENTARY_PREMIUM lives in ./pricingPolicy.ts — a plain module,
// because the client card needs it and this loader is server-only.

// The capability whose rolling 5-hour cap stands for the Free tier's pacing.
const PACING = {
  capability: "education.generate_cards" as Capability,
  unit: "flashcard decks",
};

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

  const { data: catalog, error: catalogError } = await bounded(
    "billing.plan_catalog",
    supabase.schema("billing").rpc("plan_catalog"),
  );
  if (catalogError)
    throw new Error(
      "The pricing catalog could not be loaded: " + catalogError.message,
    );
  const entry = parsePlanCatalog(catalog)
    .filter(
      (p) =>
        p.audience === "personal" &&
        p.tier === "premium" &&
        p.monthlyCents != null &&
        p.monthlyCents > 0,
    )
    .sort((a, b) => a.monthlyCents! - b.monthlyCents!)[0];
  const premium: PremiumPlan | null =
    entry && entry.monthlyCents != null
      ? {
          planKey: entry.planKey,
          productName: entry.name,
          description: entry.tagline,
          amountCents: entry.monthlyCents,
          currency: "usd",
          interval: "month",
        }
      : null;

  // --- Free-tier headline caps (month + day windows) + 5-hour pacing ---------
  const { data: limits, error: limitsError } = await bounded(
    "billing.capability_limit",
    supabase
      .schema("billing")
      .from("capability_limit")
      .select("capability, limit_value, period, tier")
      .eq("tier", "free")
      .in("period", ["month", "day", "rolling_5h"]),
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
    return [
      { capability: h.capability, unit: h.unit, limit, period: h.period },
    ];
  });

  const pacingLimit = limitByCapPeriod.get(`${PACING.capability}:rolling_5h`);
  const freePacing: FreePacing | null =
    pacingLimit == null ? null : { unit: PACING.unit, limit: pacingLimit };

  return { premium, freeHighlights, freePacing };
}

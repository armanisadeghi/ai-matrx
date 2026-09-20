// features/masterwork/record/openingRates.ts
//
// 🚨 HOW LONG THE THREE MASTERWORK OPENINGS ACTUALLY TAKE — so the three
// screens that make an Expert wait on them can show a clock and a promise
// instead of a motionless word.
//
// ## The defect
//
// Cold walk 13 (2026-09-20, `common-docs/projects/masterwork-methods-census/
// jobs-bar-2026-09-16/cold-walk-13/README.md`, N8 + Friction): three waits on
// the main path said nothing at all about duration.
//
//   * "Start" on New Masterwork step 2 sat on **"Starting…"** for 45–51s;
//   * "Start the interview" showed a bare skeleton for **60s**;
//   * "Continue this one" after a reload showed the same skeleton for **53s**.
//
// The product's own distillation and Shadow panels already do this right —
// *"25s so far — this usually takes about 2 minutes."* — through
// `lib/progress/WorkingNotice.tsx`. These three never reached it.
//
// ## What the work really costs (measured 2026-09-20)
//
// None of the three calls aidream and none of them runs a model. The Scout's
// first generation only starts when the Expert SENDS a turn.
//
//   * `INSERT platform.rulebook` including all five triggers — **3.29 ms mean,
//     434 ms worst of 837 calls** (`pg_stat_statements`).
//   * `agx_get_execution_full` for the Scout — **6.5 ms** (`EXPLAIN ANALYZE`).
//   * `mandate.definition` lookups — 0.05–6.8 ms.
//   * `chat.message` by conversation — 0.17–23 ms.
//   * Production `GET /masterwork` — **0.79 s** (`curl`).
//
// The walk's 45–60 s were `next dev` FIRST-VISIT ROUTE COMPILATION on its
// preview: the same log shows `/masterwork/[id]` costing 59 s of which 56 s
// was compile and 234 ms warm, and `/dashboard` and `/libraries` — nothing to
// do with Masterwork — costing 36 s and 44 s the same way.
//
// ## Why the numbers below are the SMALL ones and not the walked ones
//
// Because they are the truth about the work, and `elapsedDetail`
// (`lib/progress/elapsed.ts`) is built for exactly this: it promises the usual
// time until the promise is overtaken and then stops promising and reports —
// *"48s so far — longer than usual. Nothing has failed."* That sentence is the
// honest one on a 14 GB dev server, and it is the sentence the walker needed
// at second 20. A promise inflated to cover the slowest environment anyone has
// ever measured would never correct itself, and would tell every Expert on
// production that a two-second wait is normally a minute.
//
// 🚨 RE-MEASURE when any of these paths changes, and take the number from
// production or a `next build && next start` preview. A `next dev` first-visit
// number is a reading of the machine, not of the product.

/**
 * "Start" on New Masterwork step 2 → the Rulebook open in front of the Expert.
 * One INSERT plus the destination route.
 */
export const NEW_RULEBOOK_OPENING_MS = 3_000;

/**
 * "Start the interview" → the first question on screen. The Mandate
 * resolution, the Rulebook document and the interview history run
 * concurrently; the launch itself is four serial round-trips
 * (`agx_get_execution_full` → create instance → resolve mapping layers →
 * prepare mappings).
 */
export const INTERVIEW_OPENING_MS = 6_000;

/**
 * "Continue this one" → the prior transcript back on screen. Create the
 * instance, fetch the messages, re-surface any unanswered tool prompt.
 */
export const INTERVIEW_RESUME_MS = 6_000;

/**
 * Reading the Rulebook's interview history before the chooser can be drawn.
 * One `assoc` RPC, then a conversation select and a message-count select.
 */
export const INTERVIEW_HISTORY_MS = 4_000;

/** Where every number above came from. Cited on the surfaces that use them. */
export const OPENING_RATES_MEASURED_FROM =
  "pg_stat_statements + EXPLAIN ANALYZE on the platform database and a production GET /masterwork, 2026-09-20 (cold walk 13's 45-60s were next-dev route compilation, not product latency)";

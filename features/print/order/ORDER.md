# Lulu print calculator + paid order flow (`/print/order`)

Configure a book, get a live Lulu quote, and buy the print through Stripe Checkout —
but only when the backend confirms which payment mode it is in. The server re-quotes
authoritatively, applies the buyer's plan markup, and answers with a real Checkout
URL; this surface never computes a price.

Review row: `agent.review_queue` `d6a2d36d-f2e4-4005-9ec8-c3499e1fcda9`.

## 🚨 THE LIVE-MONEY GATE — do not remove

This surface can open a REAL Stripe checkout. On 2026-09-07 an independent reviewer
driving it from `localhost:3001` was handed an actual `cs_live_` session, under a
screen that asserted "test mode when pointed at localhost". A page can never know
that: the base-URL resolver follows the admin server toggle, so a local page may be
talking to production.

Only the backend can answer "whose money is this?" — `GET /lulu/payment-mode`
(aidream `commerce_mode.py`, commit `1c26399d0`), which also refuses mismatched
Lulu/Stripe pairings (THE PAIRING LAW) and refuses a live charge returning to
`localhost`/`127.0.0.1` (THE DEV-ORIGIN LAW), before any provider call.

**That commit deployed on 2026-09-07**, mid-repair: production `GET
/lulu/payment-mode` answers, and both the path and `PrintPaymentMode` are in the
generated contract. So `ordering-gate.ts` reads it through the **contract-bound typed
client** like every other call in this folder — no raw lane, no locally-declared
shadow of the response shape — badges exactly what comes back, and keeps `Order &
pay` disabled unless `pairing_ok === true`.

Three layers, weakest last:

1. **Server** — refuses mismatched pairings and refuses a live charge returning to
   localhost, before any provider call.
2. **This page** — the badge tells the human up front; the button will not enable on
   an unknown, refused, or unanswered mode.
3. **At redirect** — `stripeCheckoutMode()` sniffs `cs_live_` and makes a live
   checkout state its consequence before opening.

### The four badge states (all covered by the forcing test)

| Backend answer | Badge | `Order & pay` |
|---|---|---|
| not yet answered | "Checking which payment mode this backend is in…" | disabled |
| 404 / error | "Ordering is off — could not confirm payment mode." | disabled |
| 200, `pairing_ok: false` | "Ordering is off — the backend refuses this pairing" (red) | disabled |
| 200, `pairing_ok: true`, not charging real money | "Test mode — no real money" | enabled with a complete form |
| 200, `pairing_ok: true`, charging real money | "Live mode — real money" (amber) | enabled with a complete form |

Fail closed is the rule: `readPaymentMode` never throws, never guesses, and anything
short of a clean `pairing_ok: true` keeps the button shut. If this reader ever stops
compiling again, the backend was rolled back — **fix the reader, and leave ordering
shut while you do. Never delete the gate.**

### History — three deletions in one evening, and what they were actually about

| Commit | What it did |
|---|---|
| `f57438c08c` | First gate: badge + `orderingAllowed`, read via the typed client and the generated `PrintPaymentMode` type. |
| `f7a9e3c297` | Deleted it. `sync-types` had regenerated the contract without the undeployed route, so `PrintPaymentMode` vanished and the typed usage stopped compiling. |
| `05964c5d21` | Re-landed it sync-proof: raw lane + a narrow local type validated out of `unknown`, plus a forcing test. |
| `2d90e58b23` | Bare `git revert` of that, empty message, no stated reason. |
| `774afb54c2` | Restored it, with the reasoning in the commit message. |
| `69e8b9ff7f` | Deleted it again, this time with a reason: no raw shadow response type for a route absent from the canonical contract. |
| `9e880748fe` | Kept the safety, dropped the disputed mechanism: ordering simply shut, plus a contract tripwire that fires the moment the route lands. |
| *this version* | aidream deployed the route mid-repair and the tripwire fired as designed — so the badge is back, on the TYPED client, which is what both sides wanted all along. |

The disagreement was always about HOW to read the backend, never about whether
ordering should be open while the payment mode is unknowable. The deploy resolved it:
there is no longer any reason to read the route any way but the contract-bound one.

### The forcing test

`__tests__/order-gate.test.tsx` renders the real `OrderFlow` with the payment-mode
call mocked at the typed-client seam and asserts the BUTTON, not an internal flag:
404 → disabled + off-state text; `pairing_ok: false` → disabled; unanswered →
disabled; `createOrder` never called on a click while the gate is shut; and
`pairing_ok: true` + complete form → enabled. No test can reach checkout
(`createOrder` is mocked and throws). Proven falsifiable: removing
`paymentModeAllowsOrdering` from `formComplete` turns 4 of the 5 red.

```bash
npx jest "features/print/order/__tests__/order-gate" --no-coverage
```

## Files

- `PrintOrderWorkspace.tsx` — the configurator + quote (route: `app/(core)/print/order/page.tsx`).
- `OrderFlow.tsx` — order form, `PaymentModeBadge`, the gate, the orders list.
- `ordering-gate.ts` — the backend's payment-mode answer and THE GATE.
- `order-api.ts` / `lulu-api.ts` — typed-client transport for the contract-bound routes.

## Change Log

- **2026-09-07** — Live-money gate re-landed for good after three deletions in one
  evening. Ordering was shut outright while the route was undeployed; aidream then
  deployed it, the contract tripwire fired as designed, and the badge came back on
  the typed client. Forcing test covers all four states plus "never starts a
  checkout while shut".

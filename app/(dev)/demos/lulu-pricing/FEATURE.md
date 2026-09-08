# Lulu print calculator + paid order flow (`/demos/lulu-pricing`)

Configure a book, get a live Lulu quote, and buy the print through Stripe Checkout.
The server re-quotes authoritatively, applies the buyer's plan markup, and answers
with a real Checkout URL; payment fulfils the order server-side and a rejected file
auto-refunds. This surface never computes a price.

Review row: `agent.review_queue` `d6a2d36d-f2e4-4005-9ec8-c3499e1fcda9`.

## 🚨 THE LIVE-MONEY GATE — do not remove

This demo can spend real money. On 2026-09-07 a reviewer driving it from
`localhost:3001` was handed a REAL `cs_live_` Stripe session, under a screen that
asserted "test mode when pointed at localhost". A page cannot know that: the
base-URL resolver follows the admin server toggle, so a local page may be talking
to production.

Three layers, weakest last:

1. **Server** — aidream `commerce_mode.py` (commit `1c26399d0`) refuses a charge
   whose Lulu and Stripe modes disagree (THE PAIRING LAW) and refuses a live charge
   returning to `localhost`/`127.0.0.1` (THE DEV-ORIGIN LAW), before any provider call.
2. **This page** — `payment-mode.ts` asks `GET /lulu/payment-mode` what the BACKEND
   is, badges the answer verbatim, and keeps `Order & pay` disabled unless the
   backend reports `pairing_ok === true`.
3. **At redirect** — `stripeCheckoutMode()` sniffs `cs_live_` in the returned
   Checkout URL and makes a live checkout state its consequence before opening.

### The four badge states (all forced by tests)

| Backend answer | Badge | `Order & pay` |
|---|---|---|
| not yet answered | "Checking which payment mode this backend is in…" | disabled |
| 404 / error / malformed payload | "Ordering is off — could not confirm payment mode." | disabled |
| 200, `pairing_ok: false` | "Ordering is off — the backend refuses this pairing" (red) | disabled |
| 200, `pairing_ok: true`, `charges_real_money: false` | "Test mode — no real money" | enabled with a complete form |
| 200, `pairing_ok: true`, `charges_real_money: true` | "Live mode — real money" (amber) | enabled with a complete form |

Fail closed is the rule: anything short of a well-formed `pairing_ok: true` keeps
the button shut. `probePaymentMode` never throws and never defaults a field.

### Why the reader is deliberately NOT on the typed client

Commit `f57438c08c` built this gate on `apiGet` + the generated `PrintPaymentMode`
type. `/lulu/payment-mode` is not in the LIVE OpenAPI contract yet (aidream has not
deployed `1c26399d0` — production returns **404** as of 2026-09-07), so the next
`pnpm sync-types` regenerated `types/python-generated/*` without it, the typed usage
stopped compiling, and commit `f7a9e3c297` deleted all 127 lines of the gate to make
the build green. A live-money guard was removed to silence a type error.

So `payment-mode.ts` binds to nothing sync-types can regenerate: the raw lane
(`getJson` from `@/lib/python-client` — `lib/api/FEATURE.md`'s documented exception
for "endpoints absent from `paths`; nothing to bind to"; `apiGet`'s path parameter is
`keyof paths` and cannot express this route today) plus a narrow local type validated
out of `unknown`. **Typed-client conversion only after aidream ships
`/lulu/payment-mode` to prod and `sync-types` picks it up** — at which point
`payment-mode.ts` also leaves the transport-gate offender list.

If a type error ever appears at this gate: **fix the reader, never delete the gate.**

### The forcing test

`__tests__/order-gate.test.tsx` renders the real `OrderFlow` with the payment-mode
fetch mocked and asserts the BUTTON, not an internal flag: 404 → disabled + off-state
text; `pairing_ok: false` → disabled; unanswered → disabled; `pairing_ok: true` +
complete form → enabled. It never reaches checkout (`createOrder` is mocked and
throws if called). Proven falsifiable: deleting `paymentModeAllowsOrdering` from
`formComplete` turns 3 of the 4 red.

```bash
npx jest "lulu-pricing/__tests__/order-gate" --no-coverage
```

## Files

- `page.dev.tsx` — the route; configuration + quote.
- `OrderFlow.tsx` — order form, `PaymentModeBadge`, the gate, the orders list.
- `payment-mode.ts` — the backend's payment-mode answer (LIVE-MONEY GATE reader).
- `order-api.ts` / `lulu-api.ts` — typed-client transport for the contract-bound routes.

## Change Log

- **2026-09-07** — Re-landed the live-money gate after `f7a9e3c297` reverted it, this
  time sync-proof (raw lane + narrow local type, no generated symbol) and backed by
  `__tests__/order-gate.test.tsx` so the next deletion is a red test, not a green
  build. Production `GET /lulu/payment-mode` still 404s, so the live demo correctly
  shows the off state with `Order & pay` disabled until aidream deploys `1c26399d0`.

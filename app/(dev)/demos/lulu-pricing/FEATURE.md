# Lulu print calculator + paid order flow (`/demos/lulu-pricing`)

Configure a book and get a live Lulu quote. Buying the print through Stripe Checkout
is **currently switched off** — see the gate below. The server re-quotes
authoritatively and answers with a real Checkout URL; this surface never computes a
price.

Review row: `agent.review_queue` `d6a2d36d-f2e4-4005-9ec8-c3499e1fcda9`.

## 🚨 THE LIVE-MONEY GATE — ordering is OFF, and this is why

This demo can open a REAL Stripe checkout. On 2026-09-07 an independent reviewer
driving it from `localhost:3001` was handed an actual `cs_live_` session, under a
screen that asserted "test mode when pointed at localhost". A page can never know
that: the base-URL resolver follows the admin server toggle, so a local page may be
talking to production.

Only the backend can answer "whose money is this?" — `GET /lulu/payment-mode`
(aidream `commerce_mode.py`, commit `1c26399d0`), which also refuses mismatched
Lulu/Stripe pairings (THE PAIRING LAW) and refuses a live charge returning to
`localhost`/`127.0.0.1` (THE DEV-ORIGIN LAW), before any provider call.

**That commit is not deployed.** Production returns 404 and the route is absent from
the generated contract. So `ordering-gate.ts` does the only honest thing left:
`Order & pay` is disabled, and the page says why. No hostname guess, no probe of a
route the contract does not carry, no locally-declared shadow of a response shape.

`stripeCheckoutMode()`'s `cs_live_` check and its consequence-naming confirm dialog
remain in `OrderFlow.tsx` as the last layer, for the day ordering re-opens.

### How ordering re-opens — in this order

1. aidream deploys `1c26399d0`, so `GET /lulu/payment-mode` 200s in production;
2. `pnpm sync-types` brings the route into `types/python-generated`;
3. the `satisfies` tripwire in `ordering-gate.ts` **stops compiling on purpose** —
   that is how the next agent finds this file;
4. read the mode through the **typed** client, badge exactly what it says, and gate
   `Order & pay` on `pairing_ok === true`, fail-closed on any other answer.

Do not simply flip the constant. Ordering opens on a backend answer, never on a
build-time boolean.

### History — three deletions in one evening, and what they were actually about

| Commit | What it did |
|---|---|
| `f57438c08c` | First gate: badge + `orderingAllowed`, read via the typed client and the generated `PrintPaymentMode` type. |
| `f7a9e3c297` | Deleted it. `sync-types` had regenerated the contract without the undeployed route, so `PrintPaymentMode` vanished and the typed usage stopped compiling. |
| `05964c5d21` | Re-landed it sync-proof: raw lane + a narrow local type validated out of `unknown`, plus a forcing test. |
| `2d90e58b23` | Bare `git revert` of that, empty message, no stated reason. |
| `774afb54c2` | Restored it, with the reasoning in the commit message. |
| `69e8b9ff7f` | Deleted it again, this time with a reason: no raw shadow response type for a route absent from the canonical contract. |
| *this version* | Keeps the SAFETY and drops the disputed mechanism entirely — the gate now reads nothing, so there is nothing left to disagree with. |

The disagreement was always about HOW to read the backend, never about whether
ordering should be open while the payment mode is unknowable. Anyone who wants the
live badge back should deploy `1c26399d0` first; that resolves it for everybody.

### The forcing test

`__tests__/order-gate.test.tsx` renders the real `OrderFlow` and asserts the BUTTON,
not an internal flag: disabled with the form completely filled in, an honest
"Ordering is off" notice on screen, and `createOrder` never called when the button is
clicked (it is mocked to throw, so no test can reach checkout). Proven falsifiable:
removing `ORDERING_ALLOWED` from `formComplete` turns 2 of the 4 red.

```bash
npx jest "lulu-pricing/__tests__/order-gate" --no-coverage
```

## Files

- `page.dev.tsx` — the route; configuration + quote.
- `OrderFlow.tsx` — order form, the off notice, the gate, the orders list.
- `ordering-gate.ts` — THE GATE plus the contract tripwire that re-opens it.
- `order-api.ts` / `lulu-api.ts` — typed-client transport for the contract-bound routes.

## Change Log

- **2026-09-07** — Ordering switched off at the surface until the backend's
  payment-mode check is deployed, after the live-money gate was deleted three times
  in one evening over how to read an undeployed route. Safety kept, disputed
  mechanism dropped, contract tripwire + forcing test added.

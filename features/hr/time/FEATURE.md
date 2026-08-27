# features/hr/time — Time & Attendance

**Single source of truth for this feature's client half.** Register item
[HRB-015](../../../../common-docs/projects/hr-domain/REGISTER.md) (lane L3). Behaviour spec:
`../../../../common-docs/projects/hr-domain/specs/SPEC-TIME.md` — **that document is the authority
on what these surfaces do; this file is the authority on how the code is arranged and what a change
here must not break.**

## What this is

The web punch clock, the wall-tablet kiosk, the timesheet and its approval queue, the raw punch
evidence lane, the attendance-exception queue, the pay-period lifecycle, the payroll-export UI, and
the overtime pre-approval surfaces.

## THE SIX LAWS — every one of these has cost somebody money somewhere

1. **Raw is raw.** `hr.punch` is immutable except for its three void columns. Nothing anywhere edits
   a punch; a correction is a **void plus a new punch**. Every surface that shows a computed number
   can show the raw facts behind it side by side, and **the two are never conflated in one cell**. A
   voided punch renders struck through with the voiding punch as a door — *never hidden*, because a
   hidden void is a destroyed record.
2. **Every computed number carries its rule snapshot.** An OT, DT or premium figure without a path
   to `ruleVersionIds` / `engineKey` / `engineVersion` / `calc` is an **unfinished surface**, not a
   tidy one.
3. **Jurisdiction is read from the stamped record, never recomputed.** `as_of` is the *event date*,
   never `now()`. The client never passes a jurisdiction key for a record that already exists.
4. 🚨 **Money never comes from an advisory rule.** When a contributing rule is `advisory` the amount
   is **absent** and `moneyWithheld` is true. The UI renders the flag as a visible human sentence
   with a door to the rule. **It never substitutes a zero, a dash, or a guess** — and `moneyWithheld`
   exists precisely so a null can never be misread as a zero.
5. **The approval engine is the only approval engine.** This feature defines no approvals table, no
   approver column, no reminder job and no second inbox. It calls `hr_wf_*`.
6. 🚨 **Clients consume, never reimplement.** Pairing, rounding, overtime, premiums, weighted
   averages, category assignment and elapsed-hours math live server-side. **No file under this
   directory computes hours.** Subtracting `ended_at − started_at` in a browser returns 8 for a
   spring-forward night shift that was 7 (fixture `OT-DST-01`) — it is a defect wherever it appears,
   and `pnpm check:hr-time-arithmetic` is how it stays one. The one permitted client-side figure in
   the whole feature is a **preview** total from a `prospective` calc call, visibly labelled as a
   preview.

**The consequence of law 6 that is easy to miss:** a committed native HR mobile app (D1) will call
the *identical* contracts. So a behaviour that could only be described by naming a React component
is a defect in the build, exactly as it is in the spec. `api/service.ts` is that boundary — it holds
typed calls and nothing else.

## Two data lanes, and picking the wrong one is a defect

| Lane | Mechanism | What rides it |
|---|---|---|
| **Direct** | `api/service.ts` → `api/rpc.ts` → `public.hr_*` RPC | punches, clock state, timesheet reads, the approval grid, period transitions, corrections, exception resolution, every workflow decision |
| **Engine** | `lib/api/hr-contract-client.ts` → aidream `/hr/*` | recompute (E-11), the exception scan (E-12), the OT evaluator (E-55/E-56), the calc endpoints (E-03/E-04), the whole export family (E-18…E-26) |

The discriminator is SPEC-CONTRACTS §2.1's five tests, not importance. `hr_wf_decide` is *direct*
even though it is the most consequential write in the system, because the decision RPC is already
the sole writer and an HTTP wrapper would create a second path to audit. `POST /hr/exports/payroll`
is *engine* even though it looks like a read, because it reads thousands of rows, freezes text
identifiers, computes a SHA-256 over bytes and writes an append-only line set.

🚨 **Routing ordinary CRUD through the Python server is a defect, not a safety measure.**

## 🚨 `hr` is NOT exposed to PostgREST — this is the fact that shapes the whole client

Verified live 2026-08-26 against `pgrst.db_schemas` on the `authenticator` role. `supabase.schema("hr")`
and `.rpc("hr.x")` reach **nothing** from a browser (PGRST106). Every RPC this feature calls is a
thin **`public.hr_<name>` wrapper** over the body in `hr.<name>` — the live platform pattern
(`hr_kiosk_authenticate`, `hr_confidential_get`) and exactly what R-L3 U-03 ruled: `hr.<name>` in
SQL, `hr_<name>` at the call site, **never a third form**.

Adding `hr` to the exposed schema list replaces the whole value and a dropped name is an instant
platform-wide PGRST002 outage. It is a fleet-wide config change and **not a build lane's call**
(FREEZE §4 D-10 recorded the same for `esign`). Do not "fix" this by reaching for `.schema("hr")`.

## Layout

| Path | What lives there |
|---|---|
| `api/types.ts` | The RPC-lane domain types. **Temporary by construction** — when the wrappers land and `pnpm db-types` regenerates, the generated types become the source of truth and the diff against this file is the drift detector. Narrowing a generated type to match this file destroys that signal; fix this file instead. |
| `api/rpc.ts` | THE ONE DOOR. Also the RPC lane's four-case mock, the envelope unwrapping, and the snake→camel seam. Carries one narrow, loudly-commented cast whose **removal** is the drift detector. |
| `api/service.ts` | Typed calls, no behaviour. The mobile-app boundary. |
| `api/idempotencyKey.ts` | The ONE punch-key mint, shared by web, kiosk, manager entry and mobile. |
| `api/mock/registry.ts` | The direct lane's fixtures (see below). |
| `clock/`, `kiosk/`, `devices/` | The punch widget, the kiosk surfaces, the device-management panels. |
| `timesheet/`, `punches/`, `exceptions/`, `shared/` | The timesheet family and the presentational pieces every lane shares. |
| `periods/`, `exports/`, `overtime/` | Period lifecycle, the export UI, OT pre-approval. |

## The wire, and the two things about it that already broke once

The `hr_*` wrappers answer with an envelope, and **both halves of it were misread in the first
build — silently, returning `undefined` rather than failing**:

```jsonc
// refusal
{ "ok": false, "error": { "code": "hr_employment_not_found",
                          "message": "That employment record does not exist.", "details": {} } }
// success — note there is NO `data` wrapper; the payload sits beside `ok`
{ "ok": true, "punch": {…}, "clock_state": {…}, "exceptions": [] }
```

- **`error` is an OBJECT, not a string code.** Reading it as a code puts `[object Object]` where
  SPEC-TIME §2.1 requires the server's human sentence *verbatim* — and on the clock surface that is
  how an hourly employee ends up with nowhere to go.
- **There is no `data` key.** Unwrapping one yields nothing for every call in the lane.

**The SQL builds jsonb in snake_case; `types.ts` is camelCase.** The seam is `camelizeDeep` in
`api/rpc.ts` and it is deliberately in exactly one place — the alternative is a
`row.local_work_date ?? row.localWorkDate` dance half-supported in every component. Request
arguments are **not** mapped: they are the `p_`-prefixed names the functions declare.

🚨 **Some keys' values must never be mapped**, and the list lives beside the code: `calc`,
`attestation_response`, `original_values`, `metadata`, `details`, `parameters`, `resolution`,
`facts`, `scope`. `attestation_response` is the sharpest — it is SPEC-TIME §3.2's **declared**
shape and every detector, premium determination and export mapping reads `prompt_version` /
`count_owed` by those exact names (§14 D9), so renaming inside it corrupts data rather than tidying
it. The rule: exclude a key only when its value is genuinely free-form, or is evidence read back by
its stored names — **never merely because it sounds like a bag.** `config` was excluded on that
mistaken instinct and left the entire kiosk configuration `undefined`.

## The mock lane, and what it can never be used for

`NEXT_PUBLIC_HR_MOCK=1` is read in exactly one place (`features/hr/mock/transport.ts`).

- The **engine** lane has the 243-file G1-frozen fixture set covering the sixty HTTP operations.
- The **direct** lane has **none of those** — a punch is not an HTTP operation — so it carries its
  own four-case set at `api/mock/registry.ts`, under the same discipline. **It is not frozen.**

🚨 **Neither set is evidence.** D15: an independent verifier with zero authorship proves the
acceptance targets against the live UI with real data entered by real non-admin users, and
**manufactured fixture data never counts**. A screenshot of a mock verifies nothing.

## The rules that decide what a number on screen *means*

- **Every timestamp renders in the punch's stamped `tz`**, not the viewer's browser zone, with the
  zone abbreviation when they differ (`5:58 AM PDT`). A manager in New York reviewing a California
  punch must see California time, or they will approve the wrong day.
- **A cross-midnight shift belongs to its clock-in's `local_work_date`**, appears **once**, and
  carries *continues into* / *continued from* markers. A week total that double-counts a midnight
  crossing is the classic bug this rule exists to prevent.
- **The week view is keyed to the WORKWEEK** — not the calendar week, not the pay period — because
  the workweek is the OT unit. The block header names the **stamped** `weekStartDow`/`weekStartTime`,
  because an org that changed the setting later has weeks cut both ways in its history.
- **Multi-rate weeks show a *Multiple rates* marker and OT at the weighted average, as a door.**
  A single week rate is **never** displayed. There isn't one.
- **Rounding honesty:** any interval with non-zero `roundingAppliedMinutes` carries a marker, and on
  the employee's own timesheet the delta is **inline, not behind a hover** — *"Recorded 7:58–4:03.
  Paid 8:00–4:00. +1 minute."* An employee attesting to hours they cannot see the derivation of is
  attesting to nothing. **Rounding never applies to a premium line** — a meal premium is 1.0 hours by
  statute, not a measured interval.
- **Two state machines, labelled distinctly:** the grid's *row* state is
  `pay_period_employment.state` (`submitted` is never a row state; there is no `reopened` member),
  the *header* state is `pay_period.state`. Approving one person never moves the period.
- **A disagreement renders as both values side by side**, the employee's note verbatim and
  attributed, the manager's resolution in a separate labelled field. Never the manager's value with
  a footnote; never a "disputed" chip an approval clears. It survives approval, export and lock.
- **Variance with no schedule reads *"Not scheduled"*, never `0`** — a zero reads as perfect
  adherence.

## Things that are laws, not knobs

Stated here so nobody adds a switch: whether raw punches are preserved · whether a statutory premium
can be excused away · whether an advisory rule may produce money · whether a locked period can be
edited in place · whether an export can be regenerated in place · whether an acknowledged export can
be superseded · whether a contractor may punch · **whether unapproved overtime is paid** · whether
an auto-close estimate stays marked and is resolved by a human before payroll · whether a punch edit
notifies the employee. **A law with an override switch is a default.**

Everything else *is* a knob, and knobs live under `hr.time_and_attendance` in
`platform.feature_knob` — **snake_case**, per R-CORE B1 / SPEC-TIME §14 D11. R-L3 U-01's hyphenated
form is superseded and nothing is seeded under it.

## The kiosk is deliberately a dead end

`app/(kiosk)` has no app shell, no nav, no global search, no Assist strip, no user session, **no AI
at all**, and **no route to any other HR surface**. There is no employee list anywhere on it — a
list is a roster disclosure. That is a security property, not an oversight, and `pnpm check:dead-ends`
should not be "fixed" by adding a door out.

RLS admits the kiosk nowhere: `hr.punch` carries **zero `anon` table grants**, and the
`SECURITY DEFINER` functions are the only door, with the device secret and the employee PIN as the
two factors on it.

### Four kiosk decisions a future agent will otherwise undo

1. **The idle screen offers every punch kind, and that is not drift from `allowedKinds`.** The web
   clock renders `clockState.allowedKinds` because it has a subject; the kiosk **has no subject
   until the PIN is validated inside `hr_kiosk_punch`**, and there is no kiosk-callable clock-state
   RPC. Asking one would mean identifying an employee *before* authenticating them — the exact
   disclosure the PIN exists to prevent. §2.1 already rules which half is the contract: *"the
   button's absence is courtesy; the server's refusal is the contract."* Only the contract half is
   available here.
2. **The key's employment segment is a per-intent nonce** (`kiosk/useKioskPunch.ts`). The declared
   composition is `<device_or_session>:<employment>:<kind>:<local_iso_minute>`, and the kiosk cannot
   know the employment. The device id alone would collapse two people's same-minute punches onto one
   row **at a shift change**, and anything PIN-derived would put a brute-forceable 4-digit
   fingerprint into a durable, HR-readable index. A nonce held across retries preserves the retry
   guarantee and gives up only cross-page-load dedup, which the key never provided anywhere.
   🚨 **DEBT:** `hr_kiosk_punch` should re-scope the key server-side once it has resolved the
   employment. Also owed: `KioskDeviceSession.config` carries `locationName` but no IANA `tz`, so
   the key's minute is minted against the tablet's own zone.
3. **The duplicate card's one door instructs; it does not write.** §3.3 says *"That's not right"*
   opens a manager-attended correction. `hr_punch_correct` is a manager's, authenticated RPC, and
   putting it behind an anon device token would be a second, weaker path into an immutable ledger.
   So the door hands over the exact facts a manager needs and returns to idle. 🚨 **DEBT:** a
   device-callable dispute RPC before that door can do more than instruct.
4. 🚨 **The kiosk cannot collect the clock-out attestation, and does not pretend to.** L3-47 requires
   the card to show the total it is asking about and the meal rule it asks under;
   `KioskPunchResult` carries `attestationRequired` and **neither of those numbers**, and there is no
   kiosk clock-state read to get them from. A card without them would be *an attestation to an
   unstated number*, which §3.2 says is not an attestation. The confirmation states plainly that one
   is still owed. 🚨 **DEBT:** `hr_kiosk_punch` must return the attestation block the way
   `hr_clock_state` does before route 36 can satisfy L3-47.

**One fixture field is read fresh and must stay that way.** `hr_kiosk_authenticate.happy` and
`hr_kiosk_session_heartbeat.happy` compute `serverTime` in a getter. Every other value in
`api/mock/registry.ts` is frozen on purpose, but the kiosk **measures its own clock against this one
and refuses the punch beyond `maxClockSkewSeconds`** — frozen at 2026-03-17 it reports a skew of
months, so nothing downstream of authentication is reachable at all: not the PIN result, not the
confirmation, not the replay, not the duplicate card. It is one clock reading, verbatim, exactly as
a live server would answer; it simulates nothing.

## Looking at the states nobody wants to discover in production

The four-case fixture discipline only pays for itself if the ugly cases can be **opened**. Three
dev-only query parameters exist for that, all of them parsed in one place
(`clock/mockCaseParam.ts`) and all **inert unless `NEXT_PUBLIC_HR_MOCK=1`** — with the flag off they
do nothing, so none of them can ever steer a live surface into a fixture.

| Parameter | On | What it selects |
|---|---|---|
| `?case=` | routes 6, 34, 35, 36 | the fixture for the **read** — `hr_clock_state`, or the kiosk's `hr_kiosk_authenticate` |
| `?punchCase=` | routes 6, 34, 36 | the fixture for the **write** — `hr_punch_record` / `hr_kiosk_punch` |
| `?employmentId=` | route 6 | a stand-in subject |

The read and the write need **separate** selectors, and that is not a convenience. The two most
important punch fixtures sit behind states the read fixture would never let you reach: `edge` on the
punch is the *idempotent replay that must render as a success*, while `edge` on the clock state is
`blocked`, which renders no punch control at all. One selector for both makes the replay
unreachable — which is how it stays unlooked-at until a real employee double-taps.

`?employmentId=` exists because the platform's own test administrator is **not an employee of any
organisation**: `hr_my_context` returns `active.employment_id = null`, and route 6 correctly renders
*"you do not have an active job here today"* instead of a clock. Right product behaviour, useless
verification behaviour — without a subject the widget never mounts. D15's independent verifier hits
the same wall.

Worked example: `/hr/me/clock?employmentId=<id>&punchCase=edge` → clock out → answer the attestation
→ the replay confirmation, *"This was already recorded — we did not record it twice."*

## `devices/` is built against an interface because the contracts do not exist

Route 75a needs four administrator-side operations and **not one of them exists**. The lane's kiosk
RPCs are the *device's* anon-callable half; there is no administrator counterpart, and R-L3 U-09
records that `hr.kiosk_device` has no pairing-code columns at all, so `hr_kiosk_claim_pairing`
currently has nothing to read. The panels therefore take an injected `KioskDeviceAdminSource` and
the owed contracts are written down in the shape the UI needs, rather than being guessed at later:
`hr_kiosk_device_list`, `hr_kiosk_pairing_code_create`, `hr_kiosk_device_set_trust`,
`hr_kiosk_device_set_capture`. Nothing here fabricates an RPC call that would fail at runtime.

🚨 **The route file `app/(core)/hr/settings/devices/page.tsx` is NOT this lane's** — it and its
settings-tab entry are batched to lane L1 under the EXECUTION §3 shared-surface rule. The panel is
shaped so that page is one line: `<KioskDevicesPanel source={...} />`.

## Change Log

- 2026-08-27 — Routes 6, 34, 35 and 36 wired and walked through every ugly state in a browser.
  Records the four kiosk decisions above with the three contract debts they rest on, and why one
  fixture field is read fresh. Two defects fixed at the source: routes 6 and 34 hand-rolled two of
  `useHrContext`'s five states and rendered nothing at all for a viewer whose employer had not
  resolved (both now wrap `HrPageState`), and both carried an in-body `<h1>` that collided with the
  glass header at 375px. Also collapses a **duplicate** route-75a panel set that two sessions built
  simultaneously — `KioskDevicesPanel` is the one that survived.

- 2026-08-27 — The punch widget, the `(kiosk)` group and the route-75a panels. Records the three
  mock-lane query parameters and **why the read and the write need separate ones**; and why
  `devices/` is built against an injected source with four contracts owed rather than a fabricated
  RPC. Also records that `clock/punchVocabulary.ts` is deliberately NOT a duplicate of
  `shared/vocabulary.ts` — imperative control labels ("Start break") versus noun row labels
  ("Break start") — so the two are not merged into one wrong set.

- 2026-08-27 — Records the wire's real envelope after both halves were misread in the first build
  (no `data` wrapper; `error` is an object), the snake→camel seam and the opaque-key rule that goes
  with it — including the `config` exclusion that left the whole kiosk configuration undefined.
- 2026-08-26 — Created with the lane's shared data layer (`api/`) at the L3 build kickoff (HRB-015).
  Records the PostgREST finding that shapes the whole client, the two-lane split, the six laws, and
  the rendering rules that decide what a number means.

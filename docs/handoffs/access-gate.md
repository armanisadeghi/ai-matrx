# Handoff — Access Gate (nobody ever sees an access error)

**State: SHIPPED and live-integrated.** The feature is `features/access-gate/`;
its `FEATURE.md` is the durable truth (what exists, every invariant, the full
change log). **This file is only what is still ahead.** Do not restate the
feature here — if you learn something durable, it belongs in that FEATURE.md.

**Read first:** `features/access-gate/FEATURE.md`, then the cross-repo
system-of-record `/Users/armanisadeghi/code/common-docs/systems/platform/access/FEATURE.md`
(§3.9 is this lane).

**The one-line premise:** a zero-row read has FOUR causes — denied, deleted,
never existed, signed out — and RLS reports all four identically. Every surface
used to pick one and assert it. Now one resolver
(`public.access_denied_context`) answers truthfully, names the owner, and
offers Request access with one-click approval in the owner's DM.

---

## 1. The sweep tail — 543 → 319

`pnpm check:access-errors` (advisory, in the release gates; scoreboard is the
report JSON). Zero in education, files, rag, `features/marketing`, and every
`app/(core)` route. Current leaders: `features/agents` 34, `lib` 17,
`features/scope-system` 16, `app/(dev)` 13, `features/administration` 11, then
a long tail of 6–11.

A line the regexes genuinely cannot judge takes `// access-errors: ok —
<reason>`; the reason is required and the summary prints the count, so a
suppression is a sentence someone has to defend.

## 2. The sweep's two blind spots — both worth closing

- **Bare JSX text is invisible.** `<p>This doesn&apos;t exist…</p>` is not a
  quoted string, so the scanner never sees it; that is why the research-topic
  404 went unreported for months. The escaped-apostrophe case is fixed, the
  bare-JSX case is not.
- **A swallowed error makes a conversion meaningless, and the sweep scores it
  as a WIN.** Proven 2026-08-12: `getBrand` correctly threw
  `RecordUnavailableError`, but `useMarketingSiteSurfaceBase` did
  `brand.data ?? null` and never read `brand.error` — the sweep counted
  marketing as ZERO while a denied brand rendered nothing at all on every site
  route. **The pass worth building:** for every `useQuery` whose queryFn can
  throw `recordUnavailable`, assert that some consumer reads `.isError` /
  `.error`. Until that exists, a zero in this report is a floor, not a proof.

## 3. Smaller open items

- **No shell-level door to the inbox.** `/settings/access-requests` badges both
  boxes, but nothing in the app shell tells an owner a request is waiting the
  way the message icon does for unread DMs. Today the DM carries that signal —
  the day a request can arrive without a DM, this becomes a real gap.
- **Slug-addressed records have no gate.** `access_denied_context` needs a uuid;
  `/organizations/[orgId]` accepts a slug, so an unresolvable slug can only say
  the address didn't match. Same shape will hit every future slug route.
- **`requireAccess(..., { forbid: true })` has no production callsite** — built
  and browser-verified (real 403 inside the shell), deliberately unused. For the
  seven `[id]/edit` routes, redirecting is *correct* (the view route offers
  "Make a copy"). It is for future routes with no better destination.

## Attached remaining work (tasks — not separate staffing rows)

| Task | Document | Still pending |
|---|---|---|
| Access kernel scan performance | `docs/handoffs/access-kernel-scan-performance.md` | Two Arman rulings (row-attribute merge vs latent drift; parallel-safe mark), then the unfiltered `files.pages` scan that still exceeds the 8 s cap. |
| Seven access roots with no shareable-registry row | `aidream/docs/handoffs/defect-ledger-campaign.md` | Leftover from the defect ledger sweep. |

## 4. Two traps — do not rebuild these

- **A `forbidden.tsx` can never name the record.** It was built (request-scoped
  `React.cache()` target) and instrumented: the boundary reads it BEFORE the
  page writes it — literally `GET → GET → SET`. Next renders the fallback
  eagerly as part of the loader tree, so no request-scoped channel can win, and
  a module global would risk naming one user's record to another. The
  record-specific surface is `return <AccessGate token id/>` from the page
  (`app/(core)/lists/[id]/page.tsx` is live).
- **Do not add a catch-all external-token path.** Standalone projects (CMS
  `client_site` / `client_page`) each prove existence, access and disclosure at
  their own authenticated boundary. Never invent a fake Main entity row for an
  external record.

# Access Gate — nobody sees an access error, ever

**Status:** live (2026-08-11). DB + surface + owner-side approval verified end to end in the browser against real data.

The platform answer to "you can't open this". One screen, one honest sentence, and
always a way forward — plus a one-click way for the owner to say yes.

---

## THE LAW

> **A user must never be shown an RLS error, a PostgREST code, a schema name, a
> token, or a bare uuid. And a surface must never GUESS why a read came back
> empty — it must ask.**

## Why this exists

Under RLS a single-row read returns `{ data: null, error: null }` for **four**
different situations:

1. the row is soft-deleted
2. the row never existed
3. the caller isn't allowed to see it
4. the caller's session expired, so they're anonymous to Postgres

Surfaces across the app each picked one and asserted it. The incident that
produced this feature was case **4**: a signed-out tab was told
*"This site was deleted or is no longer accessible"* — about a live site, with a
Retry button that could never succeed. At the time the repo had ~339 sites
throwing raw PostgREST text at users, ~155 hand-written "no permission" strings,
no `AccessDenied` component at all, and no way for a blocked user to ask.

## The two halves

| Half | Owner | What it does |
|---|---|---|
| The **throw** | [`lib/records/recordUnavailable.ts`](../../lib/records/recordUnavailable.ts) | Refuses to claim deletion without proof, says both possibilities out loud, screams into the Error Inspector. |
| The **surface** | this feature | Asks the platform which of the four it actually is, says it in human words, and offers the next step. |

They compose. Do not add a third marker error.

**Pass the `token` when you throw.** `recordUnavailable({ entity, recordId, token })` carries the canonical entity token, and any renderer holding one should defer to `<AccessGate token id/>` rather than reciting both possibilities — describing the ambiguity is the best answer only while we cannot get the real one (live example: `features/marketing/components/shared/RecordUnavailableNotice.tsx`). A **proven** deletion is already the truth and needs no gate.

**A failed WRITE is not this.** No record to resolve, no request to offer — raise `operationFailed(action, cause)` from [`utils/errors.ts`](../../utils/errors.ts), or bind a data module's whole set of responses once with `makeAssertData(action)` (override per call for a write). **`throw new Error(error.message)` is the defect this counts**; a private per-file `assertData` copy is how ten of them appeared in marketing alone.

## Using it

```tsx
if (site.isError || !site.data) {
  return (
    <AccessGate
      token="web_site"
      id={siteId}
      error={site.error}
      onRetry={() => void site.refetch()}
      fallbackHref="/marketing/sites"
      fallbackLabel="All sites"
    />
  );
}
```

That is the whole integration. `AccessGate` resolves the true state and renders
it. The states it can render:

| Status | What the user sees |
|---|---|
| `denied` | Kind, name, owner, org + **Request access** (view / edit + a note) |
| `deleted` | "This site was deleted" — no request offer, a door back |
| `missing` | "We couldn't find this site" — the link may be wrong |
| `anonymous` | "Sign in to open this site" → `/login?next=<here>` |
| `ok` | **They DO have access** — the read failed transiently. Retry actually works. |

`ok` is the state everyone forgets. Rendering a denial to someone who has access
is the same class of lie this feature exists to kill.

## Files

| Path | Role |
|---|---|
| `components/AccessGate.tsx` | The drop-in. Fault vs access-state decision. |
| `components/ForbiddenSurface.tsx` | The SERVER face: what `forbidden.tsx` renders. Honest generic refusal — it structurally cannot name the record; the file says why. |
| `../../app/forbidden.tsx` · `../../app/(core)/forbidden.tsx` | The boundaries. Root is bare; `(core)`'s renders inside the AppShell. |
| `../../utils/permissions/requireAccess.ts` | Server-side `requireAccess(type, id, level, { forbid: true })` → real 403 + the boundary. |
| `components/AccessDenied.tsx` | The screen (+ `AccessDeniedView` for variants). |
| `components/AccessRequestsSurface.tsx` | The INBOX — both directions, at `/settings/access-requests`. Answers with the same service calls the DM chip uses; never its own copy. |
| `../../app/(core)/settings/access-requests/page.tsx` | The route. Signed-out → `ModuleSignInGate`. Reached from the settings nav (`Access requests`). |
| `components/RequestAccessPanel.tsx` | Ask → pending → answered, in place. |
| `hooks/useAccessGate.ts` | `(token, id) → status + context`. |
| `service/accessDeniedContext.ts` | Client half of `access_denied_context`. |
| `service/accessRequests.ts` | create / list / decide / report / withdraw + DM delivery. |
| — | **No variant registry.** A feature that earns a bespoke screen composes the exported `AccessDeniedView`. A token→component map consulted during render is a dynamic component boundary for an extension point with zero users — speculative abstraction, and React Compiler lint rightly flags it. |
| `classifyDataError.ts` | Access question vs real fault. |

## Database

| Object | Notes |
|---|---|
| `public.access_denied_context(type, id)` | THE resolver. Returns kind, title, owner, org, nearest reachable ancestor, the caller's own request. **Never row content.** |
| `iam.access_requests` | The ask ledger. Requester sees their own rows via RLS; the decider's inbox comes from the RPC (no per-row access resolution — the 2026-08-08 component-access precedent). |
| `access_request_create / list / decide / report / withdraw` | The verb family. |
| `platform.entity_types.allow_preview` | Per-kind disclosure switch. ONE place. `true` (default) = name+owner+org; `false` = kind only. Flip with `admin_set_entity_type_preview` (super-admin). |

## Invariants

- **Disclosure (owner ruling, 2026-08-11):** a signed-in user may see kind +
  name + owner + org. **Anonymous callers learn nothing about a non-public row —
  not even that it exists.** That closes an enumeration oracle; the signed-out
  screen reads identically either way.
- **A title that is derived from private content is content, not identity.**
  `conversation` (title generated FROM the messages) and `web_page` (its "title"
  IS the private URL) are `allow_preview = false`. Apply the same test before
  registering anything new: would naming it to a stranger reveal what's inside?
- **Never assert a delivery, a deletion, or an absence you did not verify.**
  An unregistered token surfaces as an error, not "this doesn't exist" — a
  registry bug on our side must never be reported as the user's data being gone.
  The panel says "we couldn't message them" when zero DMs landed.
- **Recipients (owner ruling, 2026-08-11):** the owner **and** the org's
  owners/admins when the org is shared. First to act wins, so a request never
  dies with one person. A personal workspace routes to the owner only — no
  duplicate message.
- **A link the viewer cannot open is worse than no link.** The owner is a door
  only when they have a public creator profile (`/c/{handle}`); the organization
  is a door only when the viewer is a member. Otherwise: identity, no link.
  *(The first cut linked `/users/{id}`, a route that does not exist — browser
  verification caught it. Do not reintroduce it.)*
- **One open request per person per record** — enforced by a partial unique
  index, so a second click is a no-op and never a second DM.
- **Delivery never fails the ask, and delivery is never the only surface.** The
  row is the durable fact; the DM is how it gets NOTICED. A request whose DM
  lands nowhere is still answerable at `/settings/access-requests`, which reads
  the ledger itself — that is the whole reason the page exists. Zero-delivery is
  still surfaced to the requester rather than hidden: "we couldn't message them"
  is true and useful, it just no longer means the ask is lost.
- Writes go through the RPC family only. Never insert `iam.permissions` or
  `iam.access_requests` from the client.

## The owner's side — two surfaces, ONE decision path

The DM is the **primary** approval surface — `access_request` in
[`messageActionRegistry`](../messaging/actions/messageActionRegistry.tsx) renders
**Let them view · Let them edit · Decline · Report** inside the bubble, because a
request answered where the owner already is beats a queue they have to remember.
Granting writes `iam.permissions` and sends the canonical `resource_shared` card
back, so the loop closes in the surface the requester already reads.

`/settings/access-requests` is the **durable** one — the ledger itself, in both
directions: *To me* (`listAccessRequests("inbox")`, pending asks I am entitled to
answer) and *I sent* (every ask I made, with its status, the decider's note, and
Withdraw while pending). It exists because the DM can fail to land.

**Both call the same functions.** `decideAccessRequest` / `reportAccessRequest`
live in `service/accessRequests.ts` and are imported by both surfaces — a second
copy of "grant then notify" is the drift this rule forbids. Adding a third
surface means importing them too, never reimplementing the RPC call.

## Open

- **The sweep.** `pnpm check:access-errors` (advisory, in the release gates)
  measures it. **543 → 353** as the conversion waves landed: education, files,
  rag, `features/marketing` and every `app/(core)` route are at ZERO. The
  biggest single bucket left is `lib` (59, of which ~45 are
  `lib/redux/app-builder/**`, the gated applets subsystem — developer-facing
  thunk errors with interpolated ids, NOT user-facing access copy; triage
  before converting, and consider excluding the subsystem outright if it stays
  gated). Then `features/agents` (34) and a long tail of 6–16 per feature.
  **A line the regexes genuinely cannot judge** — a keyword absent from page
  text, an HTTP 404 our crawler observed on someone else's site — takes
  `// access-errors: ok — <reason>`; the reason is required, and the summary
  prints how many are marked, so a suppression is a sentence someone defends.
- **The inbox has no live-count door outside its own header.** The page badges
  both boxes, but nothing in the shell tells an owner a request is waiting the
  way the message icon does for unread DMs — today the DM carries that signal.
  When a request can arrive without a DM at all, that becomes a real gap.
- **`requireAccess(..., { forbid: true })` has no production callsite yet.**
  Built and verified in the browser (real 403 + the boundary inside the shell),
  but every gated route still redirects — and for the seven `[id]/edit` routes
  that is *correct*, because the view route offers "Make a copy". The flag is
  for future routes with no better destination. Left deliberately unused rather
  than converted for the sake of it.
- **A `forbidden.tsx` can never name the record — do not rebuild the handoff.**
  It was built (a `React.cache()` request-scoped target set by `requireAccess`
  before throwing) and instrumentation in the browser showed the boundary reads
  it BEFORE the page writes it: literally `GET → GET → SET`. Next renders the
  fallback eagerly as part of the loader tree, so no request-scoped channel can
  win that race, and a module-global would risk naming one user's record to
  another. Deleted the same day it was written. The record-specific surface on
  a server route is `return <AccessGate token id/>` from the page itself
  (`app/(core)/lists/[id]/page.tsx` is the live example).
- **CMS sites can't be gated.** `/cms/[siteId]` reads the standalone CMS
  Supabase project, so `access_denied_context` — which resolves against Matrx
  Main's entity registry — cannot answer for them. That surface now says only
  what it knows ("We couldn't open this site") instead of sniffing the error
  text for "403". A real fix needs a `cms_site` entity token, which is a
  cross-project decision, not an agent's call.
- **Slug-addressed records have no gate.** `access_denied_context(p_type, p_id
  uuid)` needs the uuid, and `/organizations/[orgId]` accepts a slug. When the
  slug doesn't resolve, `OrganizationAccessGate` says the address didn't match
  rather than inventing a reason. Same shape will hit any future slug route.
- **`check:access-errors` only sees quoted strings.** Bare JSX text
  (`<p>This doesn&apos;t exist…</p>`) is invisible to it — that is why the
  research-topic 404 went unreported for so long. The escaped-apostrophe blind
  spot is fixed; the bare-JSX one is not.
- **A SWALLOWED error is the sweep's second blind spot — a converted throw
  means nothing if no render site reads it.** Proven 2026-08-12: `getBrand`
  threw the canonical `RecordUnavailableError` (token `web_brand`), and
  `useMarketingSiteSurfaceBase` did `brand.data ?? null` with `brand.error`
  never read — the sweep counted marketing as ZERO while a denied brand on
  every site route rendered nothing at all. The fix pattern is a gate at the
  layout (`MarketingSiteLayoutClient` now gates brand like site). A future
  sweep pass worth building: for every `useQuery` whose queryFn can throw
  `recordUnavailable`, assert some consumer reads `.isError`/`.error`.

## Change Log

- **2026-08-11** — **`features/marketing` converted (41 → 0); the client sweep's
  last feature bucket of real record surfaces is closed.** Fourteen surfaces
  swapped `new Error("Crawl not found")` for the gate on `web_brand` /
  `web_page` / `web_snapshot` / `web_sitemap` / `web_crawl_session` /
  `web_site`. Two primitives came out of it, both beside the code they fix:
  `makeAssertData(action)` in `utils/errors.ts` collapsed **ten** private
  `assertData(data, error)` copies whose failure branch handed PostgREST prose
  to a person, and `RecordUnavailableError` gained `token`, so a renderer that
  has one defers to the gate instead of naming both possibilities.
  `assertMutated` stopped leading with a permission verdict on a zero-row
  UPDATE. Browser verification as a user WITHOUT access found one live leak the
  regexes could never see: `fetchFreshSite` used `.single()`, so Content Plan
  Setup toasted "Cannot coerce the result to a single JSON object · PGRST116"
  on top of the gate. Two checker changes: JSX comments (`{/*`) are skipped
  like the other comment forms, and `// access-errors: ok — <reason>` marks the
  ten genuine false positives with a required, printed reason.

- **2026-08-11** — **The inbox shipped: `/settings/access-requests`.** The last
  unbuilt half. `listAccessRequests` went from zero consumers to the page's
  reason for existing; the DM is now the primary surface rather than the only
  one. Two boxes with true counts on both tabs (both are fetched on load — a
  badge that only becomes true after you click the tab is the same class of
  small lie), the four DM decisions calling the SAME service functions, and
  Withdraw on the sent side. Entities render through `EntityRef`, which means a
  door where the registry resolves one and plain text where it does not — no
  invented route, and no bare uuid when a record has no title. Deliberately not
  on `lib/entity-list`: that shell wants a scoped/faceted server RPC over the
  five-scope vocabulary, and this is a two-box authorization-derived inbox.
  Answering a request in the browser also exposed a defect in the DM's own
  path: `rpcError` passed through "permissions.resource_type=organization is
  not registered (canonical token or table_name). See features/sharing/
  FEATURE.md" — our own sentence, but written for a developer, complete with a
  repo path and two schema names, from the feature whose LAW forbids exactly
  that. The heuristic now rejects internal markers as well as Postgres prose.
- **2026-08-11** — **`features/education` converted (38 → 0).** Six single-record
  surfaces render the gate: assessment detail / edit / results (the results page
  resolves the ASSESSMENT or the RESULT depending on which read came back empty,
  and its door back is the assessment itself), study summary, study session,
  multiplayer game room. Four service-layer "not found" strings became
  `recordUnavailable().message`, so the honest sentence and the Error Inspector
  scream arrive together. The 23 `throw new Error(error.message)` sites moved to
  the new `operationFailed(action, cause)` in `utils/errors.ts` — the humane
  counterpart to `extractErrorMessage`, with no "try again" (a retry that cannot
  succeed is the lie this feature kills). One deliberate exception, documented in
  place: the creator handle RPCs raise sentences authored FOR the user ("That
  handle is reserved") under errcodes that contract owns, and only those codes
  pass through. Verified in the browser on four routes.
- **2026-08-11** — **The server half, and `app/(core)` converted.**
  `experimental.authInterrupts` is ON (first use of Next's `forbidden()` in
  this repo), `app/forbidden.tsx` + `app/(core)/forbidden.tsx` render the
  refusal, and `requireAccess` gained `{ forbid: true }`. Browser verification
  killed the record-naming half of that design — see the Open note above; the
  handoff module was deleted rather than shipped inert. On the client, all 46
  `app/(core)` findings are gone: 15 organization surfaces collapsed onto ONE
  `useResolvedOrganization` + `<OrganizationAccessGate>` (they each carried
  their own copy of the same two guesses), `/lists/[id]` and the research-topic
  layout stopped calling `notFound()` on an empty record read, `/data/[id]`'s
  "doesn't exist or you don't have permission" hedge became the gate, and every
  `"… Not Found"` page title went neutral. Two checker blind spots fixed:
  escaped apostrophes (`doesn&apos;t exist`) were invisible, and Route Handlers
  outside `app/api/` were being flagged for copy no human reads.


- **2026-08-11** — Built and shipped. DB resolver + request ledger + RPC family +
  the surface + DM approval chips. Verified end to end in the browser (ask →
  owner's chips → grant → requester passes `has_access`); adversarially verified
  (strangers get an empty inbox, zero rows via RLS, a humane refusal on decide;
  duplicate asks are idempotent; anonymous callers get no enumeration signal).
  Fixed one dead end found by that verification (`/users/{id}` did not exist).
- **2026-08-11** — Adversarial pass (could not break authorization) found seven
  defects, all fixed and re-verified live: the disclosure flag was named
  BACKWARDS (`deny_preview=true` meant maximum disclosure) and had no write
  path; conversation titles and private page URLs leaked to any signed-in
  stranger; an unregistered token was reported as "doesn't exist"; a concurrent
  second ask toasted a raw Postgres constraint name; "they've been messaged" was
  asserted unverified; a declined ask dead-ended; a recipient could answer their
  own request and a deleted target could still be granted.

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
- **Delivery never fails the ask.** The row is the durable fact; the DM is how it
  gets noticed — and today the DM is the ONLY surface, so a delivery that lands
  nowhere leaves a row nobody can see. That is why zero-delivery is surfaced to
  the requester instead of hidden, and why the inbox page below is the next
  thing to build, not a nice-to-have.
- Writes go through the RPC family only. Never insert `iam.permissions` or
  `iam.access_requests` from the client.

## The owner's side

The DM **is** the approval surface — `access_request` in
[`messageActionRegistry`](../messaging/actions/messageActionRegistry.tsx) renders
**Let them view · Let them edit · Decline · Report** inside the bubble. Granting
writes `iam.permissions` and sends the canonical `resource_shared` card back, so
the loop closes in the surface the requester already reads.

## Open

- **The sweep.** `pnpm check:access-errors` (advisory, in the release gates)
  measures it: **410 human-facing surfaces** still guess (was 543 on
  2026-08-11) — 97 hand over raw PostgREST text, 282 assert a deletion they
  cannot know, 31 assert a permission.
  Ranked worst-feature-first; `--write` refreshes `scripts/access-errors/report.json`.
  Marketing's record surfaces and `app/(core)` are converted; education /
  files+rag were converted alongside. What remains is concentrated in `lib`,
  `features/agents`, and `features/scope-system`.
- **No `/settings/access-requests` inbox page yet, and `listAccessRequests` has
  zero consumers.** The DM is therefore not the primary surface, it is the only
  one — a request whose DM fails, or one created without a signed-in sender, is
  a durable row with no way to see it. Build the page.
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

## Change Log

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

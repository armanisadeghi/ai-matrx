---
status: active
updated: 2026-08-15
repos: [matrx-frontend, aidream]
---

# Outreach system — backlink outreach + media outreach

> **2026-08-15 — this work order is now the pipeline spine of a larger program.** Arman's full
> best-in-class product vision (Pitchbox + BuzzStream + Muck Rack superset) is orchestrated from
> `/Users/armanisadeghi/code/common-docs/projects/outreach-system/` (MASTER_PLAN, STATUS_BOARD,
> DECISION_LOG, INTEGRATION_MAP, work packages, research). This doc's rulings remain binding;
> WP1 (Pipeline Core) executes its open phases. Coordinate through the project docs.

**The one-sentence gap this exists to close:** *we already find the opportunity, score it, and
write the pitch — and then we have no way to reach a human being.*

This document is the work order. Arman named backlink outreach and media outreach as the next
things to build (2026-08-14), and building them honestly forced out a set of canonical primitives
the platform was missing and did not know it was missing.

> ## Status 2026-08-15 — phases 1–3 are live; phase 4 is implemented and awaiting production proof
>
> **Shipped and live:** domain→party (G1, both halves — the frontend fold button + mode control
> landed 2026-08-15) · **the outreach doors (G9)** — "Start outreach" from a reputation case and
> a backlink prospect into the existing `/crm/outreach-lists` workspace, with every reputation
> verdict wired to the action it implies · crawl-backed contact discovery (G2) · **the sending identity** (G5 — DNS proof, SPF/DKIM/
> DMARC, warm-up ramp, health, circuit breaker, kill switch) · **the compliance layer**
> (`crm.check_send_eligibility()` as THE one send authority, unsubscribe proven on production,
> 35-country jurisdiction policy) · tiers + entitlements · the guided-checklist primitive · and
> every research pass (deliverability/warmup, media-data acquisition, the attorney brief).
>
> **Phase 4 code now exists:** strict record-bound templates plus one human-reviewed Lane B send
> recorded in `crm.interaction`. It is not complete until the gated aidream integration deploys
> and a real received message proves the path. Sequences, provider reply ingestion, attribution,
> and broad "Start outreach" doors remain open.
>
> **The current production blocker is concrete:** the real `info@aimatrx.com` identity
> (`3489a446-1356-4dae-824f-90c65267732f`) correctly refuses sending because the
> `_matrx-verify.aimatrx.com` TXT proof is not published; authentication and warmup cannot begin.
> It is also a shared-role sender (`info@`), which `crm.check_send_eligibility()` permanently
> refuses for Lane B even after setup. The first real send therefore needs a connected **named
> human mailbox**, its generated TXT proof, passing SPF/DKIM/DMARC, and the earned 28-day warmup.
> Arman must connect that named mailbox and publish its generated TXT record
> (an agent may not touch a production DNS zone), and take `ATTORNEY_BRIEF.md` to counsel — every
> jurisdiction row is `ratified_by='agent-research'`, and each row counsel ratifies is a market
> that opens.

> **Read `docs/handoffs/crm-system.md` first.** Outreach is not a new domain — it is the CRM's
> reason to exist, pointed at two specific opportunity sources. Every target is a `crm.party`.
> Do not build a parallel contact store, a parallel suppression list, or a parallel activity log.
>
> **And read §5 before writing a single line that sends an email.** The sending architecture is
> decided and it is the safety design of the whole business: **TWO LANES that must never blend.**
> Lane A (opt-in marketing) we send on the customer's behalf, copying Klaviyo/Mailchimp/SendGrid
> policy end to end. Lane B (cold outreach — backlinks, media) sends only from the customer's own
> verified, warmed mailbox on their own domain, copying Pitchbox/Instantly/Smartlead. **Cold never
> touches our infrastructure; opt-in never sends without recorded consent.** That wall is what
> keeps one careless customer from destroying deliverability for everyone, including us.

---

# 1. Why these two features are ONE feature

Backlink outreach and media outreach look like different products. They are the same pipeline with
different opportunity sources:

```
opportunity source → target org → the right person → a reason to write → send
      → track reply → follow up → stop on reply → prove it worked
```

| | Backlink outreach | Media outreach (reputation) |
|---|---|---|
| Opportunity source | `seo.backlink*` — a referring domain, a competitor's link we don't have, a broken link, an unlinked mention | `seo.reputation_case` — a case whose verdict is `pitch` / `request_update` / `correct` / `respond` |
| Target organization | The referring/prospect **domain** | The **outlet / publication** |
| The right person | Editor, author, webmaster | Journalist, editor, the byline author |
| The reason to write | Link gap, broken link, unlinked mention | `reputation_case.pitch_angle` — **already AI-generated today** |
| Proof it worked | A new backlink from that domain appears in our own crawl | The page changes / the correction publishes, seen in our own re-crawl |

**Build them as one engine with two producers.** Two engines is the single most expensive mistake
available here, and the tables already agree with that judgment: `seo.reputation_case` carries a
`backlink_id` column — the two sources were designed to share a case model from the start.

## The differentiator nobody else has

Pitchbox, BuzzStream, Respona, Muck Rack all stop at "email sent, reply received." **They cannot
tell you whether the link actually appeared** — they don't crawl the web; you reconcile by hand.

We already crawl backlinks on a schedule. So the loop closes itself:

> campaign sends → weeks pass → our own backlink crawl detects a new link from that exact domain →
> **attribute the win automatically**, with the date, the page, and the anchor.

Same shape for reputation: case → pitch → our re-crawl sees the page changed → the case completes
itself. This is THE CORE DOCTRINE made literal — outreach becomes *accountable*, not just
reusable. **Do not treat outcome attribution as a phase-2 nicety; it is the reason to build this
here rather than buy Pitchbox.**

---

# 2. What already exists (verified 2026-08-14)

More than you would expect. The parts that exist are good; they are simply not connected.

| Capability | Where | State |
|---|---|---|
| Backlink data: links, observations, referring-domain profiles, human rulings | `seo.backlink`, `backlink_observation`, `backlink_referring_domain_profile`, `backlink_human_ruling` | Live, crawled |
| Reputation cases with verdict, priority, confidence, evidence, **`pitch_angle`**, `backlink_id` | `seo.reputation_case`; UI `features/marketing/components/reputation/` | Live |
| Canonical contact records + dedup + merge lineage | `crm.party` (+ resolver, aidream `services/crm/`) | Live |
| **Domain is already a resolver natural key** | `party.primary_domain`; `resolve_party` | Live — this IS the domain→org bridge |
| **SEO domain → party fold (G1)** | aidream `services/crm/seo_domains.py`; `POST /seo/sites/{id}/crm/{referring-domains,reputation-outlets}` (bare prefix — no `/api`) | **Live 2026-08-14** — no frontend caller yet |
| Suppression / DNC / opt-out per channel value | `crm.contact_medium`, `party_contact_point` | Live, enforced by the dialer |
| Activity log | `crm.interaction` | Live |
| **Sequence data model** — `current_step`, `next_attempt_at`, `contact_point_id`, `attempt_count`, claim lock | `crm.outreach_list_member` | **Live and UNUSED — built for cadences, only the manual dialer consumes it** |
| List/enrollment/claim machinery | `features/crm/outreach-lists/` | Live |
| Gmail send, per-user OAuth, human-reviewed, 1:1 | aidream `services/google_workspace/service.py#send_reviewed_gmail` | Live |
| Scheduled background work + handler registry | aidream `services/scheduling/system_task_runner.py` | Live — the sequence runner's host |
| Author/person extraction from crawled pages | aidream `research/page_analysis.py` (`EntitiesMentioned.people`, `has_author_credentials`, `NotableQuote.speaker`) | Live — **the same pipe the experts work uses** |
| Mailgun | `MAILGUN_API_KEY` in aidream env validation | Declared, **zero consumers** |

**Read that table as good news.** The opportunity engine, the contact system, the cadence schema,
a real send path, and a scheduler all exist. The missing work is mostly *connective* — plus three
genuinely new primitives (§4).

---

# 3. The gaps, in dependency order

Each gap is stated as: what breaks without it, and what it actually is.

### G1 — Domain → party. *The bridge.* ✅ **DONE (server) 2026-08-14 — deployed**
Server-side: `aidream/aidream/services/crm/seo_domains.py` folds
`seo.referring_domain_profile` (link prospects) and `seo.reputation_case` (media outlets)
into canonical `crm.party` organizations through `resolve_party` — domain was already one of
its natural keys, so it is a call site, not a new system. Routes (site-scoped, canonical
editor gate, org from the SITE):
`POST /seo/sites/{site_id}/crm/referring-domains` · `POST /seo/sites/{site_id}/crm/reputation-outlets`
(plus `POST /seo/sites/{site_id}/crm/link-gap-domains`).
🚨 **These prefixes are BARE — there is no `/api` segment.** This doc said `/api/...`
until 2026-08-15 and it was wrong; aidream router prefixes are bare, so an `/api/...`
path is unreachable at runtime while still appearing in `/openapi.json`. Verified
against `types/python-generated/api-types.ts` and live. Call them through
`@/lib/api/typed-client` so a wrong path is a compile error rather than a 404 nobody
notices.
Every folded org carries a provenance edge (`link_prospect` / `outreach_target`) whose payload
holds the verdict, priority, source URL and pitch angle — the answer to "why is this org in my
CRM". Idempotent on the domain key (refold creates nothing); a domain already in the CRM is
enriched, never duplicated. Toxic link farms, watch-list verdicts and the brand's own domain are
skipped WITH the reason. Contract + earned traps: `aidream/aidream/services/crm/FEATURE.md`
§ "SEO domains".
**Triggered by the crawl, controlled by the user (2026-08-14).** The fold runs when a
backlinks/competitors collection or a reputation run COMPLETES — data only changes then, so
a timer would poll unchanged data and still be late. Per-site setting on
`web.site.settings->'crm_fold'` (`auto` default · `manual` button-only · `off`, where the
button refuses too), read/written at `GET|PUT /seo/sites/{site_id}/crm/fold-settings`
and meant to render BOTH on the site-settings surface and beside the prospect list — one
record, two renders.

**Discovered records do not pollute the CRM.** `crm.party.record_class` (`contact` |
`discovered`) now separates the parties a user works with from the ones the platform found;
the CRM list defaults to contacts with a one-click **Record** facet. Live before the fix:
1,181 platform rows against 6 real contacts. Foundation only — the full classification
system is `docs/handoffs/crm-record-classification.md`.

**Frontend half DONE 2026-08-15 (with G9).** `CrmFoldControl`
(`features/crm/components/outreach-start/`) is the "Find these domains in my CRM" button
plus the `auto|manual|off` mode control, mounted on the site-settings surface AND beside
the referring-domain and reputation-case lists — one record, two renders. `off` refuses
with the reason; every run reports what it SKIPPED and why, with doors to what it created.
`PartyProvenanceCard` renders the provenance edge on `/crm/[partyId]`. 🚨 The mounted
paths are **`/seo/sites/{site_id}/crm/...`** (bare prefixes) — the `/api/seo/...` form
above is unreachable at runtime; the client is bound to the generated OpenAPI types.

**The prospect list we actually want is still missing:** who links to our COMPETITORS —
`docs/handoffs/competitor-link-gap.md`.

### G2 — Contact discovery. *Who at that domain?* ✅ **DONE 2026-08-15 — deployed both repos**
An organization is not an inbox. We need the editor, the author, the webmaster — and we already
extract bylines and credentialed authors from every page we crawl, then bury them in
`rs_source.page_analysis` JSONB. That is the exact same buried-signal problem the experts work is
fixing, through the same resolver, and it should reuse that path rather than invent a second one.
**Suggestion-gated:** a scraped `info@` or a guessed pattern address is a *candidate*, never an
auto-created contact — a wrong guess is a spam complaint against our sending domain.

The server now reads those saved signals without a second crawl, explains every candidate with
confidence and source-page evidence, and performs no write until a human confirms. Confirmation
uses `resolve_party`, promotes the person to `record_class='contact'`, creates/reuses a real
`crm.affiliation` to the outlet, and attaches only a literal observed address selected by the
human. Role mailboxes and weak bylines require a second explicit confirmation; guessed address
patterns are never generated. The outlet record renders the review surface with doors to every
source page and to every confirmed person.

**Live proof:** source `73c87bf3-8eaf-427b-a521-a2e5784e20c0` resolved Pearlman, Brown & Wax LLP
to party `4fd1e808-8ff1-46b5-a64e-cd91f68facaf`; its saved crawl produced Barry Pearlman, Steven
Wax, and Dean Brown with literal evidence. Confirming Steven created person
`c44be919-9da2-40c4-9e19-5a39ebf7d86b`, current affiliation
`e88e1740-b7e8-4d5e-b71a-6c4791da7a69`, and observed `shw@4pbw.com`. Repeating confirmation
matched the same person by email, reused the affiliation, and added zero contact points.

### G3 — Message templates + personalization. *No primitive exists anywhere.*
Nothing in the platform composes a parameterized message. Needed: variables bound to real record
fields (`{{party.display_name}}`, `{{case.pitch_angle}}`, `{{backlink.anchor}}`), a preview against
a real target, and a hard fail when a variable is unresolved.
**Never ship an email with an empty merge field** — that is the single most recognizable "this is
automated spam" tell, and it is a rendering bug we can make impossible.
This must be a **generic platform primitive**, not an outreach-local helper: notifications,
assists, agent messages, and SMS all want the same thing.

### G4 — The sequence engine. *Schema exists; nothing runs it.*
`current_step` / `next_attempt_at` / `attempt_count` are already on the member row. What is missing
is the runner: a scheduled handler that advances due members, respects quiet hours and per-day
caps, and — most important — **stops the sequence the moment a human replies.** A cadence that
keeps sending after a reply is the fastest way to destroy a sender reputation and a relationship.
Host it on the existing `system_task_runner`; do not build a second scheduler.

### G5 — Sending identity + throttling. ✅ **DONE 2026-08-14 — both repos deployed**
The whole of §5.2 is built and live. Server: `aidream/aidream/services/sending_identity/`
(contract + earned traps in its `FEATURE.md`) — Google Workspace over the canonical OAuth
connection (extending `send_gmail_message`, not forking it; Microsoft 365 and SMTP are declared
slots that refuse BY NAME), DNS TXT ownership proof as a hard gate, real SPF/DKIM/DMARC
resolution, a 28-day warm-up ramp the gate counts against, per-day/per-hour caps + randomized
pacing + quiet hours in the **recipient's** timezone, rolling health over `crm.sending_event`,
a circuit breaker that auto-pauses the identity **and its campaigns**, a per-org kill switch,
and the full audit trail. Tables `crm.sending_identity` / `sending_policy` /
`sending_identity_check` / `sending_event` (migration `crm_05_sending_identity.sql`), hourly
re-verification sweep (`crm_sending_identity_sweep`, migration `0352`), REST at
`/api/sending-identities/*`. Frontend: `/crm/sending-identities` (+ `[identityId]`),
`matrx-frontend/features/crm/sending-identities/FEATURE.md`.
**The two invariants a future agent must not undo:** no gate takes a `force`/`skip`/`override`
argument (guarded by `test_gate_has_no_override_argument`), and **the system pauses while only a
human resumes**.
**Known and honest:** bounce/complaint rates read 0 in production until G6 lands, because
nothing reports them yet — the breaker is armed and correct, it simply has no inbound data. Do
not paper over that with guessed bounces.

### G6 — Inbound: replies, bounces, complaints. *The hard gap, and the one most likely to be skipped.*
Today outreach is write-only. Without inbound we cannot stop on reply (G4), cannot suppress on hard
bounce, and cannot measure anything. **The reply-opt-out seam is already waiting:** provider adapters
emit one `InboundReply`; the shared detector immediately writes permanent suppression through
`crm.honor_reply_opt_out()`. G6 must deliver replies into that seam, not duplicate it. **This is not
optional polish — it is what separates outreach from spam,** and it is legally load-bearing (§5).
Needs: provider webhooks (delivered/bounced/complained), reply ingestion, and threading so a reply
lands on the party's `crm.interaction` timeline as a real conversation.

### G7 — Compliance, built into the send primitive. *Arman's ruling: "follow the law."*
Commercial email carries obligations (CAN-SPAM/CASL/GDPR-class): a working one-click unsubscribe,
a physical postal address, honest headers and subject, prompt opt-out honoring, and a lawful basis
where GDPR applies. **US first, with non-US blocking policy live but not attorney-ratified (§5.4)** — while storing consent
basis, source and timestamp per contact from day one, because retrofitting those means
re-contacting everyone. Rules differ by jurisdiction, so **a qualified legal/compliance review is
required before the first customer send — not trivia an agent infers from memory.**
Architecturally the ruling is simple and already made (crm handoff §5.2): `crm.contact_medium` is
the ONE suppression authority, and suppression + unsubscribe are enforced **inside** the send
primitive so no caller can forget. A caller that *can* bypass suppression eventually will.

### G8 — Outcome attribution. *The differentiator (§1).*
Link a send back to the `reputation_case` / `backlink` that motivated it, then let our own crawl
close the loop. Generic shape worth building deliberately: *campaign → intended world-change →
observed world-change*. Reputation, SEO, growth-loop and sales all want it.

### G9 — Surfaces. ✅ **DONE 2026-08-15 (frontend)**
Outreach starts where the opportunity is found and lands in the EXISTING
`/crm/outreach-lists` workspace — no second console. "Start outreach" is on a reputation
case (`pitch` / `request_update` / `correct` / `respond`) and on a referring-domain
prospect (a `toxic` domain refuses with the reason, matching the G1 skip rules); the
outlet is resolved through the live G1 fold, enrolled through the existing enrollment
service, and the motivating record is stamped on the member so `SingleSendDialog` opens
already bound to it (attribution, G8). **The verdict is no longer a dead end:** each
non-outreach verdict is wired to the action it actually implies (`strengthen` → the page
workspace, `investigate` → recheck the evidence) or is honestly inert
(`monitor` / `leave_alone`) — a button that pretends is worse than none. Contracts and
the earned traps: `features/crm/FEATURE.md` § "Starting outreach where the opportunity
was found" + `features/marketing/components/reputation/FEATURE.md` § "The verdict is the
action".

**Still open on this gap:** a "Start outreach" door from the competitor link-gap prospect
list (`seo.link_gap_domain`, role `link_gap`) — the fold producer and the provenance
renderer already handle it; only the button is missing.

---

# 4. The canonical primitives this forces out

Arman's instinct was right: the value of this project is mostly here. Each of these is missing,
generic, and wanted by several features that are already built.

1. **Message template + render primitive** (G3) — parameterized content, bound to real records,
   unresolved-variable = hard fail. Wanted by: outreach, notifications, assists, agent messages, SMS.
2. **Cadence/sequence runner** (G4) — "do this series of steps over time, on these conditions,
   stop when X." Wanted by: outreach, nurture, follow-up tasks, growth-loop stages, scheduled agents.
3. **Inbound message ingestion + threading** (G6) — the platform is currently write-only across
   every channel. Wanted by: outreach, SMS, support, any two-way agent conversation with a human.
4. **Sending identity registry** (G5) — which mailbox/number/domain speaks for an org, with rate
   and warmup state. Wanted by: email, SMS, and every future channel.
5. **One consent & suppression authority** (G7) — already ruled; make it real and make it
   unbypassable by construction. Consent is not paperwork: it is the **eligibility key** that
   decides whether a contact is reachable in lane A at all (§5.1).
6. **Outcome attribution** (G8) — did the thing we wanted actually happen in the world?
7. **Persistent guided checklist** (§5.3b) — ✅ **BUILT AND LIVE 2026-08-14, in `lib/guided-setup/`.**
   Three step kinds and no others — **auto** (we do it for them, unasked), **verified** (they do
   it, we machine-check it live and show the reason AND the one-click fix), **confirmed** (exact
   copy-paste values + a how-to + a tick). Declared as config, persisted per org in
   `platform.guided_checklist_run`, survives days away, and **re-verifies on return** because a
   step that passed can regress. Contract, laws, and the migration map for every other
   hand-rolled setup flow: [`lib/guided-setup/FEATURE.md`](../../lib/guided-setup/FEATURE.md).
   First consumer is `marketing.site_setup` (Search Console), NOT outreach — so the primitive is
   already proven generic before sending identity touches it. **Sending identity (§5.2) declares
   its steps and mounts `<GuidedChecklist>`; it does not build a wizard.**
8. **Entitlement/tier gate** (§5.6) — "is this org allowed to do this?" as one authority every
   surface asks, rather than each feature inventing a check.

---

# 5. Sending architecture — DECIDED 2026-08-14 (Arman)

Arman's constraint: *"one client doing stupid spammy stuff must not destroy our entire app."*
Arman's instruction: *do it exactly the way the best companies in each category do it.*

## 5.1 THE TWO-LANE LAW — this is the vision, capture it exactly

**We offer BOTH models, because our customers legitimately need both. They are two different
industries with two different risk models, and they must NEVER blend.** Arman, 2026-08-14:

> *"Our CRM should have a way to have things that we can send on their behalf, but those would be
> those opt-in-only emails we'd handle exactly as Klaviyo/Mailchimp/SendGrid do — and in fact we
> would duplicate their policies end to end. For the cold stuff, we would absolutely duplicate what
> Pitchbox, Instantly, Smartlead, Lemlist, Outreach.io do."*

| | **LANE A — Opt-in marketing** | **LANE B — Cold outreach** |
|---|---|---|
| What it is | Email to people who **asked to hear from them** — customers, subscribers, form fills | Backlink outreach, media pitching — a **stranger with a legitimate reason to be contacted** |
| Copy the policies of | **Klaviyo, Mailchimp, SendGrid** — end to end | **Pitchbox, Instantly, Smartlead, Lemlist, Outreach.io** |
| Who sends | **WE do, on the customer's behalf**, from our sending infrastructure | **The customer's own mailbox**, OAuth (Google/Microsoft) or SMTP/IMAP |
| Whose reputation is at risk | **OURS** — so the entry bar is proof of consent | **The customer's own domain** — so the entry bar is proof of identity + warmup |
| Entry requirement | Provable opt-in per recipient: source, timestamp, basis | Verified domain ownership + authenticated DNS + a warmed mailbox |
| The list may contain | ONLY people with recorded consent | Cold prospects, with a legitimate-interest basis and instant opt-out |
| Purchased lists | **Banned. Never. Account-terminating** | Also banned — cold ≠ purchased |
| Volume shape | Bulk (thousands) | Low and human-paced (tens per mailbox per day) |

### The wall between the lanes IS the safety design

**A cold campaign may never touch our sending infrastructure. An opt-in campaign may never send to
a contact without recorded consent.** Both halves of that sentence are load-bearing:

- **Cold through our infrastructure** would make one aggressive customer poison deliverability for
  every other customer *and* for us. This is exactly the failure Arman named, and it is why the
  entire cold-outreach category converged on BYO-mailbox. It is not an implementation detail — it
  is the business model's safety design.
- **Opt-in without consent proof** is how an ESP gets its own IPs blocklisted. Klaviyo and Mailchimp
  survive by policing consent aggressively, and if we send on a customer's behalf we inherit
  exactly that obligation — so we inherit their policies too.

**Enforce the wall in the data, not in a code review.** A campaign declares its lane; the lane
decides which sending path is even reachable and which contacts are eligible. A lane mismatch is a
refused send, not a warning. **Do not build a single "send" function with a boolean.**

### What this means for a contact record

Consent state stops being paperwork and becomes an eligibility key: **lane A eligibility must be
provable per recipient** (basis, source, timestamp, and the jurisdiction it was captured under —
already required by §5.4). A contact with no recorded consent is invisible to lane A and always
will be. This is why §5.4 insists on capturing consent from day one: it is not compliance
overhead, it is the field that decides what a customer is allowed to do.

### There are actually THREE streams, and all three are separate

Lane A and lane B are the customer's mail. Ours is a third, and it is the one whose breakage is
most invisible until it is catastrophic:

| Stream | From | On whose reputation | Provider account |
|---|---|---|---|
| **Lane A** — opt-in marketing | Our sending infrastructure, on the customer's authenticated domain | Ours (shared) | Bulk ESP |
| **Lane B** — cold outreach | The customer's own connected mailbox | The customer's own domain | None of ours |
| **Transactional** — password resets, invites, receipts | Our domain | **Ours alone** | Separate transactional account |

**Transactional never shares infrastructure, domain, IP, or provider account with either customer
lane.** Blend them and a customer's spam complaints degrade the deliverability of our own
password-reset emails — users cannot log in because someone else's campaign was aggressive. Keep them
physically separate: different provider accounts, different domains, different code paths.

### We are our own customer — with one declared exception

Per `common-docs/policies/we-are-our-own-customer.md`, AI Matrx's own backlink and media outreach
runs through this same system, from a connected mailbox on our own domain, using the same code
every customer gets. **Declared exception:** our transactional mail is not outreach and does not
run through it (above). Note this in the FEATURE.md when it is built.

## 5.2 The sending-identity primitive (G5) — what to build

A sending identity is a first-class record, not a config field: *which mailbox may speak for this
org, how fast, and is it healthy right now.*

> ✅ **Deliverability research DONE 2026-08-14 — read before building any of this.**
> **`/Users/armanisadeghi/code/common-docs/systems/outreach-compliance/DELIVERABILITY_AND_WARMUP.md`**
> — what Instantly/Smartlead/lemlist/Mailreach mechanically do, what actually moves inbox
> placement, the safe/grey/reckless risk ledger, and the ship/optional/refuse ranking. It changes
> items 1, 4, 5 and 6 below.

1. **Connection — and connection method is a CAPABILITY KEY, not a detail.** OAuth for Google
   Workspace and Microsoft 365 (the two that matter); SMTP/IMAP as the fallback that covers
   everyone else. We already have the Google half (`send_reviewed_gmail`) — extend it, don't fork
   it. **Store the method on the identity and gate capability on it in the DATA:** Google's live
   developer policy bans apps that use *"multiple accounts to abuse Google policies, bypass Gmail
   account limitations, circumvent filters and spam"*, and Google enforced exactly that against
   this feature category in 2023 (GMass, Woodpecker, lemlist, Saleshandy all lost or shut down
   Gmail-API warmup). **An OAuth-connected identity must be structurally ineligible for any
   pool-style capability, forever** — that is the only thing standing between a future warmup
   feature and the suspension of the shared OAuth app §5.3 names as our one uncontained blast
   radius. Costs nothing now; cannot be retrofitted safely.

   **Also model the DOMAIN as the reputation-bearing unit** (org → domain → mailboxes). The
   category rotates domains on ~90-day cycles and pulls a whole domain above 2% bounce; health,
   the circuit breaker and the trust ladder all key more naturally on the domain than the mailbox.
2. **Domain ownership proof — gate before ANY outreach send.** DNS TXT challenge on the sending
   domain. A customer who cannot prove they own the domain does not get to send from it. This one
   gate removes most casual abuse, and every serious platform requires it.
3. **Authentication verified, not assumed.** Check SPF, DKIM and DMARC actually pass for that
   domain before enabling sends, and re-check periodically. Since the Google/Yahoo bulk-sender
   rules (Feb 2024), unauthenticated mail is simply discarded at volume — a customer sending
   without DMARC is buying nothing but a damaged domain.
4. **Warmup as a state machine — and it is GOOGLE'S instruction, not our caution.** A new sending
   identity starts at a low daily volume and ramps over ~3–4 weeks before full use. Model it as
   real state on the record (`warming` → `ready`), with a ramp schedule the runner obeys. **A
   mailbox in warmup cannot be used for a campaign** — the system enforces it rather than trusting
   the user to know. **Say this in the UI with Google's own sentence quoted** (*"Start with a low
   sending volume to engaged users, and slowly increase the volume over time"*) — the research
   found no evidence pool warmup beats it, and quoting the provider converts our position from
   "we're stricter than the competition" (a §5.5b failure) into "we do what Gmail tells you to do."
5. **Caps, throttle, and human pacing — at INDUSTRY-NORMAL numbers, not conservative ones.**
   Per-identity daily cap, per-hour cap, randomized intervals, quiet hours in the *recipient's*
   timezone. Verified 2026 operator consensus: **10–15/day for a new inbox, 20–40/day once warmed**,
   with typical infrastructure of 10–25 inboxes across 5–10 domains. Multiple connected mailboxes
   is how volume scales, not a bigger number on one mailbox — **confirmed as exactly what the
   category does**, and provider caps (Google allows ~2,000 msgs/day) are irrelevant because the
   binding constraint is reputation, not the published limit. §5.5b applies directly: capping below
   these numbers is as much a defect as capping above them.
6. **Live health — and it CANNOT depend on Google Postmaster Tools.** Bounce rate, complaint rate,
   reply rate per identity, on a rolling window. GPT needs hundreds of Gmail recipients/day for
   intermittent signal and low thousands for full dashboards, so a Lane B mailbox at 30/day **will
   never populate it**. Wire it for orgs whose aggregate crosses the threshold; never promise it,
   and never build a health surface that is empty without it. Seed-list placement testing is the
   only placement visibility a cold sender can actually get — ship it (see §8 item 3).
7. **Circuit breaker — automatic, not advisory.** Thresholds pause the identity and its campaigns
   and alarm loudly (hard-bounce and complaint rates are the two that matter; Google/Yahoo treat
   ~0.3% complaints as the red line, so our internal trip must sit well below it). **The system
   pauses; a human un-pauses.** Never the reverse.
8. **Per-org kill switch** we can pull instantly, plus an audit trail of who sent what to whom.

## 5.3 Protecting the platform from our own customers

Arman's exact worry, addressed as a checklist. Structural isolation (5.1) does the heavy lifting;
these close the rest:

- **List-quality gates before send.** Verify addresses (syntax + MX + disposable-domain check)
  and refuse the send if a list looks purchased or scraped-in-bulk. **Never send to an address we
  have not verified** — hard bounces are the fastest route to a burned domain.
- **Suppression is unbypassable** (crm-system §5.2): one authority, enforced *inside* the send
  primitive, checked on every send including the first of a sequence.
- **Volume behind payment.** Free tiers attract abuse; every serious platform in this category
  gates outreach volume behind a paid, identified account. Cheapest abuse filter that exists.
- **Acceptable Use Policy with teeth**, plus per-org abuse monitoring, an abuse@ intake, and a
  documented suspension path we will actually use.
- **Our OAuth app is a shared asset — protect it.** If enough customers abuse Gmail sending through
  our Google Cloud OAuth client, Google can restrict or suspend *the app*, taking every customer's
  Gmail connection down at once. This is the one place where the blast radius is NOT fully
  contained, so it justifies the strictest gates above and a fast internal response to any abuse
  report. Track it as a named platform risk.
- **The 10DLC analogy is correct.** Arman's SMS instinct maps directly: identity verification
  before throughput. Tier it — verified domain for basic sending, verified business identity for
  higher volume. Build the tiers now even if only the first is enforced at launch.

## 5.3b We do it FOR them, or we teach them to do it — never "here's an error, good luck"

Arman's ruling, 2026-08-14, and it applies to every gate in §5.2:

> *"We want to guide our users to make smart decisions… anything we can do on their behalf we'll do
> on their behalf, and anything we can't, we'll teach them how to do it. If there are things they
> have to do themselves, we create a checklist for them that has persistence… if there are things
> we can programmatically check, we check it for them."*

This is THE USER doctrine applied to the most technical surface in the product. DNS records,
DMARC policy, mailbox warmup and domain verification are exactly the kind of thing our
brilliant, non-technical SME will never do unaided — and a red "SPF not found" with no next step
is a dead end that ends their outreach career on day one.

So every gate in §5.2 ships as a **guided step**, in this order of preference:

1. **Do it for them** wherever we technically can (generate the exact DNS record values, run the
   verification, watch for propagation, warm the mailbox automatically).
2. **Machine-check what they did** and show a live pass/fail with the reason (SPF/DKIM/DMARC
   lookups, MX checks, warmup progress) — never make a human self-report something we can verify.
3. **Guide + confirm** only where we genuinely cannot act or check: exact copy-paste values, the
   registrar-specific how-to, and an explicit "I've done this" the user checks off.

**The primitive this forced out is BUILT — `lib/guided-setup/` (live 2026-08-14).** Those three
preference levels ARE its three step kinds (`auto` / `verified` / `confirmed`), and it already
carries the persistence, the re-verification on return, the "we couldn't check ≠ you didn't do it"
distinction, and the rule that every failure ships its one-click fix. It was deliberately proven
on a NON-outreach consumer first (`marketing.site_setup`, Search Console) so it could not come out
shaped like one feature. Read [`lib/guided-setup/FEATURE.md`](../../lib/guided-setup/FEATURE.md)
before building §5.2.

**So the sending-identity work does not build a wizard.** It declares a
`ChecklistDefinition` and mounts `<GuidedChecklist>`:

| §5.2 gate | Kind | Notes |
|---|---|---|
| Mailbox connected (OAuth / SMTP) | **verified** | `fix.href` = the connect flow; extend `send_reviewed_gmail`'s auth, don't fork it |
| Domain-ownership TXT challenge | **confirmed** for the record we generate (we cannot log into their registrar) + **verified** for the lookup that proves it landed | The generated value goes in `values()` with a Copy button — a hand-typed DNS record is how a non-technical expert gets a silent typo |
| SPF / DKIM / DMARC each pass | **verified**, one step each | Each needs its OWN reason and fix; a single "authentication" step that fails tells the user nothing they can act on |
| Warmup ramp | **auto** | State machine on the identity row; the step shows live ramp progress. `autoRun` stays true — warmup starting itself is the point |
| "Only send from this mailbox for this business" | **confirmed** | Genuinely un-checkable |

Two traps the primitive's laws already close, worth restating because outreach is where they
bite hardest: an `unknown` check (DNS resolver timed out) must NEVER read as "your SPF is
broken", and an `auto` step must never fire off a stale or unknown result — starting a warmup
because a lookup failed is a real-world side effect on a real domain.

## 5.4 Compliance posture — US first, rest of world documented (Arman, 2026-08-14)

Build for the US, but **do not design anything that makes non-US support a rewrite.** Concretely:
store consent basis, source, and timestamp per contact from day one, and keep jurisdiction a field
on the record — retrofitting those later means re-contacting everyone.

Every commercial send, from the first one, carries: a working one-click unsubscribe
(`List-Unsubscribe` header, now effectively mandatory), a physical postal address, honest headers
and subject, and immediate opt-out honoring (the law allows days; we do it instantly because the
suppression authority already exists).

Non-US guardrails are built but not legally ratified: the EU/UK (GDPR + ePrivacy — cold B2B may
rest on legitimate interest, with documentation, and some member states are far stricter) and
Canada (CASL — consent-based, with real penalties and no US-style opt-out carve-out) change the
eligibility verdict, not just the footer. Unknown and unratified markets remain closed. **Before
the first customer send, a qualified compliance/legal review is required — this is not something
an agent should infer from memory, and the AUP and ToS must be written by someone qualified.** That
is the one piece of this section that cannot be closed in code.

### ✅ BUILT AND LIVE 2026-08-15 — the engineering floor is closed; ratification remains

`migrations/crm_06_compliance.sql` + `crm_07_compliance_floor.sql` (applied + ledger-recorded) · `features/crm/compliance/`
([FEATURE.md](../../features/crm/compliance/FEATURE.md)) · `app/(public)/unsubscribe/[token]/`
· `app/api/unsubscribe/[token]/` · `aidream/services/sending_identity/`.

🚨 **THE ONE SEND AUTHORITY is `crm.check_send_eligibility()`** — a DB function, so a caller in
another repo or language cannot route around it. It returns a verdict where **every block carries
a `fix`**. Ask it before any send; never reimplement one of its checks elsewhere.

Live and proven against production, not asserted:

- **Unsubscribe** — permanent opaque token, RFC 8058 one-click POST, anonymous human page.
  Verified end-to-end on `www.aimatrx.com`: GET renders with a **masked** address, the one-click
  POST returns `{"ok":true}`, a retry stays 200, the recipient becomes non-contactable, and the
  gate then blocks with `unsubscribed`. Anon **cannot** enumerate the token table (401).
- **Jurisdiction policy** — 35 countries, **30 of which block**. Germany and Austria are hard
  blocks; the unresearched EEA blocks by default; a generic TLD resolves to _nothing_, never a
  default country.
- **Circuit breaker** — trips at 0.10% complaints / 3.00% bounces (min 50 sends), pauses the
  identity **and its campaigns**, `paused_by_kind='system'`, human-only resume.
- **Consent provenance** on `crm.contact_medium` — the thing §5.4 warned could not be retrofitted.
- **Address verification** — syntax + live MX/null-MX + maintained disposable-domain data are
  performed server-side, persisted on the existing medium, expire after 30 days, and are refused
  by the one authority when missing, stale, disposable, or invalid.
- **Purchased-list protection in both lanes** — declared source plus high-confidence provenance,
  role-address, and uniform-pattern signals are evaluated before the lane branch. Every refusal
  returns the evidence and the concrete repair.
- **RFC 8058 last mile** — the only send primitive mints the permanent token and owns the headers,
  footer, postal address, and art. 14 disclosure. An external production delivery showed DKIM
  `PASS`, with both unsubscribe headers in the real signature's `h=` list. Only Google Workspace
  is eligible until another provider passes the same proof.
- **Reply opt-out seam** — quoted-reply-safe detection plus an atomic, idempotent suppression/event
  write are complete. G6 only needs to deliver provider replies into `InboundReply`.

**The first-send legal blocker is not engineering.** Every jurisdiction row is `ratified_by='agent-research'`,
which is not ratification. Counsel's answers replace them one at a time, and each ratified row is
a market opening. Remaining engineering is honestly narrower: provider delivery for G6, the G2
anti-harvesting-notice check, and prohibited-content classification. None of those reopens or
bypasses the four floor items closed above; see `ENGINEERING_GAPS.md` § "Still open".

### ✅ Research pass DONE 2026-08-14 — read it before writing any send code

**System-of-record: `/Users/armanisadeghi/code/common-docs/systems/outreach-compliance/`**
(cross-repo: the obligations land in this repo, in aidream, and in the shared DB). Full research
against primary sources — CAN-SPAM §7704, CRTC/CASL, CNIL, §7 UWG, ICO/PECR, Australia's Spam Act,
the Google/Yahoo/Microsoft bulk-sender regime, RFC 8058, and the eight vendor policies §5.1 names.

- `REQUIREMENTS_MATRIX.md` — obligation → jurisdiction → lane → our design → **where it must be
  enforced**, every gap flagged.
- `ACCEPTABLE_USE_POLICY.md` · `USER_GUIDANCE.md` — drafts. **Neither is fit to publish.**
- `ENGINEERING_GAPS.md` — the buildable work.
- `ATTORNEY_BRIEF.md` — **for Arman.** 18 questions for counsel; Q3 (the per-country EEA table)
  is the one that changes the build.
- `DELIVERABILITY_AND_WARMUP.md` — **added 2026-08-14.** The competitive/technical half: what the
  warmup vendors mechanically do, what actually moves inbox placement, the safe/grey/reckless risk
  ledger (including the 2023 Gmail-API enforcement wave), and the ship/optional/refuse ranking.
  Read with §5.2 and §8 item 3.

**What the research changed in this plan — the four original Tier-0 gaps, now closed in code:**

1. **Unsubscribe machinery** — permanent token, anonymous human route, one-click POST, body link,
   reply seam, and DKIM-covered RFC 8058 headers now ship structurally in the send primitive.
2. **Postal identity** — org policy plus per-mailbox override are stored and hard-gated.
3. **Consent provenance** — basis, source, source URL, timestamps, expiry, jurisdiction, subscriber
   kind, and evidence now live on `crm.contact_medium` and gate all of Lane A.
4. **"The EU" is not one place.** The per-country blocking mechanism now exists; Germany and
   Austria block, unknown rows block, and counsel—not engineering—ratifies each market.
   The original risk remains the reason the table exists:
   Germany (§7 UWG) prohibits cold advertising email without prior express consent — **no B2B
   carve-out, and competitors have standing to sue.** France permits it on legitimate interest
   _if the message relates to the recipient's role_. The UK permits it to corporate subscribers
   but not sole traders. Most of the EEA is unresearched; counsel fills those rows.

Plus two the plan did not have: **GDPR Article 14** obliges us to tell every discovered contact
where we got their details, at first contact — the obligation this whole category ignores, and one
we are unusually able to meet since G1 already captures the source URL. And **Google's developer
policy** bars apps that "distribute spam or unsolicited commercial mail" from Gmail restricted
scopes — a live question about our own shared OAuth client (§5.3's named platform risk), answered
by attorney Q9, not by an agent.

## 5.5 Identity level — resolved

Sending identity attaches to **an org**, with the connected mailbox owned by a user in that org,
and an agency's managed client is its own org. This falls straight out of the CRM model (every
party and every contact is org-scoped) and it means an agency connects one identity per client
org — which is also the correct deliverability answer, since a client's mail should come from the
client's own domain.

## 5.5b THE EARNED-TRUST LADDER — being stricter than the competition is ALSO a failure (Arman, 2026-08-14)

> *"We cannot lose customers because we're being more cautious than the competitors. We need to be
> realistic… sensible restrictions that start more strict and get more loose as a user or
> organization proves that they're legitimate and that they're not gonna do stupid things. And then
> we need to have things that hard catch issues at every level… But if we get overly cautious and
> we force the user to do things that are just stupid or that nobody else does or that is just not
> realistic within the industry, then we're just setting ourselves up for failure."*

**Two failure modes, both fatal, and only one of them is obvious.** Too loose and a spammer
destroys our deliverability. Too strict and we lose customers to tools that don't make them jump
through hoops nobody else requires — and the ones who stay work around us, which is how the real
holes get made. This is the SECURITY PHILOSOPHY from `docs/official/db-rules.md` §6 applied to
sending: **over-tightening is a defect, exactly as serious as the hole.**

So capability is **earned, not flat.**

### What scales with trust (the ladder)

Daily send volume · how much AI-generated cold email may go out without per-message human approval
· number of connected mailboxes · sequence length and aggressiveness. A brand-new org starts
conservative; a proven org operates at full industry-normal capability.

**Raises trust:** verified domain + verified business identity · payment history and tenure ·
sustained low bounce and complaint rates · **replies received** (real engagement is the best
legitimacy signal there is) · manual review on request.
**Lowers it, fast:** complaint or bounce spikes · spam-trap hits · sudden volume changes ·
unsubscribe-rate spikes · list-quality failures.

**Trust falls faster than it climbs. That asymmetry is deliberate** — the cost of being slow to
promote is a mildly annoyed legitimate customer; the cost of being slow to demote is our domain
reputation and every other customer's deliverability.

### What NEVER relaxes (the floor)

The ladder governs **volume and automation only**. It never touches:

- suppression and unsubscribe honoring — no trust level buys past an opt-out;
- Lane A consent — no trust level permits sending to someone who never consented;
- domain-ownership verification and authentication;
- current recipient verification with a real MX and no disposable-domain result;
- purchased-list/bulk-scrape detection in **both** lanes;
- a working unsubscribe path whose RFC 8058 headers are covered by the provider's DKIM signature,
  plus immediate link honoring and a reply seam that honors the opt-out the moment G6 delivers it;
- spam-trap hits and complaint-rate circuit breakers — these pause the highest-trust org too.

**A capability that can be earned is on the ladder. A rule that protects a third party is on the
floor. Never move one to the other.**

### Trust is NOT the same thing as tier — one gate, two inputs

**Tier = what they pay for. Trust = what they have proven.** A paying customer on day one is
entitled to outreach and still starts low on the ladder; a long-proven org on a small plan is
trusted but capped by its plan. **Do not build two gating systems** — the §5.6 entitlement
authority answers "may this org do X, at what volume?" by consulting both.

### Hard catches at every level

Earned trust only works if the catches are real, so build them as first-class detection, not as
hopeful thresholds: complaint and bounce monitoring per identity AND per org, spam-trap and
blocklist monitoring, volume-anomaly detection, list-quality scoring at import, content signals,
and a fast internal review queue with a one-click org-wide stop. **The ladder is the reward for a
system that catches abuse quickly — not a substitute for one.**

## 5.6 Tier gating — outreach is the platform's FIRST gated feature ✅ **BUILT 2026-08-14**

> **DONE and live.** The tier is now something an **org carries**, there is ONE
> authority every surface asks (`billing.resolve_capability`), and `outreach.send`
> is its first and only enforced capability. Server and client ask the same SQL
> function; the client answer is UX, the server answer is truth.
>
> **System-of-record (read this before touching any tier/plan/quota code in ANY
> repo):** `common-docs/systems/entitlements-and-tiers/FEATURE.md`.
>
> - **Where it is enforced:** one step at the TOP of the refusal order in
>   `aidream/services/sending_identity/gate.py`, in **both** entry points
>   (`assert_can_send` + `assert_identity_ready_for_campaign`). Gated at the
>   capability — no outreach internals were edited. A plan checked on one door
>   only is a plan a campaign runner walks straight past (pinned by a test).
> - **`min_tier: trial`, not premium** — the abuse filter wants an *identified*
>   account, and a trial is one. Erring toward permitting.
> - **`period: null` — a gate, not a meter.** Volume is already governed by the
>   identity's own caps and the warmup ramp; a second number would be a second
>   source of truth.
> - **NOT gated:** connecting a mailbox, proving domain ownership, checking
>   SPF/DKIM/DMARC, warming up. The plan gates reaching a stranger, not learning
>   how — gating the teaching is how a non-technical expert's outreach ends on
>   day one (§5.3b).
> - **No dead end:** the refusal carries `fix_action: "upgrade_plan"` +
>   `required_tier`; `<CapabilityGate>` renders tier-held / tier-required / one
>   click. Verified in-browser end to end.
> - **NO-REGRESSION verified live:** the effective tier is the MOST PERMISSIVE of
>   (user tier, org tier) and is monotonic by construction — **0 regressions
>   across 6,660 users × 30 orgs**, and all 14 education capabilities remain
>   `permissive`.
> - **Existing orgs mapped:** AI Matrx + system org `internal`; live Stripe subs
>   mirrored; any org owning a sending identity `grandfathered`.
>
> **Remaining, and it is Arman's:** the tier NUMBERS and what else is paid — see
> §5.7. Nothing else in this section is outstanding.

### The original ruling (kept — it is the reasoning, not just the task)

> 🚨 **Read §5.5b immediately above before building this.** Tier and trust are two different
> inputs to ONE gate: **tier is what they pay for, trust is what they have proven.** An
> entitlement system that models only tier will have to be torn open later to admit the ladder —
> so leave room for a second input now, even if only tier is enforced at launch.

**Outreach volume sits behind a paid tier. The free tier does not include it.** Not as monetization
— as the cheapest abuse filter that exists. Free accounts are what attract the exact behavior that
gets sending infrastructure blocklisted, which is why every serious platform in this category
requires an identified, paying account before a stranger's inbox is reachable.

**This forces a feature we have been deferring: the platform has no real tier concept yet.** Arman:
*"We've been holding off on that feature because it hasn't been something we've absolutely needed
just yet. But guess what? You just came up with the first reason why we absolutely do need it."*

Two rules govern that build, and the second matters more than the first:

1. **Outreach is the first genuinely gated capability** — the reference implementation for how any
   surface asks "is this org allowed to do this?"
2. 🚨 **THE NO-REGRESSION RULE.** Introducing tiers must **take nothing away from anyone.** Err
   toward permitting: a capability is restricted ONLY when the restriction is 100% confirmed and
   written down. Anything ambiguous stays open. A silent capability loss during this transition is
   far worse than a free user briefly keeping something they might not be entitled to — the first
   breaks trust with real users who are already working, the second costs nothing.

**Guest accounts are REAL accounts** (Arman) — they are not a lesser class to be locked out by
default; they carry a tier like everyone else.

## 5.7 What else could be gated — ARMAN ONLY. Nothing here was changed.

Building §5.6 surfaced every other place the platform already thinks about
tiers. **None of them were touched**, because none met the bar the no-regression
rule sets: *restricted only when the restriction is 100% confirmed and written
down*. Each below is a real, live thing with real users, so gating any of them
would take something away from someone already working — which is Arman's call,
never an agent's. Listed with a recommendation so each can be answered with a yes.

| # | Candidate | What exists today | Why it was NOT gated | Recommendation |
|---|---|---|---|---|
| 1 | **The 14 education AI capabilities** | Free-tier matrix already approved by Arman and encoded in `billing.capability_limit`; usage is metered honestly; every one ships `enforced: false` | Real users are generating flashcards, quizzes and audio *right now*. Flipping `enforced` takes capability away from people mid-workflow — the exact thing §5.6 forbids | Flip **one at a time**, only after the aidream spend re-check exists per capability, and only with Arman's explicit yes on the number. Never a bulk flip |
| 2 | **`files.account_tiers`** (`guest`/`free`/`pro`/`enterprise`) | A SECOND, live tier ladder governing storage caps, `max_sandboxes`, presigned upload, resumable upload, audit log, legal hold | It is a *storage/compute quota* ladder, not the commercial tier — and it already governs live accounts. Cross-wiring it to `billing.tier` would silently change what existing accounts can store and run | **Arman decides whether these are one ladder or two.** Until he does, do NOT cross-wire them. If they unify, `billing` is the authority and `files.account_tiers` becomes a projection of it — never the reverse |
| 3 | **Sandboxes / compute targets** | `max_sandboxes` per account tier, read by `app/api/compute-targets` | Genuinely costly and a natural paid axis — but it is governed by (2), so gating it means answering (2) first | Bundle with the (2) decision |
| 4 | **`iam.org_member_controls.tier_override` / `storage_cap_bytes` / `monthly_budget_mcents`** | Per-member org-admin overrides, documented "advisory in v1" — nothing enforces them | Purpose-built and unfinished, not dead. Enforcing them today would start capping members who have never been capped | Finish deliberately as *org-admin governance* (an org limiting its own members), which is a different question from the commercial tier. Keep them separate |
| 5 | **RAG library "entitlement"** (`rag.fn_list_library_catalog`) | An audience/access concept — organization / industry / global / admin | **Not a commercial tier at all.** The word collides; the concept does not | Leave alone. Never wire it to `billing` |
| 6 | **Paid classes / creator payouts** | Already gated the strongest way available: webhook-only, service-role RPCs | Nothing to do — it is correct | No change |
| 7 | **Outreach pricing shape** (§8.5) | Undecided: per mailbox, per seat, per send, per campaign | A pricing model, not a gate | Answer §8.5; the gate is already built and needs no code change to follow it |

**The one thing that must not happen:** a third tier concept. There are two
today (`billing.tier` commercial, `files.account_tiers` storage/compute) and that
is already one more than ideal. Any new "plan"/"tier"/"quota" idea extends
`billing` or it does not ship — see
`common-docs/systems/entitlements-and-tiers/FEATURE.md`.

---

# 6. Build order

**Phase 1 — the bridge (small, unblocks everything).** ✅ **Server DONE and deployed
2026-08-14.** G1 domain→party, from both backlink prospects and reputation cases; proven live
against All Green Recycling (a referring domain and a TechCrunch reputation case both resolve to
parties that open at `/crm/[partyId]`). The only Phase-1 remainder is the frontend trigger, which
is Phase 6 / G9 work.

**Phase 2 — targets worth writing to.** ✅ **DONE 2026-08-15 — deployed both repos.** G2 contact
discovery from data we already crawl is suggestion-gated and runs through the same governed
resolver the experts promotion uses. Real observed addresses remain unverified until the
verification/send authority clears them; low-confidence people and role mailboxes never become
auto-contactable.

**Phase 3 — the right to send (G5, §5).** ✅ **DONE 2026-08-14 — deployed both repos.**
The sending-identity record is live end to end (see G5). Proven live against the real DB and
real DNS with our own `info@aimatrx.com` mailbox (`aidream/scripts/_verify_sending_identity.py`,
18/18): a real mailbox connects · an identity cannot claim an address its connection does not
own · the TXT challenge really fails when unpublished and the unverified domain is refused ·
SPF/DKIM/DMARC really resolve · a warming identity is refused a campaign · raising `daily_cap`
does not raise the warm-up ramp · a 5% complaint rate auto-pauses the identity **and its
campaign** · re-running health never un-pauses · a human can resume · the org kill switch stops
everything at the gate.
**The one step a human must do before the first real send:** publish the `_matrx-verify` TXT
record for the sending domain (the surface shows the exact record) — an agent may not publish
DNS on a production zone.

**Phase 4 — the message and the first real send.** G3 template primitive + G7 compliance, with
suppression and unsubscribe enforced *inside* the send primitive. Ship the single-send path
end-to-end — one case → one personalized, compliant, suppression-checked email from a verified
warm identity → logged as `crm.interaction`. **A working, human-approved 1:1 send is genuinely
useful on its own** (it is exactly how a careful link builder works today) and it de-risks
everything after it.

**Phase 5 — scale and listen, together.** G4 sequence runner + G6 inbound. **Do not ship the
sequence runner without reply ingestion** — an unstoppable cadence is worse than no cadence, and
stop-on-reply is the single most important behavior in the system.

**Phase 6 — prove it.** G8 attribution: close the loop against our own crawl. This is the payoff
and the differentiator (§1).

**Phase 7 — the surfaces.** G9 "Start outreach" from a backlink prospect and a reputation case,
plus the Phase-1 frontend trigger, landing in the existing `/crm/outreach-lists` workspace.

Phases 1–4 are independently valuable and shippable. **Nothing before Phase 5 sends anything a
human did not approve** — the correct risk posture for a system whose failure mode is "we helped
a customer spam strangers from their real mailbox."

## What is actually open, 2026-08-15

1. **Phase 4 — the message + the first real send.** *(chip fired)* The template primitive
   (unresolved variable = refuse to send) plus the human-approved single-send path through
   `check_send_eligibility()`. **The next move, fully unblocked** — everything it needs is live.
   Design the approval requirement as a §5.5b ladder input, never a hardcoded constant.
2. **Compliance engineering gaps.** *(chip fired)* MX verification, DKIM-signed unsubscribe
   headers, reply-based opt-out, purchased-list detection — named in
   `common-docs/systems/outreach-compliance/ENGINEERING_GAPS.md` § "Still open". FLOOR items:
   no tier and no trust level buys past them.
3. **Phase 5 — sequences + inbound (G4 + G6).** The cadence schema already exists unused on
   `crm.outreach_list_member`. 🚨 **Do not ship the runner without reply ingestion** — an
   unstoppable cadence is worse than no cadence, and reply-based opt-out (item 3) depends on the
   same seam.
4. **Phase 6 — attribution (G8).** The differentiator (§1): our own crawl closes the loop and
   proves the link appeared. Nobody else in the category can do this.
5. **Phase 7 — surfaces (G9).** "Start outreach" from a backlink prospect and a reputation case,
   plus Phase 1's frontend trigger. Today the reputation verdict is still a dead end.
6. **Scaled media ingestion** — the research and first crawl landed; volume ingestion did not.
7. **Lane A, entire** (below). Committed vision, deliberately sequenced after Lane B.

## Lane A (opt-in marketing) — a separate, later track. DO NOT LOSE IT.

**Everything in Phases 1–7 above is LANE B**, because backlink and media outreach are cold and
that is what Arman needs now. **Lane A is committed vision, not a maybe** (§5.1): our CRM must be
able to send opt-in marketing on a customer's behalf, handled exactly as Klaviyo/Mailchimp/SendGrid
handle it, duplicating their policies end to end.

It is deliberately sequenced after Lane B, and it is genuinely a different build — because *our*
reputation carries it:

- Our own sending infrastructure (a bulk ESP account), on the customer's authenticated domain.
- **Per-recipient consent proof as a hard eligibility gate** — no consent record, not reachable.
- Consent capture surfaces (forms, imports that carry source + timestamp + basis) — note the
  contact-table folds already in the CRM handoff are exactly where consent metadata must survive.
- Their AUP mirrored as our AUP: no purchased lists, complaint-rate enforcement, list hygiene,
  and a suspension path we will actually use.
- Preference center + one-click unsubscribe honored through the SAME single suppression authority
  as Lane B, so an opt-out in either lane stops both.

**Reusable across both lanes** (build once, in Lane B, with Lane A in mind): the message template
primitive, the cadence runner, inbound ingestion, suppression, attribution, and the guided
checklist. **Not reusable:** the sending path and the eligibility rules — those are lane-specific
by design, and collapsing them is the trap (§7).

---

# 7. Traps

- **Do not build a second contact store.** Prospects are `crm.party`. Media outlets are
  `crm.party`. Journalists are `crm.party`. A `seo.prospect` table is the mistake.
- **Do not build a second suppression list.** One authority, ruled.
- **Do not let a caller send without going through the suppression + unsubscribe check.** Enforce
  inside the primitive; a bypassable check is a future incident.
- **Do not auto-create contacts from guessed email patterns.** Suggestion-gated; a wrong guess is a
  spam complaint against our own domain.
- **Do not ship merge fields that can render empty.** Unresolved variable = refuse to send.
- **Do not build a separate outreach console.** It belongs beside the records, in
  `/crm/outreach-lists`.
- **Do not treat attribution as phase-2 garnish.** It is the differentiator (§1).
- **Never relay customer outreach through AI Matrx infrastructure or a shared "from" pool.** That
  single shortcut converts one customer's bad behavior into every customer's deliverability
  problem, and ours. Customers send from their own verified domains (§5.1).
- **Never let outreach share infrastructure with our transactional mail.** Different provider
  account, different domain, different code path — or someone else's campaign takes down our
  password-reset delivery.
- **Never let a mailbox skip warmup or domain verification because a customer is in a hurry.** The
  gates are the product, not friction to be waived. An override that exists will be used.
- **Do not send to an unverified address.** Hard bounces are the fastest way to burn a domain.
- **Do not build one `send()` with a lane boolean.** The lane decides which sending path is
  reachable and which contacts are eligible; enforce it in the data, refuse on mismatch (§5.1).
- **Do not blend the lanes "just for now".** A cold list on our infrastructure, or an opt-in send to
  an unconsented contact, is the incident this whole architecture exists to prevent.
- **Do not show a technical gate as a bare error.** DNS, DMARC and warmup are guided steps — do it
  for them, machine-check it, or teach them (§5.3b). Our user is a non-technical expert.
- **Do not take a capability away from an existing user while introducing tiers** (§5.6).

---

# 8. The five decisions — RULED 2026-08-14 (Arman), under the earned-trust caveat

Arman took all five recommendations **with one overriding caveat that modifies several of them**:
*we cannot lose customers by being more cautious than our competitors.* Read §5.5b (THE
EARNED-TRUST LADDER) before acting on any of these — it is the lens they were ruled through.

1. **Reply ingestion — narrowest scope that works, as the DEFAULT.** Read only the threads we
   sent, and say so plainly in the connect flow. **Caveat applied:** if research shows broader
   access is genuinely table stakes for reply detection at parity with Instantly/Smartlead, offer
   the broader scope as an explicit, explained opt-in — do not simply lose the capability. Verify
   what competitors actually require before finalizing.
2. **AI-generated cold email — governed by the LADDER, not a flat rule.** A new org has a human
   approve messages before sending; a proven org sends at industry-normal volume with sampling and
   spot-checks instead of per-message approval. Arman: *"allow users or organizations to earn the
   right to do more and more of them… but we also have to be careful that our system is not built
   around some ridiculous limitation that just is not gonna work in the long term."* **Design the
   volume/automation ceiling as a ladder input from day one** — a hardcoded cap is the trap.
3. **Warmup — honest ramp is the DEFAULT, but do not concede the category.** Arman: *"if everyone
   else is doing other things, we can't compete… we need to consider if other methods need to be
   developed even if it means that we document it and develop it on the side, and we don't make it
   a part of our required system, but it's something that's definitely planned to be built."*
   So: gradual ramp ships as the default and the recommended path; **alternative warmup methods
   (including pool-style networks) are researched and documented now, and planned as buildable
   optional capability** — not dismissed on principle.

   ### ✅ Research pass DONE 2026-08-14 — the answer, in full, with sources

   **`/Users/armanisadeghi/code/common-docs/systems/outreach-compliance/DELIVERABILITY_AND_WARMUP.md`**
   — read it before building warmup, caps, health, or the sending-identity schema. Headlines:

   - **The decision is settled by precedent, not principle.** Google's 2022-11-18 notice ordered
     Gmail API developers to *"disable the email warming feature by February 13, 2023"* or lose
     access — GMass, Woodpecker and lemlist named; Saleshandy published its own shutdown. The
     clause is still live policy. **A warmup pool through OUR OAuth client is not a risk to weigh,
     it is the known cause of the exact outcome §5.3 exists to prevent.**
   - **The category survived by moving warmup off the Gmail API onto SMTP/IMAP.** So the buildable
     optional version, if it is ever built, is confined to `smtp_imap` identities and is
     architecturally unreachable from OAuth — which is why §5.2 item 1 now makes connection method
     a capability key **today**, before any of it exists.
   - **All four vendors run the same machine** (reciprocal pool, auto-open, auto-reply,
     auto-rescue-from-spam). *"Real inboxes, no bots"* is a claim about who owns the mailbox, not
     about whether the engagement is genuine. No independent evidence that any of it beats an
     honest ramp; it optimizes the two signals (opens, synthetic replies) filters discount most.
   - **We are NOT handicapped by the default.** Gradual ramp is Google's own published
     instruction. What we were missing was not a pool — it was *industry-normal caps* (§5.2 item 5)
     and *placement visibility* (below).

   **What ships as default:** the ramp, at industry-normal caps · domain-as-reputation-unit ·
   connection method as capability key · **seed-list inbox-placement testing**, which is safe,
   valuable, and the only placement visibility a cold sender can get at all since Postmaster Tools
   is blind at these volumes (state its directional limits in the UI — a tool reporting "94%
   inbox" as truth is lying).

   **The fast follow — this is the real answer to "everyone else offers warmup":** *managed
   pre-warmed domain + mailbox provisioning.* Instantly's own top recommendation is buying
   pre-warmed accounts usable day 1. Strip the synthetic engagement out and what remains is
   domains and mailboxes provisioned early with a genuine low ramp started before the customer
   needs them — it sells exactly what warmup is bought for (**elapsed time**), is safe under every
   policy, is a paid capability rather than a cost center, and fits the §5.3b doctrine that we do
   it for them. **Second, near-free:** don't break a customer's own third-party warmup on an
   SMTP/IMAP mailbox, and account for its traffic so our health metrics stay honest.

   **What we refuse, with the reasoning recorded so nobody relitigates it blind:** pools,
   automated spam-folder rescue, and cap-evasion mailboxes through our OAuth apps; bot mailboxes
   we operate; any inbox-placement guarantee. Each is refused because it risks the one asset whose
   loss is not contained to the customer who caused it — not on squeamishness.

   **Left open for counsel** (sharpens ATTORNEY_BRIEF Q9): the policy's bulk-mail carve-out reads
   *"approved as long as the user consented to receive emails"* — whether Lane B itself sits
   comfortably inside Gmail restricted scopes is arguable both ways and an agent may not settle it.
4. **Media/journalist data acquisition — research and first crawl DONE 2026-08-14; scaled
   ingestion remains open.** Cross-repo source of truth:
   `/Users/armanisadeghi/code/common-docs/systems/outreach-data/FEATURE.md`. It contains the full
   source/license matrix, actual prices, vendor-rights questions, purchase brief, and live crawl
   receipt. Headline decision: start the CC0/free registry spine with Wikidata, DOAJ, Crossref,
   OpenAlex, and ORCID; buy a **$34/month annual-billing Hunter Starter** candidate-enrichment
   pilot; run at most a $50 DataForSEO listings pilot after written multi-tenant persistence rights;
   do not use ordinary Muck Rack/Cision/Prowly/Meltwater/Podcast Index/Substack/HARO-style plans as
   product database seeds. Traditional databases require explicit OEM/data-license terms.

   The concrete crawl ran Wikidata `Q228389` → a robots-allowed, public-domain Voice of America
   reporter bio → `rs_source.page_analysis` → the **server** party resolver. It created one VOA
   organization party with a Wikidata external ID and **zero email/phone contact points**; every
   person/byline remains suggestion-gated per §3 G2. Topic
   `3a5124c3-88ed-4c46-b096-7af563cda7dd`, source
   `524d561c-f584-4ad4-9654-4258f4aa88c0`, party
   `d6659209-4406-4735-874e-0a4eef61a99d`.

   Arman: *"I'm okay with crawl only for now. However… we need to document, that we need to look
   into all of those things… if there are lists that maybe we can crawl for once, then let's get
   that crawl task going today or tomorrow. We're not gonna wait."* His mental model for data
   sources, which generalizes beyond media:
   - **Hostile APIs** (SEMrush, Ahrefs class) — priced and shaped so you don't use them. Skip.
   - **Purpose-built APIs** (DataForSEO class) — made to be consumed. Evaluate seriously.
   - **Community/open goldmines** (the OpenStreetMap class — "incredible data at nothing or next
     to nothing"). **Hunt for these first;** analogous troves exist for legal/cases and elsewhere.
   **Never treat "we'll crawl it ourselves" as the end of the conversation.** Next work is the
   allowlisted registry ingestion and candidate-review queue described in the source of truth.
5. **Outreach pricing — per connected mailbox, aligned with the category**, resolved inside the
   §5.6 tier work; volume rides the ladder on top of the plan.

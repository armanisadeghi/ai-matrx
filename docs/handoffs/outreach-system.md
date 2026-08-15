---
status: active
updated: 2026-08-14
repos: [matrx-frontend, aidream]
---

# Outreach system — backlink outreach + media outreach

**The one-sentence gap:** *we already find the opportunity, score it, and write the pitch — and
then we have no way to reach a human being.*

This document is the work order for closing that. It exists because Arman named backlink outreach
and media outreach as the next things to build (2026-08-14), and because building them honestly
forces out a set of canonical primitives the platform is missing and did not know it was missing.

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
| **SEO domain → party fold (G1)** | aidream `services/crm/seo_domains.py`; `POST /api/seo/sites/{id}/crm/{referring-domains,reputation-outlets}` | **Live 2026-08-14** — no frontend caller yet |
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
`POST /api/seo/sites/{site_id}/crm/referring-domains` · `POST /api/seo/sites/{site_id}/crm/reputation-outlets`.
Every folded org carries a provenance edge (`link_prospect` / `outreach_target`) whose payload
holds the verdict, priority, source URL and pitch angle — the answer to "why is this org in my
CRM". Idempotent on the domain key (refold creates nothing); a domain already in the CRM is
enriched, never duplicated. Toxic link farms, watch-list verdicts and the brand's own domain are
skipped WITH the reason. Contract + earned traps: `aidream/aidream/services/crm/FEATURE.md`
§ "SEO domains".
**Remaining (frontend, belongs with G9):** nothing calls these routes yet — a "Find these
domains in my CRM" action on the backlink-prospect and reputation-case surfaces, and the
provenance edge rendered on the party record page.

### G2 — Contact discovery. *Who at that domain?*
An organization is not an inbox. We need the editor, the author, the webmaster — and we already
extract bylines and credentialed authors from every page we crawl, then bury them in
`rs_source.page_analysis` JSONB. That is the exact same buried-signal problem the experts work is
fixing, through the same resolver, and it should reuse that path rather than invent a second one.
**Suggestion-gated:** a scraped `info@` or a guessed pattern address is a *candidate*, never an
auto-created contact — a wrong guess is a spam complaint against our sending domain.

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
bounce, cannot honor an unsubscribe, and cannot measure anything. **This is not optional polish —
it is what separates outreach from spam,** and it is legally load-bearing (§5).
Needs: provider webhooks (delivered/bounced/complained), reply ingestion, and threading so a reply
lands on the party's `crm.interaction` timeline as a real conversation.

### G7 — Compliance, built into the send primitive. *Arman's ruling: "follow the law."*
Commercial email carries obligations (CAN-SPAM/CASL/GDPR-class): a working one-click unsubscribe,
a physical postal address, honest headers and subject, prompt opt-out honoring, and a lawful basis
where GDPR applies. **US first, non-US documented but not built (§5.4)** — while storing consent
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

### G9 — Surfaces.
Outreach must start where the opportunity is found — a "Start outreach" action on a backlink
prospect and on a reputation case — landing in the existing `/crm/outreach-lists` workspace rather
than a new console. **A separate outreach app that doesn't know about the CRM is the failure mode
to avoid.** Reputation cases need their verdicts (`pitch`, `request_update`, …) wired to real
actions; today the verdict is a dead end.

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
7. **Persistent guided checklist** (§5.3b) — a resumable checklist mixing machine-verified steps
   with human-confirmed ones, that re-verifies on return. **The most reusable thing in this
   document.** Wanted by: DNS/domain setup, mailbox warmup, Search Console connection, CMS site
   launch, org onboarding, payment setup — every one of which is currently a hand-rolled worse
   version or a dead-end error. Build it generic in `lib/`; outreach is merely its first consumer.
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

1. **Connection.** OAuth for Google Workspace and Microsoft 365 (the two that matter); SMTP/IMAP as
   the fallback that covers everyone else. We already have the Google half
   (`send_reviewed_gmail`) — extend it, don't fork it.
2. **Domain ownership proof — gate before ANY outreach send.** DNS TXT challenge on the sending
   domain. A customer who cannot prove they own the domain does not get to send from it. This one
   gate removes most casual abuse, and every serious platform requires it.
3. **Authentication verified, not assumed.** Check SPF, DKIM and DMARC actually pass for that
   domain before enabling sends, and re-check periodically. Since the Google/Yahoo bulk-sender
   rules (Feb 2024), unauthenticated mail is simply discarded at volume — a customer sending
   without DMARC is buying nothing but a damaged domain.
4. **Warmup as a state machine.** Arman is right that this is standard practice: a new sending
   identity starts at a low daily volume and ramps over ~3–4 weeks before full use. Model it as
   real state on the record (`warming` → `ready`), with a ramp schedule the runner obeys. **A
   mailbox in warmup cannot be used for a campaign** — the system enforces it rather than trusting
   the user to know.
5. **Caps, throttle, and human pacing.** Per-identity daily cap, per-hour cap, randomized intervals,
   quiet hours in the *recipient's* timezone. Cold-outreach practice is far below provider limits —
   tens per mailbox per day, not hundreds. Multiple connected mailboxes is how volume scales, not a
   bigger number on one mailbox.
6. **Live health.** Bounce rate, complaint rate, reply rate per identity, on a rolling window.
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

**The primitive this forces out (see §4.7): a persistent, resumable guided checklist** that mixes
machine-verified steps with human-confirmed steps, remembers where the user is, and re-verifies on
return. **This is NOT an outreach-local wizard** — DNS setup, Search Console connection, CMS site
launch, org onboarding and payment setup all want the same thing, and each has been hand-rolling a
worse version. Build it generic in `lib/`, consume it here.

## 5.4 Compliance posture — US first, rest of world documented (Arman, 2026-08-14)

Build for the US, but **do not design anything that makes non-US support a rewrite.** Concretely:
store consent basis, source, and timestamp per contact from day one, and keep jurisdiction a field
on the record — retrofitting those later means re-contacting everyone.

Every commercial send, from the first one, carries: a working one-click unsubscribe
(`List-Unsubscribe` header, now effectively mandatory), a physical postal address, honest headers
and subject, and immediate opt-out honoring (the law allows days; we do it instantly because the
suppression authority already exists).

Non-US is documented, not built: the EU/UK (GDPR + ePrivacy — cold B2B may rest on legitimate
interest, with documentation, and some member states are far stricter) and Canada (CASL — consent-
based, with real penalties and no US-style opt-out carve-out) each change *what we build*, not just
the footer. **Before the first customer send, a qualified compliance/legal review is required —
this is not something an agent should infer from memory, and the AUP and ToS must be written by
someone qualified.** That is the one piece of this section that cannot be closed in code.

## 5.5 Identity level — resolved

Sending identity attaches to **an org**, with the connected mailbox owned by a user in that org,
and an agency's managed client is its own org. This falls straight out of the CRM model (every
party and every contact is org-scoped) and it means an agency connects one identity per client
org — which is also the correct deliverability answer, since a client's mail should come from the
client's own domain.

## 5.6 Tier gating — outreach is the platform's FIRST gated feature (Arman, 2026-08-14)

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

---

# 6. Build order

**Phase 1 — the bridge (small, unblocks everything).** ✅ **Server DONE and deployed
2026-08-14.** G1 domain→party, from both backlink prospects and reputation cases; proven live
against All Green Recycling (a referring domain and a TechCrunch reputation case both resolve to
parties that open at `/crm/[partyId]`). The only Phase-1 remainder is the frontend trigger, which
is Phase 6 / G9 work.

**Phase 2 — targets worth writing to.** G2 contact discovery from data we already crawl,
suggestion-gated, through the same resolver the experts work uses.

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

# 8. Open decisions — Arman only (raised 2026-08-14, not yet ruled)

These are genuinely his: each is a product/ethics/money call an agent must not make alone. Each
carries a recommendation so it can be answered with a yes.

1. **Reply ingestion — how much of the customer's mailbox may we read?** *(Blocks Phase 5. The
   biggest one.)* Stop-on-reply is the single most important behavior in the system, and it
   requires knowing a human replied. Instantly/Smartlead take full IMAP access to the customer's
   mailbox. That is a large trust ask for a mailbox containing everything else in their business.
   **Recommendation: request the narrowest scope that works — read only threads we sent** (Gmail
   API can scope to the thread ids we created), and say so plainly in the connect flow. Broader
   access only if a customer opts in explicitly for a stated reason.
2. **AI-generated cold email at volume — human approval required, or not?** We can generate 500
   personalized pitches in a minute. That capability, unchecked, makes us the tool flooding
   inboxes — the exact behavior Google's bulk-sender rules and every spam filter now target, and
   the fastest route to our OAuth app being flagged (§5.3). **Recommendation: for Lane B, a human
   approves every message before its first send** — consistent with THE INTENTIONAL-ACTION LAW in
   the assists doctrine, and it is also what actually gets replies. Revisit only with evidence.
3. **Warmup pools — build one or not?** Instantly/Smartlead run networks where customer mailboxes
   email each other to manufacture sending reputation. It is industry standard, it works, and it is
   ethically grey (it exists to fool spam filters, and providers dislike it). **Recommendation:
   no pool for v1** — do honest gradual volume ramp (§5.2.4), which is safe and sufficient at
   backlink/media volumes. Reconsider only as a deliberate, documented decision.
4. **Media database — crawl-only, or license one?** Muck Rack/Cision own large proprietary
   journalist databases and charge accordingly. **Recommendation: crawl-only to start** — we
   already extract bylines and credentialed authors (G2), and our own attribution loop (§1) is the
   differentiator, not database size. Revisit if media outreach becomes a headline product.
5. **Outreach pricing shape** — per connected mailbox, per seat, per send, or per campaign?
   Competitors mostly price per mailbox/seat. Ties directly into the tier work (§5.6), so answering
   it early keeps that build from guessing.

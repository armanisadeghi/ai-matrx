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

### G1 — Domain → party. *The bridge.*
Nothing in SEO ever calls the party resolver. A referring domain, an outlet, a prospect site is a
string in `seo.*` and an organization in `crm.party`, and the two never meet. Without this there is
no one to write to, and every later gap is unreachable.
**It is small:** the resolver already accepts domain as a natural key. This is a call site plus a
source stamp, not a new system. Do it first; it unlocks everything below.

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

### G5 — Sending identity + throttling. *The decision that shapes everything else.* → §5
`send_reviewed_gmail` is 1:1 and human-reviewed. Campaign sending needs to know which mailbox
speaks, at what rate, with what warmup.

### G6 — Inbound: replies, bounces, complaints. *The hard gap, and the one most likely to be skipped.*
Today outreach is write-only. Without inbound we cannot stop on reply (G4), cannot suppress on hard
bounce, cannot honor an unsubscribe, and cannot measure anything. **This is not optional polish —
it is what separates outreach from spam,** and it is legally load-bearing (§5).
Needs: provider webhooks (delivered/bounced/complained), reply ingestion, and threading so a reply
lands on the party's `crm.interaction` timeline as a real conversation.

### G7 — Compliance, built into the send primitive. *Arman's ruling: "follow the law."*
Commercial email carries obligations (CAN-SPAM/CASL/GDPR-class): a working unsubscribe, a physical
postal address, honest headers and subject, prompt opt-out honoring, and a lawful basis where GDPR
applies. Rules differ by jurisdiction, so **treat this as a real compliance review before first
send, not as trivia an agent infers from memory.**
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
   unbypassable by construction.
6. **Outcome attribution** (G8) — did the thing we wanted actually happen in the world?

---

# 5. Decisions needed (Arman) — blocking

1. **Sending identity strategy.** Arman ruled "whatever is our current/canonical", and our only
   working path is the connected Gmail one. But the two jobs genuinely differ, and getting this
   wrong is expensive in a way that is hard to undo:
   - **Connected mailbox (Gmail/Workspace OAuth)** — real personal inbox, best deliverability and
     reply rates, threads naturally. Right for 1:1 and warm outreach. **Wrong for volume:** cold
     blasts from a real business mailbox risk that mailbox and that domain.
   - **Dedicated bulk domain (Mailgun)** — throwaway sending domain, webhooks for bounce/complaint,
     scales. Right for volume; worse reply rates; needs warmup and DNS (SPF/DKIM/DMARC).
   **Recommendation: build the send primitive provider-agnostic and ship the connected-mailbox path
   first** (it's real today, it's the higher-quality motion, and backlink/media outreach at *our*
   volumes is closer to 1:1 than to bulk). Add Mailgun behind the same interface when volume
   demands it. **Confirm, or name the other order.**
2. **Cold outreach posture per jurisdiction.** Cold B2B email is treated very differently in the
   US vs EU/UK vs Canada. This changes what we build (opt-in vs opt-out, what we may store, how we
   prove basis) — not just what we write in the footer. Decide whether v1 targets US-only, or must
   be lawful in the EU/UK/CA from day one. **A compliance review before first send is warranted;
   do not have an agent infer this from memory.**
3. **Whose mailbox sends on a client's behalf?** For an agency using AI Matrx for *their client's*
   backlinks: does the agency send, or does the client connect their own mailbox? This decides
   whether sending identity is per-user, per-org, or per-managed-client, and it is cheap now and
   expensive later.

---

# 6. Build order

**Phase 1 — the bridge (small, unblocks everything).** G1 domain→party, from both backlink
prospects and reputation cases. Verifiable immediately: a referring domain resolves to a party you
can open at `/crm/[id]`.

**Phase 2 — targets worth writing to.** G2 contact discovery from data we already crawl,
suggestion-gated, through the same resolver the experts work uses.

**Phase 3 — the message.** G3 template primitive + G7 compliance and suppression built *into* the
send primitive. Ship the single-send path end-to-end (one case → one personalized, compliant,
suppression-checked email → logged as `crm.interaction`) **before** any cadence exists. A working
1:1 send is genuinely useful on its own, and it de-risks everything after it.

**Phase 4 — scale and listen, together.** G4 sequence runner + G6 inbound. **Do not ship the
sequence runner without reply ingestion** — an unstoppable cadence is worse than no cadence.

**Phase 5 — prove it.** G8 attribution: close the loop against our own crawl. This is the payoff.

**Phase 6 — the surfaces.** G9 "Start outreach" from a backlink prospect and a reputation case,
landing in the existing outreach workspace.

Phases 1–3 are independently valuable and shippable. Nothing before Phase 4 can send anything a
human did not approve, which is the correct risk posture for a system whose failure mode is
"we spammed people from a real mailbox."

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

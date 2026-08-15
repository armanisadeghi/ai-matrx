# Outreach system — continuation handoff

**Updated:** 2026-08-15 · **Lane B phases 1–3 live; Phase 4 implemented, production proof pending**

This is a continuation handoff, not the system of record. Cross-repo legal/operational truth
lives in `/Users/armanisadeghi/code/common-docs/systems/outreach-compliance/`; the generic
message-template contract lives in
`/Users/armanisadeghi/code/common-docs/systems/message-templates/FEATURE.md`.

## 1. Product promise

Turn reputation findings and backlink opportunities into accountable relationships: identify
the right target, find the right person, write one genuinely relevant message, send only when
law/reputation/identity allow it, record the interaction, ingest the reply, and prove the link or
mention appeared. The CRM is the shared relationship spine; outreach is not a separate contact
database.

## 2. Current truth

- Phase 1/G1 target promotion is live: SEO/reputation targets resolve to real CRM parties.
- Phase 2/G2 contact discovery is live: observed author/editor evidence is suggestion-gated,
  confirmed through the party resolver, and never invents an address.
- Phase 3/G5 sending identity is live in both repos: connected mailbox, domain proof,
  SPF/DKIM/DMARC checks, warmup/caps/pacing, health events, circuit breaker, tier gate, and guided
  setup. Production currently has no active `crm.sending_identity` row; provisioning a named
  mailbox remains an operational prerequisite for a real send.
- Compliance is live: `crm.check_send_eligibility()`, suppression/unsubscribe, jurisdiction,
  AUP, list quality, postal footer, RFC 8058 envelope, MX verification, and circuit breaker.
- Phase 4/G3 code now exists: generic strict templates plus one human-reviewed Lane B send into
  `crm.interaction`. It is not complete until deployed and proven with a real received message.
- No sequence runner, reply provider ingestion, attribution loop, or broad “Start outreach”
  surface exists yet.

## 3. Capability gaps

### G2 — contact discovery ✅

`aidream/services/crm/outreach_contacts.py` extracts observed people/addresses from current crawl
evidence. Preview writes nothing; confirmation revalidates keys, uses `resolve_party`, creates the
real affiliation/contact point, and requires explicit acceptance for low-confidence people or role
addresses. Guessed patterns are forbidden.

### G3 — generic message templates + personalization 🟡

Authority: `agent.message_template`, existing frontend editor, and aidream
`services/message_templates`. Email subject is `metadata.subject_template`; body is `content`.
Bindings come from real records (`{{party.display_name}}`, `{{case.pitch_angle}}`,
`{{backlink.anchor}}`). Missing, null, blank, empty, malformed, structured, or unresolved fields
are a hard rendering failure before approval and again before send. Approval fingerprints the exact
subject + final body; any data/template/envelope change invalidates it. Outreach is the first
consumer, not the owner.

### G4 — sequences ⬜

Use the existing cadence fields on `crm.outreach_list_member`; do not add a parallel sequence
store. Never start this before G6 provider reply ingestion can stop a cadence.

### G5 — right to send ✅ primitive / ⚠ operational identity

`crm.sending_identity` is the mailbox authority; aidream `send_through_identity()` is the only
wire door. A Lane B campaign derives its identity from persisted data. No shared relay, no caller
identity override, no force/skip argument.

### G6 — inbound replies ⬜

Normalized reply/opt-out seam exists; Gmail/Microsoft/IMAP delivery into it does not. A reply must
stop future steps before sequences ship.

### G8 — attribution ⬜

Use our crawl to detect the earned link/mention, attach evidence to the originating interaction,
and state the verdict—not merely a last-checked timestamp.

### G9 — product doors 🟡

Phase 4 exposes “Write one email” on a Lane B list member. Reputation cases/backlink prospects
still need direct doors into the same campaign/member flow; no alternate send surface.

## 5. Non-negotiable operating law

### 5.1 THE TWO-LANE LAW

- **Lane A — `opt_in_marketing`:** recipient consent; our sending infrastructure/reputation; later.
- **Lane B — `cold_outreach`:** customer's connected mailbox/domain; narrow jurisdictional B2B
  conditions; current build.

Lane is stored on `crm.outreach_list` and enforced by separate paths. Never implement one
`send(lane: boolean)` and never infer lane from UI copy. Phase 4 accepts no lane input: it loads a
campaign and requires `lane='cold_outreach'`.

### 5.3b every block has a door

For every refusal: do it for them, machine-check it, or teach them. The DB verdict returns
`blocks[{code,message,fix}]`; every surface renders `fix`. An unsubscribe's honest fix may be
“Nothing—only they can reverse it.” A bare 403/409 is a defect.

### 5.4 compliance authority

`crm.check_send_eligibility(medium_id,list_id,identity_id)` is the ONE send authority. Ask before
every send and again at the final wire boundary. Never reimplement one of its checks in Python or
TypeScript and never route around it. Add new compliance rules to the DB authority. The server may
perform a machine-fix it requests (for example MX verification), then must ask the same authority
again.

### 5.5b THE EARNED-TRUST LADDER

- Stage 0: review every message.
- Stage 1: review every message while the system learns from edits.
- Stage 2: deterministic 10–25% review sample.
- Stage 3: monitoring only, with rollback on quality/health signals.

The organization policy is the input; a caller cannot claim a stage. Missing/malformed data fails
to Stage 0. Phase 4 begins at every-message approval but persists the rule as ladder data, not a
hardcoded forever-constant.

## 6. Delivery phases

1. **Target promotion (G1)** — live.
2. **Contact discovery (G2)** — live.
3. **Right to send (G5 + compliance + tiers + checklist)** — live primitive.
4. **One real message (G3)** — strict generic render; real-target preview; planned interaction;
   exact-message approval; final eligibility check; send; event + interaction receipt. Code built;
   deploy, create/use a named verified warm identity, prove arrival, suppressed refusal + fix, and
   unresolved-variable refusal before marking complete.
5. **Sequences + inbound (G4 + G6)** — build together.
6. **Attribution (G8)** — crawler closes the loop.
7. **Doors and expansion (G9)** — cases/prospects enter the same primitive; then Lane A.

## 7. Phase 4 implementation map

- Shared contract: common-docs `systems/message-templates/FEATURE.md`.
- Strict renderer: aidream `services/message_templates/`.
- Lane B orchestration/API: aidream `services/outreach_single_send/` and
  `api/routers/outreach_single_send.py`.
- Authoring: frontend `features/message-templates/`.
- Human flow: frontend `features/crm/components/outreach-lists/SingleSendDialog.tsx`.
- Durable draft/send receipt: `crm.interaction`; no new table.
- Final send: sending-identity gate; eligibility authority remains the DB function.

## 8. Next exact move

Deploy both repos, sync generated API types from live aidream, then production-test Phase 4. If no
named Gmail-send-capable identity exists, stop at the exact guided fix—reconnect the named mailbox
with `gmail.send`, prove its domain, complete authentication/warmup/postal/AUP—and do not stamp or
bypass readiness. Register `/crm/outreach-lists/{listId}` in `agent.review_queue` only after the
live surface exists.

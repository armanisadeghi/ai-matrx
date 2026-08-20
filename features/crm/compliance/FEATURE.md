# FEATURE.md — `crm/compliance`

**Status:** `compliance floor LIVE · unsubscribe LIVE · circuit breaker LIVE · attorney ratification PENDING` · **Tier:** `1` · **Last updated:** `2026-08-15`

🚨 **Cross-repo system-of-record:** `/Users/armanisadeghi/code/common-docs/systems/outreach-compliance/`
— read it before touching anything here, in ANY repo. It carries the verified sources and dates,
the obligation→enforcement-point matrix, the draft AUP, the user-facing guidance, and the
attorney brief.

---

## Purpose

**Nothing may be sent to a human being until this says yes.**

Outreach is the one feature in the platform whose failure mode is legal, not cosmetic. This module
is the enforcement layer for both lanes — the checks, the unsubscribe machinery, the per-country
policy, and the circuit breaker — built so that no send path can skip any of it.

---

## 🚨 THE ONE AUTHORITY

`crm.check_send_eligibility(medium_id, list_id, identity_id)` — a **database function**, not a
TypeScript helper.

Every send path asks it and refuses on a block: this client, aidream's send primitive, the future
sequence runner, and a one-off human 1:1. It lives in the DB precisely so that a caller in another
repo, another language, or a future service cannot route around it.

**Never reimplement one of its checks anywhere else. Add it there.** A compliance check that a
caller *can* skip will eventually be skipped (outreach handoff §7), and a TypeScript twin that
drifts from the DB is worse than no check because it looks like coverage.

It returns a **verdict, never a boolean**:

```jsonc
{
  "allowed": false,
  "lane": "cold_outreach",
  "blocks": [{ "code": "jurisdiction_prohibited",
               "message": "Germany requires permission BEFORE you write, even for business email.",
               "fix": "Remove recipients in Germany, or get their permission first." }],
  "warnings": [{ "code": "jurisdiction_inferred", "message": "Country guessed from the email domain (cctld). Confirm it." }],
  "resolved": { "jurisdiction": "DE", "confidence": "medium", "jurisdiction_verdict": "prohibited",
                "jurisdiction_ratified": false, "consent_basis": "none", "subscriber_kind": "unknown" }
}
```

**Every block carries a `fix`.** Our user is a brilliant non-technical expert; a refusal with no
next step is a dead end that ends their outreach on day one (outreach handoff §5.3b). Surfaces
render the `fix`, and `UNFIXABLE_BLOCKS` in [`types.ts`](./types.ts) says which ones have no repair
path (an unsubscribe is not ours to lift).

Client entry point: `checkSendEligibility()` in [`service.ts`](./service.ts) → the
`public.crm_check_send_eligibility` wrapper (org-membership checked).

---

## What the gate checks, in order

| # | Check | Why |
|---|---|---|
| 0 | Org kill switch (`crm.sending_policy.outreach_enabled`) | Instant per-org stop |
| 1 | Suppression — unsubscribed / complained / suppressed / DNC / hard bounce | A legal opt-out outranks everything, in every lane |
| 2 | Address verification: syntax, explicit MX, disposable-domain result, freshness | Never send to an unverified address; hard bounces burn a domain fastest |
| 2a | List integrity: real membership + purchased/bulk-scraped signals | Purchased lists are banned in both lanes, so this runs before the lane branch |
| 3a | **Lane A:** consent basis is `express` or `soft_opt_in`, not expired | Our infrastructure, our reputation — consent is the entry bar |
| 3b | **Lane B:** the recipient's country permits cold outreach | Their law, not ours |
| 3c | Role relevance, subscriber kind, GDPR art. 14 source, the LIA | The specific conditions attached to `conditional` countries |
| 4 | Sending identity: ready, domain verified, SPF+DKIM+DMARC pass, RFC 8058 DKIM-capable provider, not a role address, domain ≥30 days | The right to send |
| 5 | The sender's postal address exists | Legally required in every commercial message |
| 6 | The org accepted the AUP for that lane | Contract before first send |

---

## Jurisdiction — the part that is a legal artifact, not an engineering one

`crm.jurisdiction_policy` holds one row per country with a verdict:
`allowed` · `conditional` (conditions must be **met**, not acknowledged) · `prohibited` · `unknown`.

**The default is refusal.** A missing row or `unknown` blocks. 35 countries are seeded; **30 of
them block**, because most of the EEA is unresearched and the correct behavior for an unresearched
country is refusal, not optimism.

| Verdict | Countries |
|---|---|
| `allowed` | US |
| `conditional` | CA, GB, FR, AU |
| `prohibited` | DE, AT |
| `unknown` (blocking) | the rest of the EEA/EFTA + CH |

🚨 **Every row is `ratified_by = 'agent-research'`, which is NOT ratification.** No attorney has
signed any row. `resolved.jurisdiction_ratified` is `false` everywhere today, and any surface that
shows a country as permitted must not imply legal clearance. Counsel's answers replace these rows
one at a time — see attorney question **Q3**, which is the highest-value thing to buy.

Recipient country is resolved by `crm.resolve_recipient_jurisdiction()`:
explicit `consent_jurisdiction` (high) → a party postal address (high) → ccTLD (medium) → **null**.
A generic TLD resolves to **nothing, never a default country** — silently guessing "probably US" is
how a campaign lands in Germany.

---

## The unsubscribe machinery

Required by every regime and previously absent in every form.

- **Token** — `crm.unsubscribe_token`, 32 bytes of CSPRNG, one permanent row per
  (medium, list). **Never expires.** The raw address never appears in a URL.
  Mint with `crm.issue_unsubscribe_token()` — idempotent, so a follow-up carries the link the
  recipient already holds.
- **One-click POST** — [`app/api/unsubscribe/[token]/route.ts`](../../../app/api/unsubscribe/[token]/route.ts).
  🚨 **RFC 8058 §3.2: the unsubscribe MUST complete on this POST with no confirmation step.** A
  "click to confirm" page violates the contract and Gmail treats the header as broken — worse than
  having no header, since bulk senders are *required* to have a working one. Idempotent; always
  200 except on our own failure (5xx so the provider retries).
- **Human page** — [`app/(public)/unsubscribe/[token]/page.tsx`](../../../app/(public)/unsubscribe/[token]/page.tsx).
  Anonymous, one button, no account, no survey. It *does* require a click, which is correct: a bare
  mutating GET fires on every link scanner, the exact accident RFC 8058 exists to prevent.
  Shows a **masked** address, so a leaked token cannot become a disclosed email address.
- **The write** — `public.outreach_unsubscribe()` sets `unsubscribed_at` + `suppressed_at` on
  `crm.contact_medium`, the ONE suppression authority. It stops **every channel and every
  campaign**, not just the list the link came from, and is never time-limited.

The browser preview contract lives in `buildComplianceEnvelope()` in
[`message-compliance.ts`](./message-compliance.ts). The authoritative envelope is built again
**inside** aidream's only send primitive, where the caller cannot omit it; it carries the same exact
RFC 8058 header values, permanent body link, postal address, and first-contact art. 14 disclosure.
The Google Workspace provider is the only enabled outreach transport: a real external delivery
showed DKIM `PASS`, and its `DKIM-Signature h=` covered
`list-unsubscribe-post:list-unsubscribe`. Adding another provider is a DB-authority change only
after the same received-message proof.

Reply opt-outs use the G6 seam rather than a second inbox. Provider adapters will emit one
`InboundReply`; aidream's quoted-reply-safe detector recognizes explicit requests such as “remove
me” and “take me off your list”, then the service-role-only `crm.honor_consent_decision()`
atomically sets permanent suppression and writes one idempotent `unsubscribed` event. The detector
and write are live now; only provider reply delivery remains in G6.

**That function is THE ONE SUPPRESSION AUTHORITY, and it is channel-agnostic (2026-08-19).** It
replaced the email-only `crm.honor_reply_opt_out()`, which could only find a medium by correlating
a provider message id — so the SMS STOP path hand-wrote `crm.contact_medium` itself and a third
decider, the trigger `public.sms_handle_opt_out_keywords`, wrote `communication.sms_consent` off
its own keyword list. All three are now one function: it resolves the medium by id, by correlated
reply, or by `(organization_id, channel, value_key)` — creating the medium rather than dropping a
STOP from a number we have not met. `communication.sms_consent` is demoted to a
preference/verification record and is no longer a suppression gate.

`findUnresolvedMergeFields()` gives the browser an early warning. The authoritative rule lives in
aidream's generic `services/message_templates` renderer: **an unresolved, null, blank, empty, or
malformed variable is a refusal, never an empty string.** Phase 4 renders against the real target,
fingerprints the exact preview for approval, and renders again before the only send primitive.
"Hi ," is the most recognizable automated-spam tell there is, and it is now structurally
impossible at the send boundary.

---

## The circuit breaker

`crm.sweep_sending_health()` — host it on aidream's existing `system_task_runner`.
**Never build a second scheduler.**

**Thresholds are CAPS constants in the function, not config** (an env var is a VALUE, never a
TOGGLE):

- complaint rate **> 0.10%** → pause (Google and Yahoo both draw the line at 0.30%; a rate measured
  at the point it trips is already too late)
- bounce rate **> 3.00%** → pause
- minimum **50 sends** in the window before either rate can trip, so one complaint on a five-message
  day cannot pause a mailbox

Rates are **NULL below the minimum volume, never 0** — "no data" and "clean" are different facts,
and collapsing them is how a breaker fails silent.

**The system pauses; a human resumes.** A trip pauses the identity **and its campaigns** (pausing
the mailbox but leaving the campaign live is how a "paused" system keeps sending). Resume goes
through `public.crm_resume_sending_identity()`, org-admin only, and writes a
`crm.sending_identity_check` row recording who lifted it.

---

## Consent provenance — the thing that cannot be retrofitted

`crm.contact_medium` now carries `consent_basis`, `consent_source`, `consent_source_url`,
`consent_recorded_at`, `consent_evidence_at`, `consent_expires_at`, `consent_jurisdiction`,
`consent_evidence`, `subscriber_kind`, `source_disclosed_at`.

The vocabulary is the one **the law** uses (CASL's express/implied/EBR/inquiry/conspicuous
publication, GDPR's legitimate interest, PECR's soft opt-in), not invented categories.
`communication.sms_consent` folds into **this** vocabulary — one suppression authority means one
consent vocabulary. **Never add a second.**

Three DB constraints make unprovable consent impossible to store: a basis must name a source, a
`conspicuous_publication` basis must carry the URL, and any basis must be dated.

`consent_source_url` does triple duty: CASL conspicuous-publication evidence, Australian
inferred-consent evidence, **and** GDPR art. 14's required "source". Capture it at discovery or it
cannot be reconstructed.

---

## Files

| File | Holds |
|---|---|
| [`types.ts`](./types.ts) | Lane, consent basis, subscriber kind, the exhaustive block-code union, `UNFIXABLE_BLOCKS`, the policy version |
| [`service.ts`](./service.ts) | Eligibility check (single + batch), jurisdiction list, AUP acceptance, token minting, resume |
| [`message-compliance.ts`](./message-compliance.ts) | `buildComplianceEnvelope()` — RFC 8058 headers, footer, art. 14 block; `findUnresolvedMergeFields()` |
| `migrations/crm_06_compliance.sql` | The whole DB layer, idempotent, applied and ledger-recorded |
| `migrations/crm_07_compliance_floor.sql` | MX/disposable + purchased-list + RFC 8058-provider floor inside the authority; reply-opt-out DB seam; applied and ledger-recorded |
| `aidream/services/sending_identity/{address_verification,compliance,inbound,gate}.py` | Server DNS verification, authoritative envelope, G6 reply seam, and the only send consumer |

---

## Invariants

- **The DB function is the authority.** TypeScript mirrors it; it never replaces it.
- **A compliance check never fails open.** `checkSendEligibility()` throws on a real error rather
  than returning `allowed`.
- **Unfamiliar country = refusal.** No override exists, and none should be added — an override that
  exists will be used (handoff §7).
- **`ratified_by='agent-research'` is not legal clearance.** Do not let a surface imply it is.
- **Do not build a second suppression list, a second consent vocabulary, or a second send gate.**

## Not built here (deliberately)

- **G6 provider reply delivery.** The normalized contract, opt-out detector, and suppression write
  are complete. Gmail/Microsoft/IMAP adapters still need to deliver replies into that seam; they
  must not duplicate its legal logic.
- **Anti-harvesting-notice checks during discovery.** Purchased-list detection is already a floor
  in both lanes. G2 still needs to record a source site's notice when it discovers an address.
- **Prohibited-content classification.** The accepted AUP bans those categories; message-time
  classification remains Phase 4 work and must become another block in this same authority.

## Change log

- **2026-08-15 — compliance floor closed.** aidream now verifies syntax + live MX/null-MX +
  disposable domains and persists 30-day evidence; list-quality signals refuse declared purchased
  origins, bulk rows without provenance, role-address concentrations, and uniform patterns before
  either lane; the server-owned envelope is attached by the only send primitive; Google provider
  coverage was proven on an externally received message with DKIM `PASS` and both RFC 8058 headers
  in `h=`; and the G6 reply seam can immediately honor an explicit opt-out. Production fixtures
  proved every DB refusal and write, then were removed.
- **2026-08-15** — Created. Jurisdiction policy (35 countries, 30 blocking), consent provenance on
  `crm.contact_medium`, lane + LIA on `crm.outreach_list`, postal address on sending policy and
  identity, AUP acceptance record, the full unsubscribe machinery (token + RFC 8058 POST + human
  page), the send-eligibility gate, and the health sweep + circuit breaker. All applied live and
  verified: the gate blocks Germany, an unresolved TLD, and an unverified address; the breaker
  trips at 1% complaints and pauses the campaign with it; the unsubscribe is idempotent end to end.

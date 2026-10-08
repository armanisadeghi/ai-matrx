# FEATURE.md — `esign/envelopes`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-04`

---

## Purpose

The sender's half of e-signature (SPEC-ESIGN §6.0 point 1, the `/esign` product section): send PDFs
for signature, see who has signed, remind, resend, void, and check the finished record. Signers sign
on `features/esign/signing` (`/sign/e/<id>`, `/x/sign`). Product truth: `common-docs/systems/human-resources/projects/hr-domain/specs/SPEC-ESIGN.md`.

---

## Entry points

**Routes** (`app/(core)/esign/`, sign-in gated by its layout)
- `/esign` — `EnvelopeListPage`: the entity-list shell, lanes All | Mine, organization filter. A row opens the envelope page for whoever may manage it, the signing door for a signer who did not send it (`envelopeHref`).
- `/esign/new` — the sender editor (`features/esign/editor`, see its FEATURE.md): a server-saved draft; `?template=<id>` / `?copy=<envelopeId>` start from one.
- `/esign/[envelopeId]` — `EnvelopeRoute`: the editor while a draft, otherwise `EnvelopeDetail`: signers and progress, Sign now (when it is my turn), Remind, Send again, Void, documents (View opens the PDF in a dialog; once complete, Download signed copy opens `/files/f/<documents[].metadata.signed_copy_file_id>`, "Preparing signed copy" until it exists), the evidence history, certificate verification, Print record. Its scroll body starts below the shell header band (`paddingTop: var(--shell-header-h)`).
- Menu: Files → E-Signatures / Send for Signature (`features/shell/constants/nav-data.ts`).

**Reads** — browser → database: `public.esign_envelope_list` (lane `all|sent|to_sign`, `p_org_id`), `esign_envelope_state` (gated by `esign._may_manage(envelope,'viewer')`).

**Writes** — aidream `/esign/envelopes` (`aidream/services/esign/envelopes.py`): send, remind, resend, void, verify. The database's create/send/remind/resend/void doors are server-only with no rights check of their own; the service decides first (`esign.may_send_in`, `esign.sendable_file`, `_may_manage(...,'editor')`) and calls them with the caller's identity attached (`rls_session` on the service role).

---

## Invariants

- **Sending freezes the exact bytes.** The server reads each PDF, hashes it (sha-256), counts pages, and the signing surface checks signers against that hash.
- **A colleague signs as themself.** A signer whose email is a member of the sending organization is an `internal_user` (`/sign/e/<id>`); anyone else is an outsider (link + emailed code).
- **Verification re-hashes.** `POST /esign/envelopes/{id}/verify` re-reads the frozen bytes and passes them as `observed`; "verified" needs every document `match` and the certificate's signature.
- **Every sender notice links to `/esign/<id>` and reaches the sender's account address** (`esign._notify`); a resend always carries a fresh link (`esign.retire_signer_link`).
- The list reads at most 500 envelopes and pages them in the browser (fine at today's volumes; move paging into `esign_envelope_list` when a person has more).

---

## Change Log

- 2026-10-04 — Send page rebuilt to the DocuSign bar: the attached PDF is on screen, signers are picked from the organization's members or added as guests, Signature / Initials / Date / Name boxes are placed, moved, resized and deleted per signer in that signer's colour (contract: `fields[]` fractions of the page, `signers[].user_id` for a picked member). Envelope page: the top no longer sits under the header band; documents open in a viewer; signed copy download. PENDING: `fields` and `user_id` ride the send request once `@ai-matrx/agents` publishes them (`fieldsForSend` in `types.ts` builds the array).

- 2026-10-03 — Built: list, send, envelope page, nav; aidream `/esign/envelopes`; migrations `esign_the_sender_sees_their_envelopes`, `esign_send_for_signature_reads`, `esign_send_for_signature_lookups`, `esign_the_senders_notice_opens_the_envelope`, `esign_a_notice_to_an_account_finds_its_address`, `esign_a_resend_always_carries_a_working_link` (all applied live). Independent review fixes: real verification, signer rows open the signing door, resend link, honest void/resend text, sending organization shown. Verified in the browser on live as admin@admin.com: upload → send → sign → completed → verified; resend; outsider emails delivered to the provider's test inbox.

- 2026-10-07 — production swap: `/esign/new` and `/esign/[id]` run the v2 editor/envelope route; `SendForSignature`, `send/*`, the staging `/esign/v2/*` routes, editor mocks and the sender demo deleted; the four parity routes (draft send, detect-fields, download, finalize) call `callApi` with the published `@ai-matrx/agents` 0.54.3 types, no casts.

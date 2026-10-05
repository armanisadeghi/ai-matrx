# FEATURE.md — `esign/signing`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-04`

---

## Purpose

The one signing surface for `esign.envelope` (SPEC-ESIGN §6.0 U-03): where a person sent an
e-signature request reviews the documents, consents, signs or declines. Product truth lives in
`common-docs/systems/human-resources/projects/hr-domain/specs/SPEC-ESIGN.md`.

(Not the record store's `custom.sign_request` page at `app/(link)/sign/[token]` — that is
`features/esign/service.ts`, a different system.)

---

## Entry points

**Routes** (both in `(link)`: no shell, no marketing chrome)
- `app/(link)/sign/e/[envelopeId]/page.tsx` — a platform user's own envelope; signed-out visitors go to `/login` and come back.
- `app/(link)/x/sign/page.tsx` — an outsider; the link is `/x/sign#t=<secret>` (secret in the fragment, never sent to a server by the browser).

These are the links `esign._notify_actionable` / `esign_resend_signer` email. Change a route → change those SQL producers in the same push.

**Components**
- `SigningSurface.tsx` — the surface, given a `SigningDoor`. Review → Consent → Sign; Decline from the header.
- `OutsiderSigning.tsx` — link → "Send me the code" → code → session (kept in `sessionStorage` per tab) → surface.
- `InternalSigning.tsx` — the signed-in door.
- `SigningFields.tsx` — the sender's placed fields drawn over one PDF page (the viewer's `renderOverlay` slot), from `fieldMap.ts` (`readFieldMap`, `initialsOf`, `rotateBox`).
- `AdoptSignature.tsx` — name + Type/Draw; inline on a no-field sign step, in the adopt dialog otherwise.
- `SignedCopy.tsx` — "Download signed copy" (the `signed_copy` act) on the done step, with "not ready yet" + retry.

**Service**
- `signingService.ts` — `callApi` wrappers, `organizationFreeRead: true` (a signer picks no organization).

**API endpoints** (aidream, `aidream/services/esign/signing.py`)
- `POST /esign/signing/outsider/{open,code,verify,act}` — no sign-in.
- `POST /esign/signing/envelope/{envelope_id}/act` — signed in; runs `acting_as_user`.

---

## Invariants

- **The database decides.** Every act is `public.esign_sign_*` (signed-in) or `public.esign_signer_*` (outsider); §4.3's five conditions, scope, IP pin and uniform refusal are theirs. The page maps the returned `reason` code to one sentence (`REASON_TEXT`).
- **`observed` is the hash of the bytes on screen.** The `document` act returns the frozen bytes (base64, never a URL — media-durability law); the page renders them as a blob and SHA-256s exactly those bytes. Bytes are fetched (and the read ledgered) only when the signer opens that document's tab.
- **A document never runs code.** PDFs draw through `PdfDocumentRenderer` (pdf.js canvas — also the only way a PDF shows on Android); raster images through `<img>`; every other type (HTML, SVG, …) is a download only, as `application/octet-stream`. Never an `<iframe>` of a blob: a blob URL has our origin.
- **`preview` is recorded on render** (the viewer's first drawn page), never on fetch, never again once signed; a failed record is retried by Continue.
- **The link secret leaves the address bar on first read** (kept in this tab's `sessionStorage`), so it is not in history or in any error report's page URL.
- **The code only goes out on a press.** Opening the page sends nothing (mail-scanner safe).
- **This surface lets the server record the signer's IP** (evidence on every act); it never sends one of its own. The outsider session is NOT pinned to one address (`outsider_consumer.ip_pinned = false` for `esign.signer`, 2026-10-04): a dual-stack connection hops between IPv4 and IPv6 and the pin refused real signatures. The doors still take `p_ip` from any direct caller (filed as an observation, 2026-10-03).
- **The page is paper.** Fields, the signature preview and the send page's boxes use `PAPER` (`fieldMap.ts`), never theme tokens: the document is white in dark mode too, and `PAPER.ink` is the signed copy's own ink.
- **Signing ends on a confirmation** (`SignedDone.tsx`): what was recorded and when, the signed copy, and for an outsider an invitation to a free account; a dead session after signing never sends them back to the code step.
- **Placed fields are drawn, never typed into.** `documents[].field_map.fields` (fractions of the page, top-left origin, 1-based page) are positioned by percentage inside the viewer's overlay, so they follow zoom, width and rotation. The signer's own (`signer_id === me.id`) are highlighted and walked by "Next field"; any press before adoption opens the adopt dialog; once adopted every one of them shows its value (signature, initials from the full name, today's date, full name) before Sign. Other signers' fields are muted and inert. Adoption stays local until Sign, which sends `adopt` then `sign` exactly as a no-field document does. No fields = the old sign step, unchanged. A reopened signed document shows no boxes; the signed copy carries the marks.
- **Type or draw.** Drawing uses THE platform pad (`SignaturePad`, `@ai-matrx/records-ui`); the server checks the PNG/JPEG by its bytes and files it as evidence on the envelope (owner = sender, organization = envelope's) before the adopt door names it. Phones open on Draw; the envelope's `signature_options` can turn either off.

---

## Change Log

- 2026-10-04 — Owner's walk: paper colours for fields in dark mode, signature preview on paper, `SignedDone` confirmation with the free-account invite, other signers' finished boxes read "Signed" (`other_signers[].id`, migration `esign_a_signer_sees_which_boxes_are_already_signed.sql`), IP pin off (`esign_a_signer_is_not_locked_to_one_network_address.sql`).
- 2026-10-04 — Placed fields on the signer's page (guide, adopt dialog, filled values, other signers muted) and "Download signed copy" via the `signed_copy` act. Checked in the shared preview against a constructed load (desktop + phone width, typed + drawn).

- 2026-10-03 — Drawn signatures: Type/Draw on the sign step; aidream files the drawing (`esign.signature_owner`, migration `esign_a_drawn_signature_is_filed_on_its_envelope.sql`). Proven on live for both doors.
- 2026-10-03 — Independent review fixes: pdf.js viewer instead of an iframe (script + Android), secret stripped from the URL, refusals shown as refusals, mid-walk session loss returns to the code step, per-tab lazy fetch, retryable preview.
- 2026-10-03 — Built: both routes, the surface, the outsider code gate, aidream `/esign/signing/*`, migration `esign_signing_surface_has_its_doors.sql` (reopened the eight signed-in doors, the code email's words). Proven on live as admin@admin.com: outsider and signed-in envelopes signed to a certificate in the browser; decline and wrong-signer refusal checked.

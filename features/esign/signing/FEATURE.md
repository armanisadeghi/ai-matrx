# FEATURE.md — `esign/signing`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-03`

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

**Service**
- `signingService.ts` — `callApi` wrappers, `organizationFreeRead: true` (a signer picks no organization).

**API endpoints** (aidream, `aidream/services/esign/signing.py`)
- `POST /esign/signing/outsider/{open,code,verify,act}` — no sign-in.
- `POST /esign/signing/envelope/{envelope_id}/act` — signed in; runs `acting_as_user`.

---

## Invariants

- **The database decides.** Every act is `public.esign_sign_*` (signed-in) or `public.esign_signer_*` (outsider); §4.3's five conditions, scope, IP pin and uniform refusal are theirs. The page maps the returned `reason` code to one sentence (`REASON_TEXT`).
- **`observed` is the hash of the bytes on screen.** The `document` act returns the frozen bytes (base64, never a URL — media-durability law); the page renders them as a blob and SHA-256s exactly those bytes.
- **`preview` is recorded on render** (iframe `onLoad`), never on fetch, and never again once signed.
- **The code only goes out on a press.** Opening the page sends nothing (mail-scanner safe).
- **The server records the signer's IP** (evidence + outsider session pin); the browser never claims its own.
- Typed signatures only: `drawn` needs an uploaded image file id the surface does not collect yet.

---

## Change Log

- 2026-10-03 — Built: both routes, the surface, the outsider code gate, aidream `/esign/signing/*`, migration `esign_signing_surface_has_its_doors.sql` (reopened the eight signed-in doors, the code email's words). Proven on live as admin@admin.com: outsider and signed-in envelopes signed to a certificate in the browser; decline and wrong-signer refusal checked.

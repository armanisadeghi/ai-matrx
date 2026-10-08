# FEATURE.md — `esign/signer`

**Status:** `active` (v2; production routes swap when the server lane's wave B is on main)
**Tier:** `2`
**Last updated:** `2026-10-07`

---

## Purpose

The v2 signing page for `esign.envelope`: where a person sent a signature request reads every
page, fills every field, adopts a signature, and finishes — or declines, assigns it to someone
else, or finishes later. The bar is Docusign plus the owner's DocHub session. Program and frozen
contract: `common-docs/projects/esign-parity/` (`CONTRACT.md` §13 is this lane; §2 values, §6
doors). Product truth: SPEC-ESIGN in common-docs.

## Entry points

- `SignerSurface.tsx` — `SignerSurface({ door, onDoorClosed })`; the one surface behind every door
  (`SignerDoorApi`, `contract/signerDoor.ts`, frozen).
- `door.ts` — `createSignerDoor(dispatch, {kind: "envelope"|"outsider"})`: the doors over `callApi`.
- `InternalEntry.tsx` — a signed-in member (`/sign/e/[envelopeId]`).
- `OutsiderEntry.tsx` — an outside signer (`/x/sign#t=<secret>`): the link alone opens the document
  by default; a code step when the sender asked for one; "Continue here" after a takeover.
- The sender's preview (`features/esign/preview`, sender lane) renders `SignerSurface` with its own
  in-memory door (`seat: "preview"`).

## Key flows

1. **Consent gate over the visible document** — every document renders (that render is the preview
   evidence: `previewAck` once page 1 draws); a left panel (top sheet on a phone) names the
   sender, organization, document, page count and the sender's messages; checkbox + Continue.
2. **Guidance** — top bar "Action required — N required fields remaining" + progress bar; Start →
   first open required field; Next field (reading order, empty fields); Finish. Reaching the end
   with required work open (or Finish) enters missed-required recovery: red bar, "Next required",
   red outline per missed field. Nothing left → green bar, Finish turns green and takes focus.
3. **Fields** — `parts/PaperField.tsx` draws each on the page (paper colours from
   `contract/paper.ts`, never theme tokens): compact tags in the signer's colour, inline inputs on a
   desktop, a callout on the active field (label + star, Sign / Edit / Clear, Next field → / Skip →).
   A phone gets the bottom input drawer (`parts/ControlInput.tsx`); Form view lists every field with
   "Required field" / "Optional field" under each.
4. **Values** — `autosave.ts`: per-tab monotonic `seq`, one save in flight, edits coalesce, flush on
   blur / hide / Finish later. Sign sends the complete on-screen map (`model.ts` `screenPatch`) and
   the SHA-256 of the bytes on screen.
5. **Marks** — signature / initials open the signature-creator lane's dialog (lazy, through its
   frozen props only); later taps apply in one tap; "Fill all signature fields" when allowed.
6. **Finish** — review dialog (what is recorded, optional message to the sender, Finalize) →
   "Finalized!" screen saying who is told and what happens next, what was recorded, download /
   print / certificate, and (outsider) the free-account invitation.

## Invariants & gotchas

- The page is paper in dark mode too; "Dim the page" (default on in dark) lowers its brightness.
- An act the published api-types do not name yet answers `unknown_action` — "This step is not
  available yet." — never a silent no-op (`door.ts` `KNOWN_ACTIONS`, kept in step by `satisfies`).
- An outsider's ended session (`session_taken_over`, `session_expired`, and the v1
  `link_no_longer_valid`) becomes `SessionEnded`; `OutsiderEntry` re-opens through the link and says
  "dead" only when the link is.
- The signature creator stays open until the server holds the mark (`adopted` in
  `SignerSurface.tsx`): a slow adopt shows "Saving your signature…", a failed one says why in a toast
  and keeps the mark for Adopt again. Closing it first lost marks on a stalled act.
- Act arguments sent are exactly the published `EsignActArgs` (`door.ts` `SERVER_ARG_LIST`, checked
  both ways at type-check). A new server argument fails type-check until listed.
- A mark applied without a picture on this page (a saved signature: the adopt answer carries no
  image yet) reads "Signed"/"Initialed", never "Sign here".

## Change log

- 2026-10-07 — v2 surface, doors, entries, mock demo (esign-parity signer lane).
- 2026-10-07 — part 2: creator stays open until adopt succeeds (slow/failed acts said); act
  arguments follow the published types (save to profile now reaches the server); honest "Signed"
  face for a picture-less mark; mocks, dev demo and the retired v1 `signing/` doc deleted.

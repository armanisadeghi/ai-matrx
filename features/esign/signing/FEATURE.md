# FEATURE.md — `esign/signing` (v1, retired)

**Status:** `retired` — the signing page is `features/esign/signer/` (v2, esign-parity CONTRACT §13).
**Last updated:** `2026-10-07`

What is left here, and why:
- `AdoptSignature.tsx` — the signature-creator lane's; it deletes it once unused.

## Change log

- 2026-10-07 — production routes `/sign/e/[envelopeId]` and `/x/sign` moved to the v2 signer;
  `SigningSurface`, `OutsiderSigning`, `InternalSigning`, `SigningFields`, `SignedCopy`,
  `SignedDone`, `signingService` deleted. Earlier the same day the v1 page learned to refuse a
  v2 field map openly (`needsNewSigningPage`).
- 2026-10-07 — sender swap landed: `fieldMap.ts` (+ test) and the v1 sender canvas deleted.

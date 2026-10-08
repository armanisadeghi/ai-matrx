# E-sign signature creator

One dialog that makes a signature or initials for any signer (CONTRACT §14): Type (12 fontsource faces),
Draw, Upload, Phone (QR + "Text me a link", polled), Saved (signed-in only). Every tab ends as a
transparent paper-ink PNG (<=1600px, <=150KB, `render.ts`); phone and saved marks stay on the server and
travel by id. `SignatureCreatorDialog` is lazy; the host calls `door.adopt` with the marks it returns.

- Phone page for the second device: `app/(link)/x/sign/phone` -> `SignaturePhonePage.tsx` (no sign-in; the
  secret leaves the address bar at once). Routes: `/esign/signing/handoff/open|submit`.
- Saved list: `esign.esign_saved_signatures / _set_default / _delete`, called in the `esign` schema.
- Real-server demo: `/demos/esign-signature-creator?envelope=<id>` (mock without the param).
- Open: `services.ts` `post()` keeps one cast until `@ai-matrx/agents` publishes the handoff routes' types;
  `AdoptSignature.tsx` in `features/esign/signing/` is deleted with the old signing surface.

## Change Log
- 2026-10-07 saved doors in the esign schema (typed); initials field no longer overflows the Type tab.
- 2026-10-07 first build: dialog, five tabs, phone page, mock demo.

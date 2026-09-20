# Client portals — the outsider's screens

A client of a business ("Ada Brook Cafes") follows a link, signs in with a one-time email link,
and sees **her** jobs and **her** invoices and nothing else — on a phone first.

- Routes: `app/(portal)/portal/c/[slug]/page.tsx` (sign-in panel / her portal / "you are not on
  this portal"), `app/(portal)/portal/c/[slug]/r/[recordId]/page.tsx` (one record), its
  `actions.ts` (edit + comment), and `app/api/portal/[slug]/sign-in/route.ts` (mint and email the
  link).
- The route group is the platform's EXISTING no-grants shell: `app/(portal)/layout.tsx` renders
  `<Providers>` and nothing else. Never add a second shell, and never link this surface to
  anything org-scoped — read [`features/continued-access/FEATURE.md`](../continued-access/FEATURE.md).
- The static `c` segment sits beside the existing dynamic `[orgId]` deliberately: two dynamic
  siblings would collide.

## The four things a frontend agent must not get wrong

1. **The signed-in reads go through the PERSON'S OWN server client, never `createAdminClient()`.**
   The doors (`custom.portal_me`, `read_records`, `read_record`, `record_update`,
   `applicable_fields`, `io_comments`, `io_comment_write`) are what decide what she sees. The
   admin client bypasses exactly the thing this product is. Only the sign-in lane
   (`portal_public`, `portal_invitation`, `portal_principal_bind`) is `service_role`, and it is
   server-only.
2. **Render the portal's `visible_fields`, never the document's keys.** A masked field is *not*
   absent from `read_records`: it comes back as a NULL key beside a `_hidden` block naming it and
   saying why. Looping over the document would print `internal_margin` to a customer.
   `shown.ts` takes the intersection — the portal's list for access, `applicable_fields` for the
   label and the order — and it is the only place that decides what appears.
3. **The sign-in answer is the same sentence either way.** "If that address is on this portal, a
   sign-in link is on its way." An endpoint that answered differently is an address oracle, which
   is why `custom.portal_invitation` refuses a signed-in caller in its own body.
4. **A door's refusal is shown in the door's own words.** `custom.record_update` refuses a field
   the portal did not open with a sentence and a hint; both are carried whole to the screen.
   Never "Save failed".

## Change Log

- **2026-09-20** — Built the outsider's screens (lane W6-PORTAL): sign-in panel, portal list,
  record view with in-place edit and comments, and the magic-link route.

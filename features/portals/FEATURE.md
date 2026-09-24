# Client portals — the outsider's screens

A client of a business ("Ada Brook Cafes") follows a link, signs in with a one-time email link,
and sees **her** jobs and **her** invoices and nothing else — on a phone first.

- Routes: `app/(portal)/portal/c/[slug]/page.tsx` (sign-in panel / her portal / "you are not on
  this portal"), `app/(portal)/portal/c/[slug]/r/[recordId]/page.tsx` (one record, with its status
  line), its `actions.ts` (edit + comment), `app/(portal)/portal/c/[slug]/f/[formId]/` (one of her
  portal's forms, sent through `custom.portal_form_submit` as her), and
  `app/api/portal/[slug]/sign-in/route.ts` (mint and email the link).
- **The look (lane S6).** `look.ts` turns the store's resolved style (`custom._portal_style`: the
  portal's own name, welcome, logo, accent and footer links over the organization's brand) into
  what `PortalBrand.tsx` draws on every portal screen. Colour classes come from the pure
  `features/data-tables/table-style.ts` — never `@ai-matrx/design-system/data-table`, whose
  "use client" barrel hands a server component client references instead of strings.
- **The status line (lane S6).** `timeline.ts` + `PortalStatusTimeline.tsx`: the stages from
  `portal_me` (`table.stage`, present only when the portal shows the stage Field) and the moments
  from the EXISTING history door as her (`custom.record_history`, masked by the door).
- **Her list is hers.** `shown.ts#isHers` keeps a Table's rows to the ones whose `names_via` Field
  points at her client record, because a person who can read more (an employee who is also a
  client) would otherwise see everybody's jobs under her name. A masked `names_via` means the door
  already scoped the list.
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
- **2026-09-24** — Lane S6: the portal's own look on every screen (name, welcome, logo, accent,
  footer links), a forms list opening each form inside the portal (`f/[formId]`), a read-only
  status line per record, relation Fields never printed as ids, and lists kept to her own client.
  Walk: `scripts/campaign-tests/uichamp_s6_portal_walk.mjs` over `_s6_walk_fixture.sql` (clone).

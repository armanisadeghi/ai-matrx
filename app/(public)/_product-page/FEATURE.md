# FEATURE.md — Public product pages

**Status:** active
**Routes:** `/desktop` (Matrx Desktop), `/extend` (Matrx Extend), `/desktop/download` (Mac download redirect)
**Domain:** `public-web` (landing-pages, download, og-cards)
**Last updated:** 2026-10-05

## Purpose

Logged-out, SEO-first pages for the two client products. Server components only; the shared blocks live in `ProductPage.tsx`.

## Rules

- **Nothing unshipped is stated as shipped.** Every card carries "Available now" or "Coming soon". Source of truth for the desktop: `matrx-desktop/app/shared/rail.ts` (rows with `soon` are not shipped); for the extension: `common-docs/systems/apps/extension/STATE.md`.
- **The Mac download never holds a version.** `features/matrx-local-download/desktop-release.ts` reads the app's update feed (`latest-mac.yml`, revalidated every 10 minutes) and names the zip its `path` field points to. `/desktop/download` redirects to that file and answers 503 plainly when the feed is unreadable. It never falls back to an old file.
- **The extension link is the published Chrome Web Store item** (id in `common-docs/systems/apps/extension/CHROME-WEB-STORE.md`).
- Metadata, Open Graph and Twitter cards come from `createRouteMetadata` (the generated `/social-card` image); structured data is `SoftwareApplication` + `FAQPage` through `JsonLd`.
- Visuals are drawn with design-system components; the window and browser illustrations are labelled illustrations, not screenshots.

## Change log

- 2026-10-05 — Added `/desktop`, `/extend`, the Mac download redirect, sitemap entries, footer links and a pointer from `/download`.

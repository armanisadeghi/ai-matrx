# Social cards

**Status:** active
**Tier:** 1
**Last updated:** 2026-08-20

## Purpose

One server-safe visual system supplies large OpenGraph and Twitter preview images for AI Matrx routes. Route metadata describes the content; this feature selects and renders the branded treatment. It replaces the generic company-logo preview without creating route-specific image components.

## Entry points

- `social-card.ts` — 24 curated themes, deterministic selection, text limits, and the canonical social-card URL builder.
- `app/(public)/social-card/route.tsx` — public `1200×630` image renderer. It accepts only bounded display copy and a non-sensitive seed or theme name.
- `app/(public)/open/chat/[conversationId]` — crawler-readable notification opener. It exposes only generic preview copy, then immediately replaces the browser location with the protected conversation; its visible link is the no-JavaScript fallback.
- `utils/route-metadata.ts` — supplies social-card URLs to route metadata by default and lets a route provide an intent, eyebrow, seed, or exact theme.

## Invariants

- Preview URLs never contain private records, tool arguments, IDs presented as content, access tokens, or user-authored chat text.
- Protected destinations sent through external channels use a public opener so link crawlers can read metadata without receiving access to the destination.
- Theme selection is stable for the same seed and falls back safely for unknown theme names.
- A route with a purpose-built OpenGraph image may keep it through the existing metadata override.
- New general-purpose variants extend the shared theme registry; routes do not fork the renderer.

## Change log

- **2026-08-20** — Added the shared renderer and 24 deterministic themes; made canonical route metadata use it and added a private-safe approval-link treatment.

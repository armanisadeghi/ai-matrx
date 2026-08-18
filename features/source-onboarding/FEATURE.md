# FEATURE.md — `source-onboarding`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-17`

---

## Purpose

The reusable **provider gallery + hand-holding guide** pattern (HOUSE DOCTRINE for external-source onboarding, Arman 2026-08-17): big recognizable provider cards, each opening a dedicated public guide page that teaches a brilliant, absolutely non-technical Expert exactly how to get their data OUT of an external provider so they can bring it INTO AI Matrx. The first gallery is **ai-chats** (ChatGPT, Claude, Gemini, Grok, Meta AI, Cursor, VS Code Copilot, Claude Code, AI Matrx, Matrx Local, Other), feeding Masterwork Distillation's chat-import lane.

A gallery is **config, not code**: future galleries (meeting platforms — Google Meet/Teams/Zoom; message threads — iCloud/Google/WhatsApp) are a new `SourceGalleryConfig` + provider files, **zero new components**.

---

## Entry points

**Routes** (route group `(public)` — deliberate, see § Public on purpose)
- `app/(public)/import/ai-chats/page.tsx` — the gallery (`SourceGallery`), with SEO metadata.
- `app/(public)/import/ai-chats/[provider]/page.tsx` — one provider's guide (`SourceGuidePage`); `generateStaticParams` over the gallery's providers, per-provider `generateMetadata` ("How to export your X chat history"), `notFound()` on an unknown key.

**Components** (`features/source-onboarding/components/`)
- `SourceGallery.tsx` — the card grid + bottom CTA. Server component.
- `SourceGuidePage.tsx` — one provider's guide: numbered steps, deep links, loud trap warnings, honest delivery mechanics (mechanism / timing / link expiry), gotchas, support-level banners (`tolerant` / `coming_soon`), CTA into the authed flow.
- `ScreenshotSlot.tsx` — client component; renders `/images/source-onboarding/{providerKey}/{slot}.png` and, until the PNG exists (detected via `onError`), an illustrated faux-browser placeholder naming the step. Never a broken image.

**Config**
- `features/source-onboarding/types.ts` — the whole contract: `SourceGalleryConfig`, `SourceProviderConfig`, `GuideStep`, `ScreenshotSlotSpec`, `GuideDeepLink`.
- `features/source-onboarding/galleries/ai-chats/index.ts` — the ai-chats `SourceGalleryConfig` (CTA → `/masterwork`, "Turn them into a Rulebook").
- `features/source-onboarding/galleries/ai-chats/providers/*.ts` — one file per provider.

**No service, no Redux, no API, no DB.** This feature is pure static config + presentation; the authed work (upload/parse/distill) lives in `features/masterwork/` (client) and aidream `services/distillation/` (server — its `FEATURE.md` § chat-import lane names this feature as the onboarding surface).

---

## Who consumes it

- **`features/masterwork/components/detail/ChatImportDialog.tsx`** — the authed picker's Upload tab links "See exactly how to get it" → `/import/ai-chats` (new tab). This is the primary in-product door.
- **Anonymous search traffic** — the guides are an SEO surface (see below); their CTA (`gallery.ctaHref`) routes visitors into `/masterwork`.
- **Masterwork admin map** (`/masterwork/admin`) — both routes + the three components are declared there; this feature has no route directory of its own under `(core)`, so it deliberately has no separate `/admin` map.

## Public on purpose

`/import/ai-chats[/{provider}]` lives in `(public)` **intentionally**: "how do I export my ChatGPT/Claude/Gemini history" is a high-intent anonymous search query, and the guide pages are the landing pages for it — full metadata, static params, no auth wall. The pages sell nothing and leak nothing; the only authed thing is the CTA target. Do not move them behind auth.

---

## How to add a provider

1. Create `galleries/<gallery>/providers/<key>.ts` exporting a `SourceProviderConfig`. The `key` is the route segment AND the screenshot directory name — kebab-case, stable forever.
2. Write for the Expert: short sentences, zero jargon, honest about traps (`warning`), honest about delivery (how it arrives, how long, when the link dies — `delivery.expiry` matters most). `whatYouGet` names the literal artifact ("a .zip containing conversations.json").
3. `support`: `supported` (we parse it properly) · `tolerant` (rough/undocumented format — the guide says so, the importer forgives) · `coming_soon` (visible, not yet available; set `comingSoonNote`).
4. Cards are colored blocks + a short `mark` — **no remote logo assets**, no trademark image files.
5. Add it to the gallery's `providers` array in `galleries/<gallery>/index.ts`.
6. Any step that benefits from a picture gets a `screenshot: { slot, caption }` and a matching entry in that gallery's `SCREENSHOT_WORK_ORDERS.md` (below). Ship without the PNG — the placeholder is designed for that.

## How to add a gallery

New `galleries/<key>/index.ts` (`SourceGalleryConfig`) + provider files + a `SCREENSHOT_WORK_ORDERS.md`, then two thin route files under `app/(public)/import/<key>/` mirroring the ai-chats pair. Zero new components — if a gallery seems to need one, extend the shared ones.

## The screenshot pipeline

- **Path contract:** `public/images/source-onboarding/{providerKey}/{slot}.png`. `ScreenshotSlotSpec.slot` is the basename; the caption is the alt text AND the capture brief.
- **Work orders:** `galleries/<gallery>/SCREENSHOT_WORK_ORDERS.md` — exact target path, exact framing, redaction rules (blur every email address and chat title) per capture. The ai-chats file heads with a live capture-status table.
- **Every ai-chats capture requires a signed-in real account** (ChatGPT/Claude/Grok settings, Google Takeout, WhatsApp, Meta Accounts Center). A sandboxed/anonymous agent **cannot** fill them and must never fabricate a fake-UI image or log into an external account — captures come from a human (or an agent driving Arman's authenticated Chrome with his consent). Until then the placeholder ships.
- **Landing a capture is zero-code:** save the PNG at the contract path; the slot upgrades itself.

---

## Doctrine

- **Reuse-first:** searched for existing onboarding/guide primitives before this was built (module landings, `lib/coming-soon`, education content engine) — none render step-by-step third-party export guides; the pattern was created as the generic primitive and the ai-chats gallery is its first consumer.
- **No dead ends:** every provider card opens its guide; every deep link opens the provider's real page; every guide links back to the gallery and forward to the CTA. The placeholder names exactly what is coming — never a bare "coming soon" string (the `coming_soon` support level renders its own honest note; it is provider availability, not an unregistered product promise).
- **Simplicity:** no manifest/registry of captured screenshots — the browser's own 404 + `onError` is the existence check, and a landed PNG needs no deploy-time bookkeeping.
- **The Mismatch Rule:** these pages serve the Expert at their most novice moment (inside another company's settings UI). Every word stays plain.

## Change log

- 2026-08-17 — Feature built (types, components, ai-chats gallery, 11 providers, public routes) by the distillation session; FEATURE.md written, placeholder upgraded from a thin strip to the illustrated faux-browser frame, Meta AI JSON-format step wired to its work-ordered `dyi-json` slot, routes declared on the Masterwork admin map.

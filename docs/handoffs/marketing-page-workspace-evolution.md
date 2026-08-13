---
status: active
updated: 2026-08-12
repos: [matrx-frontend, aidream]
vision: []
---

# Marketing Page Workspace — authoring layer evolution

(Absorbed `marketing-page-studio-alignment.md` 2026-08-12 — one doc per component; the Studio field-parity backlog is § Remaining work B.)

## Vision — Arman's words

On the workspace concept (2026-07-27): "for keyword intent and then metatitle and meta description … it's really the only place where we have data where you can put in what your desired values are … For everything else, we're missing that … we almost mirror everything." "Tasks should be like a first class citizen." "For content, there needs to be a full area where you can write your content … the editor needs to essentially be what we use for our notes." "Eventually the final step will be where you push it directly to the CMS from here."

On the split (2026-07-27, names ratified 2026-07-29 as **Current | Plan | Studio**): "information on the left, and all planning, data entry, and anything the user provides or has provided on the right … At the top, we could add a toggle with three states."

On Studio as a comparison workspace (2026-08-10): "If you fold everything up, then you'd have a list of X number of items across the site, and then you could open one and sort of see the current and the plan in one." "When you fold one side and the other side doesn't fold with it, that doesn't really work well." "If we have three or four things on the left, we should really have all of those same things available on the right." "Make it where the height of the draft content is always at least the same as the page content." — Studio stays dense; each row is one concept, its two lanes stay aligned, and the plan side must offer specific, actionable controls for the evidence shown on the current side.

On link plans (2026-07-29): "For the internal links as well. We need two plans: for outbound and also inbound. So you can organize by anchors and each page can DECLARE the acceptable options and all other pages get scored on it so each page needs a place to set those."

On keywords (2026-07-29): "Autosave but make sure we make management, removal and things like that easy to do to keep them organized."

Bug-fix policy: "For any issues like these, especially clear-cut fixes, proceed and fix them without checking with me first."

## Resources

- Page: `features/marketing/components/pages/PageWorkspace.tsx` (Current/Plan lane arrays + `WorkspaceViewToggle.tsx`); cards in `components/pages/cards/`; desired primitives `components/pages/desired/`.
- Shared disclosure/card primitive: `features/marketing/components/shared/MarketingUi.tsx`.
- Desired-state model: `features/marketing/types.ts` (`PageDesiredValues`); clobber-safe writes `components/pages/desired/useDesiredValueSlice.ts`; freeform fallback `cards/PagePlanNoteCard.tsx`; draft editor `cards/PageDraftContentCard.tsx`.
- Data: `features/marketing/data/service.ts`, `data/page-keywords.ts`, `data/hooks.ts`; media core `lib/media/categorization.ts` + `features/marketing/lib/snapshot-media.ts`.
- Files/media: canonical picker `features/files/components/pickers/cloudFilesPickerOpeners.ts`; universal path `features/files/handler/`.
- CMS push: `features/marketing/lib/push-to-cms.ts` + `cards/PushToCmsCard.tsx`; contract owner is the "CMS" session (message it before changing the seam).
- DB: `web.page.desired_values` jsonb; `web.page_content`; keyword archive RPCs `seo.fn_archive_keywords`/`fn_restore_keywords`.
- Test pages (seeded): `/marketing/brands/1b97568e-0c2d-4ecb-9957-8d21f919ceb2/sites/0fdcd5ea-39f9-4273-82cc-7329fd5a4ca7/pages/22a8b6ce-19f7-4227-8a92-a763c92d64a3`; live `https://www.aimatrx.com/marketing/brands/413de36b-13fa-4c8a-aec9-54d0d9b89f9b/sites/f8e332bb-df0e-4772-9288-48b548803afe/pages/f76294ea-db6f-4a9b-8fad-07d988180381`. Login `/login` admin@admin.com / Password1234#.
- Skills: `surface-authoring`, `canonical-associations`, `ui-refine`, `no-dead-ends`, `type-safety` (desired-value model changes), `handoffs`, `finalize-and-ship`.

## Rulings (Arman, 2026-08-08 — final, do not re-ask)

- **TRUE CURRENT status law.** Any status shown for a thing inside our own system must be its live, derived state — never a one-time stamp. If the CMS page advances (draft → published → live) weeks later by someone else, the plan board must show that without anyone touching it. Stamped statuses are only acceptable for pushes to third-party systems where we lose live access. Applies platform-wide.
- **Attachment sharing.** Default stays: anyone who can see the page can READ its attached items. Edit must be easy to grant per item, and the target is a sharing UI with batch modes: "everything attached to this page" and "all items of type X across this whole site" (e.g. one click makes all notes on all pages of a site editable). Resource-type-dependent defaults are expected; don't hardcode one answer.

## Remaining work

### A. Workspace mechanics

1. **Derive plan-node status from live CMS reality** (replaces the push-time stamp). Today a successful Push to CMS writes the node's status once (`bumpPlanNodeStatusAfterPush` in `lib/push-to-cms.ts`) — a stopgap that violates the TRUE CURRENT status law above. Build the derivation instead: the plan⇄CMS pairing already exists (`useCmsPageMap`, WF-11), so map the paired CMS page's real state (has draft / published / live-verified) onto the node's displayed status, and delete the stamp once derivation lands. If the `plan_status` vocabulary needs a "cms-draft"-like value, that's expected — statuses must say exactly what is true.
2. **Attachment sharing batch modes** — per the ruling above: per-item edit grants + batch UI (per-page all-resources; per-type across a site). Platform-scoped (access-architecture); coordinate before building marketing-only.
3. **Re-crawl to fill media inventories** — existing snapshots only carry image counts; the page/site media galleries (and the `media_inventory` surface value) fill on the next crawl of each site. Operational, not code.

### B. Studio field parity — every Plan lane gets a real structured editor

All editors save through `useDesiredValueSlice` — never a second persistence path. Keep a notes field only for exceptions.

4. **Structured data.** Current shows detected schema types, raw JSON-LD, entities, page resources; Plan stores only `structured_data_notes`. Add structured desired schema types plus repeatable property/entity requirements.
5. **Performance.** Current has PageSpeed/Lighthouse (mobile + desktop, CWV, lab/field, audit opportunities), Search Console, Analytics; Plan is one `performance_goals` textarea. Add structured goal groups for all three sources with numeric targets and time horizons. Convert PageSpeed opportunities into reviewable checkbox rows that can create/associate canonical page tasks — default undecided, never silently opted in.
6. **Social card.** `PageDesiredValues.social_card` stores only `og_title`/`og_description` while Current evaluates title, description, image, site name, card type, canonical URL. Add a desired image reference ("use current" + canonical media/file selection via the cloud file picker + universal file handler — no page-only uploader), card type/site-name controls, and a preview of the desired card before save.
7. **Page identity.** Replace `identity_notes` as the primary UI with structured desired page type, author, featured image, and date/publishing policy; retain notes as a supplement.
8. **Content targets.** Add numeric/range targets for length, readability, internal/external links, media count, alt coverage (all shown in Current). Do not duplicate the existing structured link or image plans — summarize and link to those editors.
9. **Page strategy.** Mirror the Analyzer artifact: explicit audience, search intent, angle/positioning, proof/evidence, and recommendation decisions, seeded from the latest analyzer result only by an explicit user action (Plan today is only `strategy_notes`).
10. **Media planning.** Extend beyond images to reuse/replacement/removal decisions for observed social images, video, audio, embeds, documents, plus planned non-image assets. Existing-image alt overrides live under `image_alts`; preserve that path.
11. **Findings → tasks.** Per-finding "Create task"/"Attach existing task" actions (PageSpeed audit opportunities included), retaining the source finding/audit identity on the task association.
12. **Backlink planning.** Structured outreach targets/prospects, desired source/anchor, priority, owner, status (Plan today is `backlink_plan` text). Where a referring domain or backlink has a canonical identity, render it as a door.
13. **Publication.** Add desired sitemap membership, recrawl/capture cadence, and intended CMS publication state/schedule; keep Push to CMS as the execution step, not the whole plan.
14. **Parity review pass** after the structured work lands: search appearance, keywords, indexability, headings, links, image planning already have structured counterparts — verify label parity, field coverage, equal-height behavior with long/empty/error data; only add fields backed by a real desired-state contract.

## Done

- Studio unified disclosure + equal-height lanes (2026-08-10): one compact disclosure per row, nested Current/Plan toggles suppressed in Studio, comparison cards stretch to the taller lane, Draft content editor matches Page content height — see `PageWorkspace.tsx`, `MarketingUi.tsx`, `PageDraftContentCard.tsx`.
- Site Media workspace rebuilt as a five-view canvas (2026-08-08): crawled / library / research / generate / standards, asset drill-down, standards-driven AI ordering — see `features/marketing/FEATURE.md` change log. Open: headless image-gen client hang D130 (chip dispatched); media surface declaration, edit suite, video, stock sources = chips.
- Task-widget invisible-open bug root-caused and fixed (2026-08-08): a degenerate 0×0 viewport measurement made "90vw" register a 0×0 rect; geometry now derives from `safeViewportDims` + `registerWindow` clamps the initial rect (see `features/window-panels/FEATURE.md` § Silent-render guard).
- Redirect-route hardening audit (2026-08-08): `/marketing/pages/[pageId]` is the ONLY server-side `web./seo./plan.` reader under `app/(core)/marketing` — every other route is a thin shell over client components whose data services all go through `requireAuthenticatedSupabaseSession` (`utils/supabase/webDb.ts`). Verified live: anon + junk-id hits on 10 routes → landing/404, zero 500s.
- Current | Plan | Studio split with 14 paired rows (`PageWorkspace.tsx`); mixed cards split; plan notes on every unpaired row.
- Link plans (2026-07-29): page-level `LinksPlan` (accepted anchors + planned inbound/outbound, live-scored) AND site-level compliance (`SiteLinkComplianceView`, `data/site-link-compliance.ts`).
- CMS push v2 (2026-08-08): successful push bumps the linked plan.node to `in-production` (forward-only). STOPGAP — Remaining work #1 replaces this stamp with live derivation.
- Surface completeness (2026-08-08): `link_plan`, `media_inventory`, `cms_push` (+ `publication` group) declared, emitted in `marketing-page-scope.ts`, DB mirror synced (80 value rows).
- Earlier waves (media cards, keyword autosave/management + research persistence, capture observations, Push to CMS v1, desired-values layer, crawl-file access backfill) — see `features/marketing/FEATURE.md` and keyword FEATURE.md.

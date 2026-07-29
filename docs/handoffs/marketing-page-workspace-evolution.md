---
status: active
updated: 2026-07-29
repos: [matrx-frontend, aidream]
vision: []
---

# Marketing Page Workspace — authoring layer evolution

## Vision — Arman's words

On the workspace concept (2026-07-27): "for keyword intent and then metatitle and meta description … it's really the only place where we have data where you can put in what your desired values are … For everything else, we're missing that … we almost mirror everything." "Tasks should be like a first class citizen." "For content, there needs to be a full area where you can write your content … the editor needs to essentially be what we use for our notes." "Eventually the final step will be where you push it directly to the CMS from here."

On the split (2026-07-27, names ratified 2026-07-29 as **Current | Plan | Studio**): "information on the left, and all planning, data entry, and anything the user provides or has provided on the right … At the top, we could add a toggle with three states."

On link plans (2026-07-29): "For the internal links as well. We need two plans: for outbound and also inbound. So you can organize by anchors and each page can DECLARE the acceptable options and all other pages get scored on it so each page needs a place to set those."

On keywords (2026-07-29): "Autosave but make sure we make management, removal and things like that easy to do to keep them organized."

Bug-fix policy: "For any issues like these, especially clear-cut fixes, proceed and fix them without checking with me first."

## Resources

- Page: `features/marketing/components/pages/PageWorkspace.tsx` (Current/Plan lane arrays + `WorkspaceViewToggle.tsx`); cards in `components/pages/cards/`; desired primitives `components/pages/desired/`.
- Data: `features/marketing/data/service.ts`, `data/page-keywords.ts`, `data/hooks.ts`; media core `lib/media/categorization.ts` + `features/marketing/lib/snapshot-media.ts`.
- CMS push: `features/marketing/lib/push-to-cms.ts` + `cards/PushToCmsCard.tsx`; contract owner is the "CMS" session (message it before changing the seam).
- DB: `web.page.desired_values` jsonb; `web.page_content`; keyword archive RPCs `seo.fn_archive_keywords`/`fn_restore_keywords`.
- Test page (seeded): `/marketing/brands/1b97568e-0c2d-4ecb-9957-8d21f919ceb2/sites/0fdcd5ea-39f9-4273-82cc-7329fd5a4ca7/pages/22a8b6ce-19f7-4227-8a92-a763c92d64a3`. Login `/login` admin@admin.com / Password1234#.
- Skills: `surface-authoring`, `canonical-associations`, `handoffs`.

## Remaining work

1. **Inbound/outbound link plans + anchor scoring** — in flight (agent, 2026-07-29): extend the existing accepted-anchor policy (`desired_values.accepted_anchor_texts` in PageLinksCard) into two plans (planned inbound sources + planned outbound links, organized by anchors), site-level compliance scoring on `/sites/[id]/links`, and a `LinksPlan` export the workspace mounts in the Plan lane. If the agent's work is incomplete, its report in the session log has the contract.
2. **Re-crawl to fill media inventories** — after the aidream release, existing snapshots only carry image counts; the page/site media galleries fill on the next crawl of each site.
3. **CMS push v2** — bump the linked plan.node status (briefed/in-production) after a successful push; `plan_node_id` already surfaced read-only. Coordinate with the CMS session.
4. **Surface manifest for new Plan-lane values** — `media_inventory`, `push_to_cms`, and any link-plan values are rendered but not declared in `marketing-page.manifest.ts`; run the surface-authoring skill pass (COMPLETENESS LAW).
5. **Redirect-route hardening pattern**: audit other web-schema server routes for the anon/malformed-id 42501→500 class (`/marketing/pages/[pageId]` is the fixed exemplar).
6. **Task widget**: window sometimes opens invisible (pre-existing window-panels bug; loud "Show it" toast recovers — root-cause fix still open).

## Done

- Current | Plan | Studio split — see `PageWorkspace.tsx` + `WorkspaceViewToggle.tsx`; mixed cards split (`SocialCardPlan`, `IndexabilityPlan`, `HeadingsPlan`).
- Page Media card + site `/media` route — see `cards/PageMediaCard.tsx`, `components/media/`, shared core `lib/media/categorization.ts`.
- aidream scraper per-image inventory (capped 100, true totals) — committed in aidream, ships with its next release.
- Keyword research persistence — window preservation fixed; artifacts were always server-saved (`content_ir.kind_instance`).
- Keyword autosave (already existed server-side via `seo.fn_ingest_keyword_research`) + management (archive/restore RPCs, workbench bulk ops, source column, KI archive) — see keyword FEATURE.md.
- Capture observations — `components/pages/CaptureObservations.tsx` (notes + task via canonical associations).
- Push to CMS v1 — `lib/push-to-cms.ts` + `cards/PushToCmsCard.tsx`, drafts only, provenance in CMS activity log.
- Desired-values layer, draft content, keyword batch, tasks, image plan, associations grid — 2026-07-27, see FEATURE.md.
- `useFileBlob` unhandled-rejection leak fixed.

## Decisions needed

- **Crawl-file visibility.** Situation: all 7,093 `web.snapshot` markdown/body files are `visibility='personal'` owned by the crawling user, so page content 403s for every other org member; the permission classifier blocks agents from bulk visibility changes and from delegating the aidream creation-time change. Decide: approve the one-line backfill to `internal` (SQL in task #11 of the session task list) and authorize the aidream creation-time default change — or pick `public` instead.
- **Association conveyance.** Situation: page/capture pairs (note/task/file/conversation ↔ web_page/web_screenshot) registered with `viewer` conveyance to match existing patterns. Decide: keep viewer, or adjust at `/administration/relationships`.

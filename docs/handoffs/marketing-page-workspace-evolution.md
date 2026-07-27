---
status: active
updated: 2026-07-27
repos: [matrx-frontend, aidream]
vision: []
---

# Marketing Page Workspace — authoring layer evolution

## Vision — Arman's words

On the workspace concept (2026-07-27): "for keyword intent and then metatitle and meta description … it's really the only place where we have data where you can put in what your desired values are … For everything else, we're missing that. And that's a very, very important piece to add … we almost mirror everything." "Tasks should be like a first class citizen where there's even a section where you literally just start adding your tasks." "For content, there needs to be a full area where you can write your content … the editor needs to essentially be what we use for our notes." "I'd rather include more [association types] and remove them later than less." "Eventually the final step will be where you push it directly to the CMS from here."

On the UI restructure (2026-07-27): "information on the left, and all planning, data entry, and anything the user provides or has provided on the right. So everywhere on the page, the left side shows information and the right side is where things get entered. At the top, we could add a toggle with three states: view only the data, view only the planning, or view both in a split view. Come up with better names than 'data' and 'planning' … it would also help with mobile friendliness."

On keywords: "you would attach a batch of keywords to the page also, not just one. They would go along with the primary." Keyword input "has a lot of things built into it" — ride the existing keyword infrastructure.

On layout: "The top bar currently wastes about half its space on a giant date and timestamp display … only the date matters." "Show how the page is performing for the target keyword in the SERP results. Also show the AI results data we already have but aren't using." "If we have Google Search Console traffic data, it needs to be shown prominently." GSC: totals consolidated on one line + "a table breaking the data down by keyword," flexible date range ("3 months, a year, or other ranges").

On subagents: assign each pane (or a couple of related panes) to a subagent that fully rebuilds it, give it the best-fit UI skill, and give it "the authority to decide which values get promoted to top-level/surfaced display."

On image generation: two-step default (prompt-generator agent → `<image_prompt>` extraction → image model), all-in-one agent "available but not as our first option." Agents: GPT Image Prompt Generator `175cd409-cb7e-4c53-83e6-1dbf0ec24ed1` (vars intent_or_content, style; replies `<image_prompt>…</image_prompt>`), Matrx Image Ultra `bcc69216-d4fa-4e28-a090-8a7749123bc5` (var image_description, model gpt-image-2), GPT Image all-in-one `6bc1d330-40b5-49f8-8895-e5b55ec95ae9` (vars intent_or_content, style, count — expensive).

Bug-fix policy: "For any issues like these, especially clear-cut fixes, proceed and fix them without checking with me first."

## Resources

- Page: `features/marketing/components/pages/PageWorkspace.tsx`; cards in `components/pages/cards/`; shared desired primitives `components/pages/desired/` (`useDesiredValueSlice` one-key-per-card contract, `DesiredSection`, `DesiredOutlineEditor`).
- Data: `features/marketing/data/service.ts` (`updatePageDesiredValues` read-merge-write; `getPageContent`/`savePageContent`), `data/page-keywords.ts` (keyword edges), `data/hooks.ts`. GSC per-query aggregation pattern: `features/marketing/seo/keyword/data.ts` `listPageTopQueries`.
- DB: `web.page.desired_values` jsonb; `web.page_content` 1:1 draft table; pairs in `platform.association_types` (keyword edges `seo_keyword→web_page` roles primary|supporting; task edges are **entity→task** — auto-orient REJECTS reversed writes). Ensure-keyword: `seo.fn_upsert_keyword` (authenticated-granted).
- Surface: manifest `features/surfaces/manifests/marketing-page.manifest.ts` (authoring/attachments groups, `image_producer` role); scope builder `features/marketing/lib/marketing-page-scope.ts`. Skills: `surface-authoring`, `ui-dense`, `ui-sharp`, `canonical-associations`, `supabase-realtime` (if realtime is ever added).
- Image gen: `features/marketing/lib/generate-page-image.ts` (headless run pattern from `features/education/assessment/data/imageGrading.ts`).
- Test page (has seeded data — desired canonical/robots, supporting keyword, draft, linked task): `/marketing/brands/1b97568e-0c2d-4ecb-9957-8d21f919ceb2/sites/0fdcd5ea-39f9-4273-82cc-7329fd5a4ca7/pages/22a8b6ce-19f7-4227-8a92-a763c92d64a3`. Login: `/login` admin@admin.com / Password1234#. Review-queue item exists (agent.review_queue).
- Scraper prompt for aidream: `docs/handoffs/_scraper-image-inventory-prompt.md`.

## Remaining work

1. **Left/right restructure + three-state toggle (the big one).** Every card splits into an evidence half (left) and a plan/entry half (right); a page-top toggle with three states — proposed names **Evidence | Plan | Studio** (split view; Arman has NOT ratified names) — controls which half renders; small screens default to a single pane. Approach: make each card export `evidence` and `plan` nodes (most cards already separate these — DesiredSection IS the plan half), then a layout shell maps the toggle state. Persist the toggle with `useListViewPrefs`-style local pref. Do this as a pane-per-subagent fleet like the 2026-07-27 pass.
2. **aidream scraper: persist per-image inventory** into `web.snapshot.images.items` (`{src,alt,width,height,loading,title}`, cap ~100) — hand `_scraper-image-inventory-prompt.md` to the aidream agent. FE already parses+renders items when present (`parseSnapshotImages`).
3. **Surface drift follow-up:** new values added by the 2026-07-27 pane pass (per-keyword GSC breakdown, target-performance data, image style) are NOT yet declared in the manifest/scope — run a completeness sweep (`surface-authoring` skill, `pnpm check:surface-drift`, re-sync).
4. **CMS push** — the end state: push draft content/desired values from the workspace to the CMS. Not started; needs Arman's shaping.
5. **Redirect-route hardening pattern**: `/marketing/pages/[pageId]` now guards anon + malformed ids; audit other web-schema server routes for the same 42501→500 class.
6. **Task widget**: verify the "created but not linked" honesty fix live in prod (was a silent-success defect); window sometimes opens invisible (pre-existing window-panels bug; loud "Show it" toast recovers — root-cause fix still open).

## Done

- Desired-values layer (`desired_values` jsonb + per-card editors), draft content (`web.page_content` + card), keyword batch (edges + board card), first-class tasks (cards + buttons), image plan card, associations grid + per-capture attach — see `features/marketing/components/pages/` and FEATURE.md change log 2026-07-27. Shipped v0.4.149/150, prod-verified.
- Association readers honor `global_readable` system orgs (`iam.org_readable`) — keyword edges were invisible to all clients before.
- 2026-07-27 pane fleet (top bar compaction + GSC rebuild w/ keyword breakdown + flexible ranges, target-keyword performance card, two-step image pipeline, image-inventory readiness, task-link honesty) — see git log of that date.

## Decisions needed

- **Toggle state names.** Situation: the three-state view toggle needs canonical names; agent proposal is Evidence | Plan | Studio (alt: Observed | Intent | Both). Decide: pick the trio (they become surface/UI vocabulary everywhere).
- **Association conveyance.** Situation: the new page/capture pairs (note/task/file/conversation/working_document ↔ web_page/web_screenshot) were registered with `viewer` conveyance to match existing patterns. Decide: keep viewer, or raise/lower any pair at `/administration/relationships`.
- **assoc-reader tier widening.** Situation: read RPCs now include global-readable system-org edges for everyone (was membership-only; keyword edges were invisible). Decide: confirm keep (recommended) or revert.

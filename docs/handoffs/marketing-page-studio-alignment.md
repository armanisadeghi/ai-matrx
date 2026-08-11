---
status: active
updated: 2026-08-10
repos: [matrx-frontend]
---

# Marketing page Studio alignment

## Vision — Arman's words

> “If you fold everything up, then you'd have a list of X number of items across the site, and then you could open one and sort of see the current and the plan in one.”

> “When you fold one side and the other side doesn't fold with it, that doesn't really work well.”

> “If we have three or four things on the left, we should really have all of those same things available on the right.”

> “Make it where the height of the draft content is always at least the same as the page content.”

The page should remain dense and preserve the current Current / Plan / Studio mental model. Studio is a comparison workspace: each row is one concept, its two lanes stay aligned, and its plan side must offer specific, actionable controls for the evidence shown on the current side.

## Resources

- Workspace composition: `features/marketing/components/pages/PageWorkspace.tsx`
- Shared disclosure/card primitive: `features/marketing/components/shared/MarketingUi.tsx`
- Desired-state model: `features/marketing/types.ts` (`PageDesiredValues`)
- Clobber-safe desired-state writes: `features/marketing/components/pages/desired/useDesiredValueSlice.ts`
- Freeform fallback: `features/marketing/components/pages/cards/PagePlanNoteCard.tsx`
- Draft editor: `features/marketing/components/pages/cards/PageDraftContentCard.tsx`
- Canonical file picker: `features/files/components/pickers/cloudFilesPickerOpeners.ts`
- Universal file/media path: `features/files/handler/`
- Test page: `https://www.aimatrx.com/marketing/brands/413de36b-13fa-4c8a-aec9-54d0d9b89f9b/sites/f8e332bb-df0e-4772-9288-48b548803afe/pages/f76294ea-db6f-4a9b-8fad-07d988180381`
- Skills: `ui-refine`, `no-dead-ends`, `type-safety` for desired-value model changes, `finalize-and-ship`

## Remaining work

1. **Structured data needs a real desired-state editor.** Current shows detected schema types, raw JSON-LD, entities, and page resources; Plan stores only `structured_data_notes`. Add structured desired schema types plus repeatable property/entity requirements. Keep a notes field only for exceptions. The editor must save through `useDesiredValueSlice`; do not add a second persistence path.

2. **Performance needs one-to-one goals and an actionable PageSpeed worklist.** Current contains PageSpeed/Lighthouse (mobile and desktop scores, Core Web Vitals, lab/field metrics and audit opportunities), Search Console, and Google Analytics. Plan is one `performance_goals` textarea. Add structured goal groups for all three sources, including numeric targets and time horizons. Convert PageSpeed opportunities into reviewable checkbox rows that can create or associate canonical page tasks; default them to undecided, never silently opted in.

3. **Social-card planning is missing the image and other observed fields.** Current evaluates title, description, image, site name, card type, and canonical URL; `PageDesiredValues.social_card` stores only `og_title` and `og_description`. Add a desired image reference with both “use current” and canonical media/file selection, plus card type/site-name controls where applicable. Reuse the cloud file picker and universal file handler; do not build a page-only uploader. Preview the desired card before save.

4. **Page identity is structured evidence paired with freeform notes.** Current exposes featured image/provenance, CMS/generator, page type, author, and publication/modified dates. Replace `identity_notes` as the primary UI with structured desired page type, author, featured image, and date/publishing policy; retain notes as a supplement.

5. **Content targets need fields for the metrics Current actually shows.** Current shows word count, sentence count, Flesch reading ease, link counts, image/alt coverage, and capture date; Plan has only `additional_content_notes`. Add numeric/range targets for length, readability, internal/external links, media count, and alt coverage. Do not duplicate the existing structured link or image plans; summarize and link to those editors.

6. **Page strategy should mirror the Analyzer artifact.** Current Analyzer produces a structured inferred primary keyword, supported/discovered keywords, positioning evidence, and recommendations; Plan is only `strategy_notes`. Add explicit audience, search intent, angle/positioning, proof/evidence, and recommendation decisions, seeded from the latest analyzer result only by an explicit user action.

7. **Media planning covers images but not the full observed inventory.** Current also lists social images, video, audio, embeds, and documents. Extend the plan to cover reuse/replacement/removal decisions for observed media and planned non-image assets. Existing-image alt overrides already live under `image_alts`; preserve that path.

8. **Findings and checks do not map cleanly into planned work.** Current lists findings and runnable blocked-check remediations; Plan lists tasks, but findings lack a direct one-click task conversion and PageSpeed audit opportunities are not task candidates. Add per-finding “Create task”/“Attach existing task” actions and retain the source finding/audit identity on the task association.

9. **Backlink planning is freeform while Current is structured.** Current has referring domains, authority/risk signals, anchors, and individual backlinks; Plan has `backlink_plan` text. Add structured outreach targets/prospects, desired source/anchor, priority, owner, and status. Where a referring domain or backlink has a canonical identity, render it as a door.

10. **Publication pairs observation history with only a CMS push action.** Current shows sitemap memberships and captures; Plan offers Push to CMS. Add desired sitemap membership, recrawl/capture cadence, and intended CMS publication state/schedule, then keep Push to CMS as the execution step rather than the whole plan.

11. **Review the otherwise-close pairs after the structured work lands.** Search appearance, keywords, indexability, headings, links, and image planning already have structured counterparts. Verify label parity, field coverage, and equal-height behavior with long/empty/error data; only add fields backed by a real desired-state contract.

## Done

- Studio rows now have one compact unified disclosure; nested Current/Plan card toggles are suppressed in Studio while remaining available in single-lane views — see `PageWorkspace.tsx` and `MarketingUi.tsx`.
- Studio comparison cards stretch to the taller lane, and Draft content's editor expands to the observed Page content height — see `PageDraftContentCard.tsx`.

---
status: blocked
updated: 2026-07-25
repos: [matrx-frontend, aidream]
vision: []   # given in-session; captured verbatim below
---

# Research context bundles — curate what an agent reads

Every research resource is selectable, priceable and runnable. Shipped and
working; the remaining work is one blocked decision plus a reusable-primitive
extraction Arman asked for.

## Vision — Arman's words

The core ask:
> "we need to allow the user to curate whatever information they want to provide
> their agent … offer a list of everything In a simple ui that allows the user to
> check what they want and then have the system give them some ideas of the
> amount of content it's going to be so they know the approximate length of text
> and/or tokens but then allow them to save that setting and then run it for
> their custom agent. And we'll do the same for our agents."

> "The parts I want to focus on is how to get everything in a way that we can
> intelligently pass it around and pass it to agents, as needed."

On context vs direct data — **the blocked decision**:
> "we can very easily add context values to any request by simply just passing
> them as contacts values. the server side handles everything else. But in this
> case, it would have to be the actual data that we pass. And since our data is
> kind of big, that is the only thing that might be an issue. So you have to see
> if the reference system is just as easy and dynamic so that you can include
> them as context but references to them, which I know is already built, but I
> just don't know if all of these items will qualify for that."

> "If you add things to context, then the agent only sees them if it wants to
> see them."

On the window panel — extract it:
> "the window pannel is possibly the most useful ui component I've seen anyone
> make! … We need to use this everywhere for anytime we have text content to
> show!"

On snippets (implemented):
> "scrapes are often … things that don't work because of many different reasons.
> Some of the best quality sites don't release their data. However, we have rich
> snippets from our search that we do … Technically, a URL along with the age and
> the snippet is probably enough in most cases … we need to create something that
> is always included that is a highly condensed format"

On per-page caps (implemented):
> "things only get scraped if they have super high authority. So you're never
> gonna have that many scraped pages to hit a max of twenty five, and what you
> really want is a max per scrape … if you have one scrape that got a massive
> result, it doesn't eat up the entire context."

Standing rules he restated: **do not rename things that already have names**, and
**"scraped" is banned in this module — use "read"**.

## Resources

- Feature doc: [`features/research/FEATURE.md`](../../features/research/FEATURE.md)
  § "Resource catalog → context bundles → agents" — invariants live there.
- Core: `features/research/resources/{catalog,manifest,selector,resolve,render,types}.ts`
- UI: `features/research/components/resources/`, `features/research/hooks/useContextBuilder.ts`
- Window: `features/window-panels/windows/research/ResearchContextPreviewWindow.tsx`
  + opener `features/overlays/openers/researchContextPreviewWindow.tsx`
- Estimator: `lib/tokens/estimate.ts` (divisors are MEASURED — see its header)
- DB: `public.research_topic_resource_manifest(uuid)` RPC ·
  `research.rs_context_bundle` (7 system rows, keyed by `slug`)
- Agents: 6 `agent.definition` rows tagged `context-bundle`, category `research`
- Skills to invoke: `window-panel-authoring` (window work), `code-splitting`
  (before any `dynamic()`), `type-safety`, `supabase-realtime` if adding channels
- Test route: `/research/topics/0d59c395-8c19-43df-90df-8ca384f3edc3/context?bundle=research-brand-profile`
  (topic owned by `admin@admin.com`; form-login at `/login`, `Password1234#`).
  **Sessions go stale** — if every topic sub-route 404s (including untouched
  ones like `/sources`), the JWT expired; re-login rather than debugging routes.

## Remaining work

1. **Context vs direct delivery** — blocked, see Decisions. The resolver already
   produces the exact text either path needs; this is wiring plus a
   `delivery: "direct" | "context"` field on `BundleBinding`
   (`features/research/resources/types.ts`).
2. **Extract the preview window as a generic primitive.** Arman wants it for any
   text content. Lift the content of `ResearchContextPreviewWindow.tsx` into a
   reusable "named text sections" window: `{ sections: {key,label,text}[] }` +
   Everything view + Rendered/Raw/Split + `ContentActionBar`. Research becomes
   its first consumer. `WindowPanel` itself is untouched — it was already the
   platform's shell.
3. **Rename the `scraped_pages` agent variable** → e.g. `page_content`.
   Coordinated change: 6 agent `variable_definitions` + the 7 bundle `bindings`
   + `defaultVariable` in `catalog.ts`. Left alone deliberately because it is a
   live contract; renaming half of it breaks every shipped agent.
4. **Finish the "scraped" → "read" sweep** in user-facing copy this work did not
   own: `components/keywords/KeywordManager.tsx`,
   `components/overview/PipelineNextSteps.tsx`, `components/media/MediaGallery.tsx`,
   `components/links/LinkExplorer.tsx`.
5. **Consolidate the snippet normalizer.** `catalog.ts` carries a private
   `readSnippets`/`capSnippets` because
   `features/research/utils/condensedAuthorityExport.ts` does not compile at HEAD
   (FOUND_DEFECTS **D104**). Fix D104, then delete the private copy.
6. **Visual re-verification of the last round** (condensed Sources render,
   per-page cap control, aligned preview labels). Unit tests + type-check + lint
   are green; the browser pass was blocked by the stale session above.
7. **Server-side resolution (aidream)** — scheduled/background runs cannot use
   bundles until aidream implements the SAME selector semantics over the Matrx
   ORM against the same `rs_context_bundle` rows. The TS↔Python parity law is
   recorded in `FEATURE.md`; a second, divergent shape is a defect.
8. **Multimodal media.** `media.items` passes URLs + alt text only; the model
   never sees pixels. Register it in `lib/coming-soon/registry.ts` or build it.
9. **`page.images` vs `media.items` overlap** — Media is the curated subset of
   the raw extracted images (verified: 35 curated from 59 raw on one topic). Both
   are offered with honest labels; consider collapsing to one.

**Blocked externally:** nothing here reaches production until the repo-wide build
OOM (FOUND_DEFECTS **D103**) is resolved — owned by another session, which
deleted the offending admin routes and added a `check:turbopack-fs` guard.

## Done

- Manifest RPC + `rs_context_bundle` + RLS — see `migrations/research_resource_manifest.sql`, `migrations/research_context_bundle.sql` (applied, ledgered).
- Catalog / selector / resolver core — see `features/research/resources/`.
- Context Builder route + picker + budget meter — see `app/(core)/research/topics/[topicId]/context/`.
- 7 system bundles + 6 domain agents (brand profile, reputation ×2, gap analysis, literature review, competitive landscape) — see `migrations/research_system_context_bundles.sql`.
- Publishing outputs read the report through `research-report-only`; verified identical row + length on all 17 topics that have a report.
- Runs go through `launchAgent` + `flexible-panel` (proper streaming, thinking, tool cards, message actions) — see `ContextBuilder.tsx`.
- Token estimator corrected against a measured run (316,200 chars → 105,969 billed tokens) — see `lib/tokens/estimate.ts`.
- Condensed Sources render, per-page `maxCharsPerItem`, block metadata stripped of site/authority/rank/importance, preview labels aligned to the page.
- 67 tests in `features/research/__tests__/` pin selectors, budget, the `"first"` binding strategy and the estimator floor.

## Decisions needed

**Situation.** Everything currently reaches the agent as a *variable* — injected,
always read. Arman wants the option to attach things as *context* instead, so the
agent sees them only if it wants. Two mechanisms exist in the platform and they
behave very differently. The API schema exposes `ContextItemBinding`, which binds
a variable to a **scope context item** (`context.context_items` +
`resolve_full_context`) — persistent scope state, not a per-request payload.
Separately, the **reference** system is real but does not cover these items:
`research_topic` and `research_template` are `reference_pickable`, while every
individual resource (`research_source`, `research_content`, `research_analysis`,
`research_synthesis`, `research_document`, `research_media`) is a component with
`reference_pickable: false` — and `migrations/entity_types_component_not_pickable.sql`
shows components were made non-pickable on purpose.

**Decide.** Which does "pass them as context values" mean?
(a) A per-request field on the agent call carrying the actual text — if so, name
the field, because it is not in the generated API types.
(b) Writing scope context items, so the values persist and resolve through the
scopes system.
(c) Make individual research resources referenceable — flip `reference_pickable`
on those component types and add a `content_role` + resolver per type. This is a
platform-level change to a deliberate decision, so it needs your call, not an
agent's.

# FEATURE.md — `search` (Matrx Search)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-08-23`

---

## Purpose

The platform's public search engine at `/search`: one box, and the web comes
back as the `web_search_results` kind family rendered through its registered
kind components. It exists because Arman (2026-08-21), on seeing the Stage B
search-kinds demo, ruled *"I want to make this our official public search
engine that we can make available for now."*

**The rendering is not ours.** This feature owns the box, the URL contract, and
the waiting/empty/error states. Every result on screen is drawn by the
canonical kind components — the same ones a chat turn, a workflow node, or a
document uses. Re-implementing any of it here would be the defect this whole
program exists to prevent.

---

## Entry points

**Routes**
- `app/(core)/search/layout.tsx` — the auth branch. Guests get
  `SearchLanding` (marketing); signed-in visitors fall through to the engine.
  Also carries the route metadata.
- `app/(core)/search/page.tsx` — reads `?q=` server-side, injects the compact
  search box into the shell header, renders `SearchWorkspace`.

**Components**
- `components/SearchWorkspace.tsx` — the surface: hero empty state, results,
  waiting, error. Mounts the `matrx-user/search` `SurfaceRuntimeProvider`.
- `components/SearchBox.tsx` — the ONE input, in `hero` and `compact` sizes.
- `components/SearchResultsSkeleton.tsx` — the waiting state, shaped like the
  answer.

**Hooks**
- `useKindSearch(query, provider, count)` (`hooks/useKindSearch.ts`) — runs the
  query that is in the URL; aborts the in-flight request when it changes.

**Services**
- `service.ts` → `runKindSearch(...)` — the ONE client path to a search:
  `POST /search-kinds/search` on aidream via `useBackendApi`.

**Backend endpoint**
- `POST /search-kinds/search` (aidream) — `aidream/services/search_kinds/`.
  Auth-required, provider allow-listed, per-user rate limited (see that
  feature's `FEATURE.md` § The public door).

**Redux slice(s)**
- None. The URL is the state.

---

## Data model

**Database tables** — none. Searches are not persisted (deliberate: no search
history product decision has been made; adding one is Arman's call, not a
side effect of building the box).

**Key types**
- `SearchProvider`, `SearchOutcome`, `SearchPhase`, `SearchTranslationReport`
  (`types.ts`) — none of them re-declare the kind, which is owned by the
  registry.

**Surface**
- `matrx-user/search` (`features/surfaces/manifests/search.manifest.ts`),
  registered live with 19 values; emitter is `SearchWorkspace`.

---

## Key flows

**1. A search**
Trigger: submit in `SearchBox`, or a `/search?q=…` link, or back/forward.
`SearchBox` → `router.push(buildSearchHref(q))` → the server page re-reads
`?q=` → `SearchWorkspace` → `useKindSearch` → `runKindSearch` →
`POST /search-kinds/search` → NDJSON → one `search_kinds_result` event →
`KindInstanceRender kind="web_search_results"` → the production render route →
`WebSearchResultsBlock` → nested kind delegation per item.
Exit: results on screen, `phase === "done"`.

**2. A guest arrives (including on someone's shared search link)**
`layout.tsx` → `getServerAuth()` → not authenticated → `SearchLanding` inside
`MarketingPageShell`. No login wall, no error. The landing's sign-in link
carries `/search` as the destination, so signing in lands them on the search
they were sent.

**3. It fails**
Any throw in the stream (including the server's 429) becomes `phase: "error"`
with the server's `user_message`, plus one action: Try again, which re-runs the
same query through the `attempt` nonce.

---

## Invariants & gotchas

- **The URL is the state.** Any new option (provider, count, locale) becomes a
  param in `search-url.ts` and a reader beside it — never component state, or
  the link a user shares stops matching what they saw.
- **Never render a result by hand.** A section that looks wrong is fixed in its
  kind component (`components/mardown-display/blocks/search-kinds/`), where
  every other surface gets the fix too.
- **Provenance rides the kind.** The collection component prints the service
  that answered. Do not add a second provider badge here.
- **Provider choice is a SERVER decision.** The client asks for `brave`; the
  `search.public_providers` knob is the authority. There is no provider picker
  on this surface on purpose — see the access model in
  `common-docs/operations/search-kinds-pilot.md`.
- **A refused search does not clear the previous one** — `outcome` is cleared
  only when a new query starts, so the error state never blanks the page a user
  was reading.

---

## Related features

- Depends on: `features/content-ir` (the render route),
  `components/mardown-display/blocks/search-kinds` (the components),
  `features/surfaces` (the manifest + runtime provider),
  `features/auth/components/module-landing` (the landing shell).
- Cross-links: `aidream/services/search_kinds/FEATURE.md` ·
  `common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md` §10c ·
  `common-docs/operations/search-kinds-pilot.md`.

---

## Doctrine compliance

**Primitives reused**
- Components: `KindInstanceRender`, `WebSearchResultsBlock` and the whole
  search-kind family, `Button`, `Input`, `Skeleton`, `PageHeader`,
  `MarketingPageShell`, `ModuleLanding`.
- Hooks: `useBackendApi`, `useRouter`/`useTransition`.
- Services: `consumeStream` (`lib/api/stream-parser`), `getServerAuth`,
  `createRouteMetadata`, `SurfaceRuntimeProvider`.

**Primitives introduced**
- `useKindSearch` (`hooks/useKindSearch.ts`) — Why a new hook: nothing existing
  runs a URL-driven, abortable search stream. Considered extending: the demo's
  inline `run()`. Rejected because: it was component-local state with no URL
  contract and no abort.
- `SearchBox` (`components/SearchBox.tsx`) — Why a new component: this is the
  product's search input, and it writes to the URL. Considered extending: the
  various list-page search inputs. Rejected because: those filter a loaded list
  in place; this one navigates.

---

## Change log

- `2026-08-23` — Claude Opus 5: Built the feature. Promoted the Stage B demo
  (`/demos/search-kinds`, left in place as the proof artifact) to the public
  `/search` surface: guest landing, `?q=` URL contract, shell-header box,
  shaped waiting state, honest empty/error states, `matrx-user/search`
  registered. Access model: signed-in users, Brave only, knob-driven per-user
  rate limits (filed for Arman in the pilot note).

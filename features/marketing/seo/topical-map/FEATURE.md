# Topical map — local mechanics

The brand's tree of subjects, and the plan for getting its website there. Product truth,
rulings and build units live in `common-docs` (`inbox/topical-map-app-requirements.md`,
`operations/for-arman/2026-09-16/topical-map-placement.md`); this file is only what an agent
touching THIS code must not get wrong.

## Where it lives

The map is the **Content section's home**: `/marketing/[brandId]/content` and the identical
`/content/map`. One map's workspace is `/content/map/[mapId]`, whose six screens are **routes,
not tabs** — outline (the index), `table`, `graph`, `text`, `pages`, `history`. The flat id door
is `/marketing/topical-maps/[mapId]` (and `/topics/[topicId]` for one topic).

⚠️ `/content` was a `permanentRedirect` (HTTP 308) into the content plan until 2026-09-17, and
browsers cache a 308 forever. **Every in-app link points at `/content/map`**
(`marketingRoutes.brandTopicalMapHome`) so a stale cached redirect is never exercised.

## The layers

| File | What it owns |
|---|---|
| `data.ts` / `types.ts` | The 49 typed wrappers over `seo.*`. Already existed; do not fork them. |
| `errors.ts` | `withTopicalMapErrors` + `TopicalMapError`. |
| `hooks.ts` | ONE hook per wrapper in `data.ts`, TanStack query/mutation. |
| `redux/slice.ts` | One workspace per map id: tree, selection, expansion, view, filters, intents, optimistic edits. |
| `redux/selectors.ts` | `selectVisibleMapTopics` and friends — what every view consumes. |
| `knobs.ts` | All 27 `seo.topical_map` knobs, typed. Enum unions are DERIVED, never retyped (see Knobs). |
| `map-author.ts` | The wire for `POST /seo/brands/{brand_id}/map/author`: the six source kinds, the request body, `map_topic_proposal_v1` and the result. No screen words. |
| `useAuthorTopicalMap.ts` | That endpoint as a DURABLE SEO command — stream, rejoin, verbatim errors. |
| `components/` | The U1 harness screens. U2–U6 replace each body, never the read or the selector. |

## Four things that are easy to get wrong

1. **Absent is not zero.** Every optional field on a topic mirrors a `map_tree` `include` key.
   A tree loaded without `counts` has no `pages` — printing `pages ?? 0` is a confident lie.
   `selectMapLoadedIncludes` / `selectMapTopicCounts.loaded` are how a view tells them apart.
2. **Selection and expansion belong to the slice, never to a component.** Views are routes, so
   a view switch unmounts the body. Anything the user chose that lives in component state dies
   with it. This is U1's done-criterion and the reason the slice exists.
3. **RPC messages reach the person unaltered.** The `seo.*` functions write their refusals FOR
   the caller (22023 argument rules, 23514 attachment policies, 42501 `<fn>_denied`, P0002
   unknown slug). `TopicalMapError.displayMessage` is the function's own sentence;
   `.message` stays the calm generic one for anywhere that must not leak a code. Never reword,
   never swallow — `withTopicalMapErrors` also captures every failure for the Error Inspector
   (`source: "topical-map-rpc"`).
4. **Slugs are the key, ids are addresses.** Topics are addressed by slug everywhere the map
   reasons; the id door exists only to translate a platform UUID back into one.

## Round 22 — a page never vanishes, and a dead topic is never a destination

Migration `seo_topical_map_22_a_page_never_vanishes` (live 2026-09-17, ledger `7d5d82ea834f…`)
changed **meanings, not signatures**. Nothing in `data.ts` moved; several things it returns now
mean something else.

- **A `covers` edge into a topic that is not live is not coverage.** `map_diagnostics.pages_on_no_topic`
  and its sample now count pages with no live coverage **of this map** — rejected and retired
  topics, and other maps' topics, no longer hide a page. The number can RISE when somebody
  rejects a proposal; that is the truth arriving.
- **`current_topics: []` is a real, expected state.** `list_page_intents` lists any page with a
  `covers`/`intent` edge to a topic of this map at ANY status, so a page is never lost with its
  topic; `current_topics` reads live topics only.
- **`intent.topic` is OPTIONAL.** The intent survives its topic being hidden — the decision is
  still true — but the key is omitted while the topic is not live. **Narrow before use.**
- **A retired or rejected topic is never a destination.** `set_page_intents`, `move_map_topic`,
  `merge_map_topics` and every `merge_into:<slug>` policy answer the same `P0002` an invented
  slug gets; `set_page_map_topics` returns the slug in `unknown_slugs`, byte-identical to an
  invented one. Nothing distinguishes the two cases, on purpose.

**What a view uses.** `pageTopicState(view)` in `redux/selectors.ts` answers where ONE page
stands — `in_place` · `leaving` · `arriving` · `on_no_topic` · `intent_topic_hidden`. The first
three are the `intent_colors` knob's own keys (§5); the last two have no colour entry and take
§5's `missing` gray-dashed treatment. `selectPagesOnNoTopic(mapId)` is the client-side twin of
`pages_on_no_topic` over the pages this workspace has listed — the slice stores an EMPTY
coverage array rather than skipping it, so "covers nothing" can never be confused with "never
listed". `pageIntentTone(view, topicSlug)` is unchanged and answers a different question: how
one TOPIC's row should draw one page.

The test is `redux/pageTopicState.test.ts`, run against **recorded server bytes**
(`redux/__fixtures__/listPageIntentsRound22.ts`) — planted and read inside one rolled-back
transaction on the live database, the way the shipped door contract does it. A hand-made
fixture would only prove the selector agrees with whoever wrote it.

## Round 23 — a person's edge is never overwritten by a robot's

Migration `20260918100000_seo_topical_map_23_a_persons_edge_is_never_overwritten` (live
2026-09-18) added precedence to `set_page_map_topics`, `set_pages_map_topics` and
`set_page_intents`: **human > agent > mapper**. A write from a lower source never
overwrites, deletes or replaces an edge a higher source already holds for that
page — it is reported back as **kept**, not silently dropped and not treated as
a failure.

- **`setPagesMapTopics` / `SetPagesMapTopicsSuccess.kept_existing`** — a page's
  own row can now carry `kept_existing: [{slug, kept_existing: <source>}]`
  naming the pairs a higher source held and left untouched. See
  {@link KeptTopicCoverage} in `types.ts`.
- **`setPageIntents` / `SetPageIntentsResult.kept`** — the batch result gains a
  `kept` count; a kept row is `{ok: true, page_id, url?, kept_existing: {source, state}}`
  (see {@link KeptIntent}). An intent already `accepted`/`done` is never
  replaced by a non-human write either, whoever wrote it originally.
- **Kept means settled, not failed.** Any caller that summarizes a bulk write
  (toast, report) must show a kept item honestly — "kept, a person already
  decided this page" — and must never count it toward `failed`, never retry
  it, and never claim it was written. No screen in this feature does that
  summarizing today (map-author / hooks consumers are still placeholder); the
  rule binds the first one that does.

## Knobs

`platform.feature_knob`, feature `seo.topical_map`, 27 keys, all overridable by organization,
brand, site and user. A missing row RAISES by design — there is no code fallback, and
`useTopicalMapKnobs` returns `knobs: null` with the error rather than a guessed default.

🚨 **An enum knob's vocabulary is NEVER retyped here.** Every union comes from
`features/settings/universal/knobEnumVocabularies.generated.ts`, which is the live
`allowed_values` of each row (`pnpm generate:knob-enum-vocabularies`; staleness guard
`pnpm check:knob-enum-vocabularies`, with `:self-test`). Until 2026-09-17 they were hand-written
and three had drifted — `proposal_mode`, `description_regeneration_mode`, and `bulk_action_confirm`
missing `never`. Only the defaults overlapped, so nothing looked broken; the moment an admin
picked a value the settings picker legitimately offers, the reader threw and **every map screen
went blank**. An unknown value now degrades: it is captured for the Error Inspector
(`source: "feature-knob-vocabulary"`, carrying the knob address and the offending value) and the
reader falls back to that row's own `default_value`.

## Change log

- **2026-09-17** — Round 22 reflected in the data layer: `intent.topic` optional,
  `pageTopicState` / `selectPagesOnNoTopic` added with a recorded-payload test, and the `/pages`
  list now names the no-topic and hidden-destination states instead of printing blanks. Added
  `map-author.ts` + `useAuthorTopicalMap` for `POST /seo/brands/{brand_id}/map/author` (no
  screen — U4's). Enum knob vocabularies are now derived from the live rows and degrade instead
  of raising.
- **2026-09-17** — U1 (slice, 50 hooks, selectors, knobs, verbatim error surfacing) and the
  route scaffold shipped, with the eleven placement registrations except the topic detail
  window and peek, which wait on U3's panel body.

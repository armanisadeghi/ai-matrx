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
| `knobs.ts` | All 27 `seo.topical_map` knobs, typed. |
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

## Knobs

`platform.feature_knob`, feature `seo.topical_map`, 27 keys, all overridable by organization,
brand, site and user. A missing row RAISES by design — there is no code fallback, and
`useTopicalMapKnobs` returns `knobs: null` with the error rather than a guessed default.

## Change log

- **2026-09-17** — U1 (slice, 50 hooks, selectors, knobs, verbatim error surfacing) and the
  route scaffold shipped, with the eleven placement registrations except the topic detail
  window and peek, which wait on U3's panel body.

# Feature intelligence

The page and the icon people use to manage the AI jobs of the part of the app they are in
(UI-REGISTER "Feature intelligence pages", Arman 2026-09-25). Cross-repo SoR:
`/Users/armanisadeghi/code/common-docs/systems/intelligence/mandates/UI-REGISTER.md`.

## Routes
| Route | File |
|---|---|
| `/intelligence` — every feature with its job and place counts (nav: Intelligence → By feature) | `app/(core)/intelligence/page.tsx` → `IntelligenceIndex.tsx` |
| `/intelligence/[feature]` (`?mandate=<key>` focuses; other params fill place links; an extra prefix like `seo` redirects to its owner `marketing`) | `app/(core)/intelligence/[feature]/page.tsx` |
| `/research/topics/[topicId]/intelligence` | `app/(core)/research/topics/[topicId]/intelligence/page.tsx` → `features/research/components/intelligence/TopicIntelligencePage.tsx` |

`featureIntelligenceHref(feature, { mandateKey, context })` (`hrefs.ts`) is the one href builder.

## Map
- `FeatureIntelligence.tsx` — page body, feature-agnostic. Props: `feature`, `context`, `focusMandateKey`, `runOverrides`, `showTitle`. Seat: person, or organization when the viewer administers the active (non-personal) organization.
- `service.ts` — one definition read over all the feature's prefixes, then ONE `public.mnd_member_list` read per lane (holder-neutral: agent or workflow) filtered to the exact visible keys (`select` filter) — never one per prefix. The server pushes that exact-key filter into the row builder (`mandate._member_list_rows(…, p_keys)`, `migrations/mnd_member_list_key_pushdown_2026_09_25.sql`): marketing's read went 2.07 s → 0.52 s. The page reads once, for a settled seat (after the org bootstrap; the role only gates the organization level) — it used to read three times on load.
- `IntelligenceJobCard.tsx` — one job: effective holder and system → organization → person ladder, can use (`useMandateInputSurface`), makes, runs in, actions.
- `useIntelligenceActions.ts` — Duplicate & modify copies the deciding holder snapshot, including pinned agent/workflow versions, then binds and verifies the copy at the viewer's rung before opening it. The deciding rung's map and settings follow the copy. Use my own uses `HolderAssignment` in `UseOwnDialog.tsx`; Reset removes the viewer's binding and reveals the inherited choice. All writes use `putMandateBinding`/`removeMandateBinding`.
- `registry.ts` — `DECLARED_FEATURES` (every feature's places map), `featurePrefixes` (a feature may own extra key prefixes: podcast+`podcast_client`, marketing+`seo`, research+`research_client`), `featureForKey`, `canonicalFeature`.
- `places.ts` + `PlacesMap.tsx` — where each job runs. Sources: DECLARED feature maps (every map is listed in `registry.ts`, 45 features as of 2026-09-25) and REGISTERED screens (`ui.ui_surface_agent_role` ⋈ `ui.ui_surface`, read by key prefix in parallel with the jobs and kept to the jobs the viewer can see). Workflow Studio places (aidream `apps/workflow-studio`) carry `app: "workflow-studio"` plus `calls`/`server`; the guard reads them from the sibling checkout (`AIDREAM_DIR`, UNMEASURED when absent) and follows each call to the server file that routes it and names the job. Unnamed jobs read "Not recorded yet" — the honest state for jobs that run only in the background, the Chrome extension or the desktop app.
- `IntelligenceIndicator.tsx` — the icon. `mandateKeys` explicit, or omitted to list what the page registered via `useDeclaredSurfaceMandates` for `feature`. `MandateDoorLink` (every feature header door) now renders it, so each door lands on the feature's intelligence page. Placed beside: research topic header, flashcards "Generate", chat quick starts, formula editor, quiz / mind map / memory aid creation titles, SEO finding fixer, War Room master agent, podcast idea helper, the Meetings header (the meeting stage is the `@ai-matrx/meet` package's). With no keys and nothing registered yet, the popover lists the feature's jobs from its places map. The Workflow Studio has its own door (aidream `src/components/layout/intelligence-door.tsx`, side nav) linking to `/intelligence/workflow?workflowId=…`. The header Agents menu (`SurfaceMandatesSection`) links each feature on the page to its intelligence page.

## Adding a feature's places
Write `<feature>/…/intelligence-places.ts` (a `FeaturePlaces`: places with `sources`, plus `roots` to scan and `aliases` for key maps/constants the code reads jobs through) beside the code that runs the jobs, and list it in `registry.ts`. `__tests__/declared-places.test.ts` proves it: every place job is named in its sources, every source names one, and every component under `roots` that names a job is mapped. Keep the map's imports light — it loads with every Intelligence icon (never import a hook module for an alias; name the key instead).

## Landmines
- The member list names `holderId` for workflows as the workflow definition id; agent pins come from the ladder (`fetchMandateLadder`) at duplicate time.
- A pinned workflow copy duplicates the selected workflow version; an unpinned workflow copy duplicates the live definition.
- An organization-level copy is created by the admin; members can use it only if they can open it (the server's answer is shown).
- The research topic's own per-role choice (`rs_topic.agent_config`) runs ahead of every ladder rung for that topic. The page shows it as a separate layer — always, including a pin that names the agent the mandate picks today (the server collapses it now, but it takes over the moment the mandate choice changes, so "Use my own" and "Duplicate & modify" remove it after binding). A successful replacement is bound and verified before the topic choice is removed with a guarded JSON merge; a rejected replacement leaves that topic choice in place. A confirmed missing, inactive, or archived topic agent is shown as needing attention and duplication copies the inherited mandate holder. A pending or failed lookup still copies the recorded topic agent ID; failure leaves the topic choice intact.
- The Intelligence icon is an owner-approved exception to "disclosure adds no visible content" (Arman 2026-09-25); it is a management door, not a disclosure roster.

## Change Log
- 2026-09-25 — round 3: Workflow Studio places (7 places, 17 jobs) proved against the studio's call sites; studio door; member-list key pushdown (2.07 s → 0.52 s) and one read per load; Meetings header icon; empty doors fall back to the places map.
- 2026-09-25 — round 2: 30 more features declare places (Masterwork, workflow runs, Growth Loop, RAG, PDF, vision interview, hindsight, meetings…); indicators beside their AI controls; Masterwork header doors carry `rulebookId`; `MandateDoorLink` takes `context`; `RouteHeader` actions no longer shrink (a phone title crushed the door to 8px); member-list and definition reads batched.
- 2026-09-25 — rollout: 13 more features declare places (one generic guard); `/intelligence` index + nav "By feature"; multi-prefix features; every `MandateDoorLink` and `/mandates?feature=` door lands here; a topic pin to the resolved agent now shows as "This topic: Same agent" instead of disappearing.
- 2026-09-25 — verified against code: exact holder copy and binding verification, precedence ladder, guarded topic choice removal.
- 2026-09-25 — created: page, generic + research routes, icon, places maps (flashcards, research), header-menu door.

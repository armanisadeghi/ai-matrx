# Feature intelligence

The page and the icon people use to manage the AI jobs of the part of the app they are in
(UI-REGISTER "Feature intelligence pages", Arman 2026-09-25). Cross-repo SoR:
`/Users/armanisadeghi/code/common-docs/systems/intelligence/mandates/UI-REGISTER.md`.

## Routes
| Route | File |
|---|---|
| `/intelligence/[feature]` (`?mandate=<key>` focuses; other params fill place links) | `app/(core)/intelligence/[feature]/page.tsx` |
| `/research/topics/[topicId]/intelligence` | `app/(core)/research/topics/[topicId]/intelligence/page.tsx` → `features/research/components/intelligence/TopicIntelligencePage.tsx` |

`featureIntelligenceHref(feature, { mandateKey, context })` (`hrefs.ts`) is the one href builder.

## Map
- `FeatureIntelligence.tsx` — page body, feature-agnostic. Props: `feature`, `context`, `focusMandateKey`, `runOverrides`, `showTitle`. Seat: person, or organization when the viewer administers the active (non-personal) organization.
- `service.ts` — complete paged rows from `public.mnd_member_list` (holder-neutral: agent or workflow), scopes system+mine+orgs (person) / system+orgs (organization), narrowed by key prefix; output kind from a complete definition read.
- `IntelligenceJobCard.tsx` — one job: effective holder and system → organization → person ladder, can use (`useMandateInputSurface`), makes, runs in, actions.
- `useIntelligenceActions.ts` — Duplicate & modify copies the deciding holder snapshot, including pinned agent/workflow versions, then binds and verifies the copy at the viewer's rung before opening it. The deciding rung's map and settings follow the copy. Use my own uses `HolderAssignment` in `UseOwnDialog.tsx`; Reset removes the viewer's binding and reveals the inherited choice. All writes use `putMandateBinding`/`removeMandateBinding`.
- `places.ts` + `PlacesMap.tsx` — where each job runs. Sources: DECLARED feature maps (`features/flashcards/data/intelligence-places.ts`, `features/research/components/intelligence/places.ts`, each proved by its own test) and REGISTERED screens (`ui.ui_surface_agent_role` ⋈ `ui.ui_surface`). Unnamed jobs read "Not recorded yet".
- `IntelligenceIndicator.tsx` — the icon. `mandateKeys` explicit, or omitted to list what the page registered via `useDeclaredSurfaceMandates` for `feature`. Placed: research topic header, flashcards "Generate". The header Agents menu (`SurfaceMandatesSection`) links each feature on the page to its intelligence page.

## Adding a feature's places
Write `<feature>/…/intelligence-places.ts` (a `FeaturePlaces`) beside the code that runs the jobs, add a test that reads those files, and list it in `places.ts` `DECLARED`.

## Landmines
- The member list names `holderId` for workflows as the workflow definition id; agent pins come from the ladder (`fetchMandateLadder`) at duplicate time.
- A pinned workflow copy duplicates the selected workflow version; an unpinned workflow copy duplicates the live definition.
- An organization-level copy is created by the admin; members can use it only if they can open it (the server's answer is shown).
- The research topic's own per-role choice (`rs_topic.agent_config`) runs ahead of every ladder rung for that topic. The page shows it as a separate layer — always, including a pin that names the agent the mandate picks today (the server collapses it now, but it takes over the moment the mandate choice changes, so "Use my own" and "Duplicate & modify" remove it after binding). A successful replacement is bound and verified before the topic choice is removed with a guarded JSON merge; a rejected replacement leaves that topic choice in place. A confirmed missing, inactive, or archived topic agent is shown as needing attention and duplication copies the inherited mandate holder. A pending or failed lookup still copies the recorded topic agent ID; failure leaves the topic choice intact.
- The Intelligence icon is an owner-approved exception to "disclosure adds no visible content" (Arman 2026-09-25); it is a management door, not a disclosure roster.

## Change Log
- 2026-09-25 — verified against code: exact holder copy and binding verification, precedence ladder, guarded topic choice removal.
- 2026-09-25 — created: page, generic + research routes, icon, places maps (flashcards, research), header-menu door.

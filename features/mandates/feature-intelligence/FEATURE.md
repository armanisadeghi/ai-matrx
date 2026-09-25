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
- `service.ts` — rows from `public.mnd_member_list` (holder-neutral: agent or workflow), scopes system+mine+shared+orgs (person) / system+orgs (organization), narrowed by key prefix; output kind from the definition.
- `IntelligenceJobCard.tsx` — one job: runs now (+ who chose it), can use (`useMandateInputSurface` — served, never derived), makes, runs in, actions.
- `useIntelligenceActions.ts` — Duplicate & modify (agent via `useCopyMandateAgent`, workflow via `duplicateWorkflow`; the copy is bound at the seat's rung with the deciding rung's map + settings), Use my own (`HolderAssignment` in `UseOwnDialog.tsx`), Reset (`removeMandateBinding`). All writes through `putMandateBinding`/`removeMandateBinding`.
- `places.ts` + `PlacesMap.tsx` — where each job runs. Sources: DECLARED feature maps (`features/flashcards/data/intelligence-places.ts`, `features/research/components/intelligence/places.ts`, each proved by its own test) and REGISTERED screens (`ui.ui_surface_agent_role` ⋈ `ui.ui_surface`). Unnamed jobs read "Not recorded yet".
- `IntelligenceIndicator.tsx` — the icon. `mandateKeys` explicit, or omitted to list what the page registered via `useDeclaredSurfaceMandates` for `feature`. Placed: research topic header, flashcards "Generate". The header Agents menu (`SurfaceMandatesSection`) links each feature on the page to its intelligence page.

## Adding a feature's places
Write `<feature>/…/intelligence-places.ts` (a `FeaturePlaces`) beside the code that runs the jobs, add a test that reads those files, and list it in `places.ts` `DECLARED`.

## Landmines
- The member list names `holderId` for workflows as the workflow definition id; agent pins come from the ladder (`fetchMandateLadder`) at duplicate time.
- A workflow copy duplicates the live definition, even when the running rung pins a workflow version.
- An organization-level copy is created by the admin; members can use it only if they can open it (the server's answer is shown).
- The research topic's own per-role choice (`rs_topic.agent_config`) runs ahead of every ladder rung for that topic; the page shows it on the job row and links to the Agents page that manages it.
- The Intelligence icon is an owner-approved exception to "disclosure adds no visible content" (Arman 2026-09-25); it is a management door, not a disclosure roster.

## Change Log
- 2026-09-25 — created: page, generic + research routes, icon, places maps (flashcards, research), header-menu door.

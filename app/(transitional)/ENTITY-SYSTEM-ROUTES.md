# Entity System Routes — Tracking Document

**Purpose:** Track every route that loads the entity system via `EntityPack`. The entity system is expensive (~134 Redux slices + full schema cache). It is loaded on-demand ONLY for these routes. All other authenticated routes boot with an empty shell and never fetch entity data.

**Goal:** Eliminate entity dependency from each route over time, eventually removing the entity system entirely.

**How it works:** The authenticated layout passes an empty `UnifiedSchemaCache` shell to `SchemaProvider` and uses `LiteStoreProvider` (no entities, no sagas). Routes listed below wrap their children in `<EntityPack>`, which triggers an on-demand fetch to `/api/schema`, injects entity reducers via `replaceReducer()`, and provides a nested `SchemaProvider` with real data.

---

## Routes with EntityPack

| Route | Layout file | Reason | Date added |
|-------|------------|--------|------------|
| `/entity-crud/**` | `app/(authenticated)/entity-crud/layout.tsx` | Core entity CRUD UI — EntityDirectory, EntityRecordServerWrapper, useQuickReference | 2026-03-23 |
| `/entities/**` | `app/(authenticated)/entities/layout.tsx` | Entity admin — EntityDirectory, ArmaniLayout in EntityPageClient | 2026-03-23 |
| `/workflow-entity/**` | `app/(authenticated)/workflow-entity/layout.tsx` | Entity-backed workflow — ArmaniLayout | 2026-03-23 |
| `/chat/**` | `app/(authenticated)/chat/ChatLayoutClient.tsx` | Chat uses createChatSelectors, getChatActionsWithThunks for conversation/message entity state | 2026-03-23 |
| `/admin/**` | `app/(authenticated)/admin/layout.tsx` | Entity Testing Lab, Entity Browser tabs — useEntity, useQuickReference, createEntitySelectors | 2026-03-23 |
| `/tests/**` | `app/(authenticated)/tests/layout.tsx` | Multiple entity test pages — MergedEntityLayout, SingleEntityLayout, useEntity, entity JSON builders | 2026-03-23 |
| `/demo/**` | `app/(authenticated)/demo/layout.tsx` | Many-to-many UI demos, entity select demos — useCreateManyToMany, entity options | 2026-03-23 |
| `/workflows/**` | `app/(authenticated)/workflows/WorkflowsLayoutClient.tsx` | useCombinedFunctionsWithArgs → useRegisteredFunctionWithFetch → useEntityWithFetch → useEntitySelectors → getEntitySlice | 2026-04-25 |

---

## Routes confirmed NOT using entities (do NOT add EntityPack)

These routes have no entity imports and must stay lightweight:

- `/tasks` — No entity imports
- `/notes` — No entity imports
- `/files/*` — No entity imports
- `/flashcard`, `/flash-cards/*` — No entity imports
- `/prompt-apps/*` — No entity imports
- `/ai/prompts/*` — No entity imports
- `/workflows-new/*` — Separate workflow-nodes slice, not entity system (note: `/workflows` DOES use entity system — see table above)
- `/apps/*`, `/apps/app-builder/*` — No entity imports
- `/sandbox` — No entity imports
- `/image-editing` — No entity imports
- `/messages/*` — Uses cx-conversation slice, not entity system
- `/org/*` — No entity imports
- `/projects/*` — No entity imports

---

## Providers moved into EntityPack (removed from global Providers.tsx)

These providers depend on the entity system and now only render inside entity routes:

| Provider | Reason | Date moved |
|----------|--------|------------|
| `EntityProvider` | Entity context — wraps entity hooks/components | 2026-03-23 |
| `ChipMenuProvider` | Uses `useProviderChips` -> `useRelationshipDirectCreate` -> `useEntityTools` | 2026-03-23 |
| `EditorProvider` | Uses `useProviderChips` which calls entity hooks internally | 2026-03-23 |

## Key files in the entity lazy-loading system

- `utils/schema/schema-processing/emptyGlobalCache.ts` — Empty shell passed at startup
- `providers/packs/EntityPack.tsx` — Wrapper combining EntitySystemProvider + SchemaProvider + EntityProvider + ChipMenuProvider + EditorProvider
- `providers/EntitySystemProvider.tsx` — Triggers on-demand loading, shows loading/error UI
- `lib/redux/entity/useEntitySystem.ts` — Fetches /api/schema, calls injectEntityReducers
- `lib/redux/entity/injectEntityReducers.ts` — replaceReducer() to add entities + globalCache + entityFields to the running store
- `lib/redux/slices/entitySystemSlice.ts` — Tracks initialized/loading/error status in Redux
- `app/api/schema/route.ts` — Server endpoint returning full UnifiedSchemaCache as JSON
- `lib/redux/store.ts` — Main store, now boots light (no entities, no entity sagas)
- `lib/redux/rootReducer.ts` — Root reducer without entity slices (injected on-demand via replaceReducer)

---

*Last updated: 2026-04-25*
*Reference audit: docs/entities-slice-route-audit.md*

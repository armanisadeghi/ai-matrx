# Knowledge (RAG) feature — local mechanics

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/knowledge/rag/STATE.md — read it before touching this feature in ANY repo.

What Knowledge is, what retrieval does, the ACL model, the schema, what is pending and every
ruling live there. The Library **sharing spine** (grants, industries, curators, the catalog and
the SUBSCRIBE law) is `/Users/armanisadeghi/code/common-docs/systems/platform/library/STATE.md`.
The cross-feature launch campaign is `/Users/armanisadeghi/code/common-docs/projects/knowledge-system/README.md`.

This file is only what an agent editing `features/rag/` must obey.

## Routes owned here

`/knowledge/library` (+ `[id]/preview`, `/knowledge/viewer/[id]`) · `/knowledge/data-stores` ·
`/knowledge/repositories` · `/knowledge/search` · `/knowledge/embeddings` ·
`/knowledge/library-catalog` · `/knowledge/library-curate`. `/rag/*` is the retained compatibility
family. 🚨 **`/knowledge` itself is NOT this feature** — it renders `features/knowledge`'s
marketing showcase, while `RagHomePage` sits on `/rag`. Do not "fix" either side without the
ruling tracked in the node's HANDOFF §3.

## Rules that bite

- **`?repo=<id>` is THE deep link to a `code.code_repositories` record**, and
  `/knowledge/repositories` is the ONLY surface over that table. Changing the param means changing
  this page, `entityRegistry.code_repository.hrefFor`, `utils/permissions/registry.ts`, the live
  `platform.shareable_resource_registry` row, and the committed snapshot **in one commit**. A
  deep-linked repository missing from `fn_list_repositories` must say so — never render an
  unhighlighted list that looks like the link worked.
- **Never wire `ShareButton` / `useSharing` / `iam.permissions` for data stores.** Library
  publishing is the ownership-asymmetry model — use `LibraryPublishPanel`. `data_store` sits in
  `shareable_resource_registry` only so reachability recognizes it as a conveying container.
- **Never build a second pack editor.** `features/admin/shared-knowledge/packs/PackDetail` is
  reused verbatim by `/knowledge/library-curate`; it already branches on `can_author` / `is_admin`.
  Add no gate here.
- **`takeMode()` in `useLibraryResources.ts` is the single place the subscribe-vs-use decision
  lives.** A `data_store` subscribes (read in place); an `seo_starter_pack` is used on a site. Never
  offer a fake subscribe.
- **Do not restore FE calls to the `/knowledge/data-stores/{id}/grants` or `/knowledge/library-catalog`
  HTTP endpoints.** The FE goes direct to Supabase through `public.library_publish` /
  `library_revoke` / `library_list_grants` (migration `0162`). Those endpoints exist for
  non-Supabase clients only.
- **Grant-conveyed rows are deliberately barred from every file tree, search and picker**
  (`files_listing_owner_grant_only.sql`). A grant reader finds granted content ONLY through the
  catalog surfaces.
- **Grounding fails closed.** `api/grounding.ts` returns `retrieved|empty|failed`; an empty corpus
  inventory must never fall back to global search, and a nonempty nearest-neighbour list is never
  by itself evidence of support. `rerank_status: low_confidence` is `empty`; missing/failed
  relevance verification is `failed`.
- **Per-file RAG status stays in `features/files/`** (`redux/knowledge-thunks.ts`,
  `RagStatusCell.tsx`, `RagFilterPicker.tsx`) — it mutates the `cloudFiles` slice. Moving it here
  would split that slice across two features.
- **Imports inside `features/rag/` are absolute (`@/features/rag/...`).** No new `../` relative
  imports across sub-areas. Cross-sub-area imports inside `components/` are fine.
- This feature has **no Redux slice**; it composes auth + cloudFiles state via existing selectors.

## Layout

```
features/rag/
├── api/          document.ts · ingest.ts · search.ts · stages.ts · derivations.ts · grounding.ts
├── hooks/        useDataStores · useDocument · useFileIngest · useKnowledgeAssetRunner ·
│                 useLibrary · useProcessingRunner · useRagSearch · useStageAction ·
│                 useStagesStatus · useLibraryGrants · useLibraryCatalog · useLibraryResources ·
│                 useMyCuratorships
├── types/        library.ts · data-stores.ts · data-stores-ext.ts · documents.ts
├── animations/   standalone HTML prototypes for the 6-stage pipeline
└── components/   RagHomePage · RepositoriesPage · ProcessForRagButton
    ├── library/            (own README — the job runner and its traps)
    ├── library-catalog/    LibraryCatalogPage
    ├── library-curate/     LibraryCuratePage
    ├── data-stores/        DataStoresPage · DataStoreBindPanel · RichMemberTable · CldFilePicker
    ├── documents/          DocumentViewer + 4 panes + LineageBreadcrumbs
    ├── search/             RagSearchExperience (4-tab Search Lab) · RagSearchHits
    └── agent-context/      buildRagSearchContextData.ts
```

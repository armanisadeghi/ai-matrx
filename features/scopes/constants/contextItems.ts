// features/scopes/constants/contextItems.ts

/**
 * The pseudo scope-type id under which SYSTEM Context Items are cached on the
 * tree's catalogs (`scopesTree.contextItemsByTypeId`).
 *
 * System Context is the platform's third context source (what is simply TRUE)
 * and has NO scope dimension — its items live in `context.system_context_item`,
 * not on a scope type. They are cached under this sentinel so every catalog
 * consumer (the picker, `selectItemsByType`, `selectItemsLoadedForType`) works
 * unchanged. A binding to one of these carries `scope_type_id: null` — never
 * this sentinel, which is a client-side cache key only.
 */
export const SYSTEM_ITEMS_KEY = "__system__";

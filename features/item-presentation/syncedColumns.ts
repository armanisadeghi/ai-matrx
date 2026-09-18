/**
 * THE SYNCED-ROW VOCABULARY, DERIVED FROM THE GENERATED TYPES — NOT A LIST
 * SOMEBODY REMEMBERED TO WRITE.
 *
 * WHY THIS FILE EXISTS. `sourceHealth.ts` — the ONE producer of the Detail
 * health strip — finds a synced row's provider, its product, its external
 * identity, its connection, its freshness and its address at the provider by
 * TRYING CANDIDATE COLUMN NAMES in order. Those lists live HERE, beside the
 * derivation that proves each name is real. Lane F-51 found
 * that one of those lists (`ACCOUNT_COLUMNS`) held three spellings NO table in
 * `types/database.types.ts` carries, so the producer found nothing on every real
 * row and silently ranked the accounts instead. The census for lane F-54 showed
 * the same fiction in every sibling list: of the seventeen names the six lists
 * carried, EIGHT matched no column on any table that carries `sync_status`
 * (`sync_provider`, `capability_key`, `product_key`, `external_message_id`,
 * `last_refreshed_at`, `web_url`, plus `source_provider` and `provider_id`,
 * which live only on tables that are not synced at all). The strip worked only
 * because each synced table happened to carry one of the surviving names.
 *
 * WHAT THIS FIXES, AS A CLASS. `SyncedRoleColumn` below is COMPUTED from
 * `Database`: the union of every column name on every table whose `Row` declares
 * `sync_status`, plus the columns a registration PROJECTS onto its row (declared
 * with the reason, `PROJECTED_ROLE_COLUMNS`). Each candidate list below is
 * `satisfies readonly SyncedRoleColumn[]`, so a name that
 * matches nothing live is a TYPE ERROR naming the name — the fiction cannot be
 * written down any more, and nothing here has to be maintained by hand when a
 * synced table is added.
 *
 * THE OTHER DIRECTION — a synced table that carries a column for a role no list
 * names — cannot be seen from a type, because "this column plays the freshness
 * role" is a naming convention, not a shape. `ROLE_COLUMN_SHAPE` writes that
 * convention down once and
 * `__tests__/every-candidate-column-is-a-live-column.test.ts` walks the
 * generated types against it, so a new synced table's role column fails a gate
 * until someone either lists it or records why the strip does not read it.
 */

import type { Database } from "@/types/database.types";

/** Schemas in the generated `Database` that actually declare tables. */
type SchemaWithTables = {
  [K in keyof Database]: Database[K] extends { Tables: unknown } ? K : never;
}[keyof Database];

type TablesOf<S extends SchemaWithTables> = Database[S] extends { Tables: infer T }
  ? T
  : never;

type RowOf<S extends SchemaWithTables, T extends keyof TablesOf<S>> =
  TablesOf<S>[T] extends { Row: infer R } ? R : never;

/**
 * Every column name on every table whose `Row` declares `sync_status` — the
 * platform's synced tables, read straight off the generated truth. Today that
 * derives to `code.code_repositories`, `commerce.cloud_sync_connection`,
 * `communication.calendar_event`, `web.youtube_video` and
 * `workbench.google_document`; tomorrow it derives to whatever
 * `pnpm db-types` says, with no edit here.
 */
export type SyncedTableColumn = {
  [S in SchemaWithTables]: {
    [T in keyof TablesOf<S>]: "sync_status" extends keyof RowOf<S, T>
      ? keyof RowOf<S, T> & string
      : never;
  }[keyof TablesOf<S>];
}[SchemaWithTables];

/**
 * Columns that are NOT in any table and are still real on the row the strip
 * reads, because the registration puts them there — with the reason, because a
 * projection is exactly how a fiction survives a census. Both entries are the
 * SAME column and the same reason: a product key is registration knowledge, not
 * a fact about a row, and no synced table has a column for it.
 *
 * `workbench.google_document` also projects `provider: "google"` (the table is
 * Google's by construction and does not repeat it), but that name needs no entry
 * here — `communication.calendar_event` carries `provider` live, so the
 * derivation already knows it.
 */
export const PROJECTED_ROLE_COLUMNS = Object.freeze({
  provider_product:
    "Projected by `googleDocumentDetailRow` and `calendarEventDetailRow` onto the " +
    "row they hand the Detail primitive: which connector product keeps a record " +
    "fresh is what the REGISTRATION knows, and no synced table carries a column " +
    "for it.",
} as const);

/**
 * A name a candidate list in `sourceHealth.ts` is allowed to carry.
 *
 * 🚨 `PROJECTED_ROLE_COLUMNS` is `as const` ON PURPOSE. Typed
 * `Readonly<Record<string, string>>` its `keyof` is `string`, which makes this
 * union `string` and every `satisfies` below a no-op — the guard would have
 * passed a planted fiction in this lane's own red test (F-54 hit exactly that).
 * `__tests__/every-candidate-column-is-a-live-column.test.ts` keeps proving the
 * union is still narrow.
 */
export type SyncedRoleColumn = SyncedTableColumn | keyof typeof PROJECTED_ROLE_COLUMNS;

/**
 * The naming convention behind each role the strip reads, so the guard can ask
 * the reverse question: does a synced table carry a column that plays this role
 * and that no candidate list names? Deliberately tight — `meeting_url` is a
 * conference link and `thumbnail_url` is an image, neither is where the record
 * lives at the provider, so the source-url shape does not match them.
 */
export const ROLE_COLUMN_SHAPE: Readonly<Record<string, RegExp>> = Object.freeze({
  PROVIDER_COLUMNS: /^(provider|source_provider|sync_provider)$/,
  PRODUCT_COLUMNS: /^(provider_product|capability_key|product_key)$/,
  EXTERNAL_ID_COLUMNS: /^(external_id|external_[a-z_]+_id|provider_id)$/,
  ACCOUNT_COLUMNS: /^(synced_via_connection_id|connection_id|account_id|refreshed_via_account)$/,
  REFRESHED_COLUMNS: /^(synced_at|last_synced_at|refreshed_at|last_refreshed_at|external_(modified|updated)_at)$/,
  SOURCE_URL_COLUMNS: /^(web_url|external_url|source_url|html_link|provider_url)$/,
});

/**
 * Role-shaped columns on a synced table that the strip deliberately does NOT
 * read, each with the reason. One entry, and it is a real escalation rather than
 * a shrug: reading `communication.calendar_event.external_updated_at` as a
 * freshness would CHANGE what a person sees on an event whose `synced_at` is
 * null (today the strip reports the connected account's last recorded call), and
 * lane F-54's brief says a behaviour change is escalated, never chosen. Named
 * here so the guard stays green on today's truth and the next agent inherits the
 * open question instead of re-discovering it.
 */
export const UNREAD_ROLE_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  "communication.calendar_event.external_updated_at":
    "Google's own last-modified time for the event, NOT when we refreshed it. " +
    "`synced_at` is the refresh and the strip reads that. Adding this name to " +
    "REFRESHED_COLUMNS would change what an event with no `synced_at` shows " +
    "(the account's last recorded call today), so it is an escalation for the " +
    "chair, not a choice this producer makes — see FEATURE.md, F-54.",
});

/**
 * The column a row names its provider in. `communication.calendar_event` carries
 * it live; `workbench.google_document` projects it (the table IS Google's).
 * F-54's census retired `source_provider` (live only on `seo.keyword_market`,
 * which is not synced) and `sync_provider` (no table anywhere).
 */
export const PROVIDER_COLUMNS = ["provider"] as const satisfies readonly SyncedRoleColumn[];
/**
 * The column a row names the connector product in. NO synced table has one — both
 * Google registrations PROJECT it, which is why `syncedColumns.ts` declares it
 * with that reason. F-54 retired `capability_key` and `product_key`: neither is a
 * column on any table in the database.
 */
export const PRODUCT_COLUMNS = ["provider_product"] as const satisfies readonly SyncedRoleColumn[];
/**
 * The column that proves the row is a mirror of something we do not own. All
 * three synced tables that mirror a provider record spell it `external_id`. F-54
 * retired `external_message_id` (no table anywhere) and `provider_id` (a
 * foreign key on seven tables, none of them synced — reading it would have made
 * an AI-model row look like a mirror of Google).
 */
export const EXTERNAL_ID_COLUMNS = ["external_id"] as const satisfies readonly SyncedRoleColumn[];
/**
 * The column a synced row names the connected account it refreshes through.
 *
 * 🚨 IT IS THE LIVE COLUMN NAME, READ HERE ONCE (lane F-51, escalated from U-W2).
 * This list used to read `refreshed_via_account` / `connection_id` / `account_id`
 * — three spellings NO table in `types/database.types.ts` carries. Both synced
 * tables the platform actually has spell it `synced_via_connection_id`
 * (`workbench.google_document`, `communication.calendar_event`), so the producer
 * found nothing, fell back to ranking the accounts, and every registration paid
 * a projection to rename its own column into a name invented here. The producer
 * reads what the tables say; the next synced table inherits the strip by naming
 * its connection the same way `platform.create_entity_table` already does.
 */
export const ACCOUNT_COLUMNS = ["synced_via_connection_id"] as const satisfies readonly SyncedRoleColumn[];
/**
 * Columns holding when we last refreshed the row from the source, most specific
 * first. `synced_at` is the refresh on all three mirror tables;
 * `external_modified_at` (`workbench.google_document`) is Google's own timestamp
 * and answers for a document that has never been re-read. F-54 retired
 * `last_refreshed_at` — no table anywhere — which sat FIRST and therefore looked
 * like the primary answer while never matching anything.
 */
export const REFRESHED_COLUMNS = ["synced_at", "external_modified_at"] as const satisfies readonly SyncedRoleColumn[];
/**
 * The column holding where the record lives at the provider.
 * `workbench.google_document` and `web.youtube_video` both spell it
 * `external_url`. F-54 retired `web_url` (no table anywhere) and `source_url`
 * (thirteen tables, not one of them synced).
 */
export const SOURCE_URL_COLUMNS = ["external_url"] as const satisfies readonly SyncedRoleColumn[];

/**
 * The six candidate lists by role, for the guard that walks
 * `types/database.types.ts` against the roles' naming convention. Exported ONLY so
 * `__tests__/every-candidate-column-is-a-live-column.test.ts` can ask the
 * reverse question the compiler cannot: does a synced table carry a column that
 * plays one of these roles and that no list here names? Never read at runtime by
 * the producer, which uses the consts directly.
 */
export const SYNCED_ROLE_CANDIDATES = Object.freeze({
  PROVIDER_COLUMNS,
  PRODUCT_COLUMNS,
  EXTERNAL_ID_COLUMNS,
  ACCOUNT_COLUMNS,
  REFRESHED_COLUMNS,
  SOURCE_URL_COLUMNS,
});

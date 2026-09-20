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
 * THE ACCOUNT ROLE IS RECOGNISED BY STRUCTURE, NOT BY SPELLING (lane F-81,
 * hostile verifier V-21).
 *
 * The five other roles are naming conventions and nothing more. The ACCOUNT role
 * is not: a column plays it when it POINTS AT THE CONNECTION SIDE of the
 * integrations model — `users.integration_connections` (the connected account
 * itself) or `users.integration_connection_resources` (a resource that BELONGS to
 * one, `integration_connection_resources.connection_id → integration_connections`,
 * the one hop the generated `Relationships` does declare). So the shape is the
 * noun set of those two relations with the `_id` suffix and any prefix a table
 * chooses, not a list of remembered spellings.
 *
 * WHAT THE SPELLING LIST MISSED. `ACCOUNT_COLUMNS` enumerated
 * `synced_via_connection_id | connection_id | account_id | refreshed_via_account`,
 * so the reverse census asked "does a mirror carry an ACCOUNT-shaped column no
 * list names?" with a pattern that could only recognise names somebody had
 * already thought of. `web.youtube_video` IS a mirror (`external_id`,
 * `external_url`, `synced_at`) and names its connection side
 * `channel_resource_id` — matching no spelling and no alternative — so
 * `UNREAD_ROLE_COLUMNS` came back EMPTY and the guard built to prevent F-51 was
 * green while the strip could not read that table's account at all. F-51 re-armed
 * on the third mirror table, invisibly. `workbench.google_document.resource_id`
 * was in the same blind spot.
 *
 * 🚨 THE RESIDUAL BLIND SPOT, STATED. The rule would rather read the FK itself,
 * and it cannot: every FK on all three mirror tables points OUT of the generated
 * schema set (`users.*`, `iam.*`, `auth.*`), and Supabase typegen drops a
 * cross-schema relationship — all three mirrors carry `Relationships: []` in
 * `types/database.types.ts` even though the constraints are live
 * (`youtube_video_channel_resource_id_fkey → users.integration_connection_resources`,
 * `calendar_event_synced_via_connection_id_fkey → users.integration_connections`,
 * read live 2026-09-18). So the seed relation is NAMED here once and the family is
 * derived from the generated `Relationships` of the seed's own schema; the guard
 * asserts both still exist. A mirror that names its connection side WITHOUT one of
 * these nouns (`refreshed_through`, `google_account_ref`) is still invisible to
 * the census — the day typegen carries cross-schema FKs, delete the noun set and
 * read the FK.
 */
export const ACCOUNT_RELATION_SEED = "integration_connections" as const;
/** The relation a connection-side column may point at besides the seed — DERIVED: it is the seed's own child in the generated `Relationships`. */
export const ACCOUNT_RELATION_CHILD = "integration_connection_resources" as const;
/**
 * The nouns those two relations are addressed by in a column name, plus
 * `account` — the word the platform's own vocabulary uses for a connection on a
 * screen. `refreshed_via_account` is kept as an explicit tail alternative purely
 * so this shape is a strict SUPERSET of the spelling list it replaces: no column
 * the old pattern would have censused can escape the new one.
 */
const ACCOUNT_COLUMN_SHAPE =
  /^([a-z0-9_]+_)?(connection|resource|account)_id$|^refreshed_via_account$/;

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
  ACCOUNT_COLUMNS: ACCOUNT_COLUMN_SHAPE,
  REFRESHED_COLUMNS: /^(synced_at|last_synced_at|refreshed_at|last_refreshed_at|external_(modified|updated)_at)$/,
  SOURCE_URL_COLUMNS: /^(web_url|external_url|source_url|html_link|provider_url)$/,
});

/**
 * Role-shaped columns on a synced table that the strip deliberately does NOT
 * read, each with the reason a name lives here instead of in a candidate list.
 * Empty today: F-54 parked `communication.calendar_event.external_updated_at`
 * here as an open escalation ("would reading Google's own modified time change
 * what a person sees?"), and ruling R28 (chair, 2026-09-18) answered it —
 * every synced table's freshness line reads the provider's own modified time
 * wherever the mirror table carries one, in the same position for every table
 * — so lane F-56 moved that name into `REFRESHED_COLUMNS` instead of leaving
 * it unread. The mechanism stays: the next name a census finds that would
 * change a screen's behaviour belongs here, with the reason, until the chair
 * rules on it — never silently added to a candidate list and never silently
 * dropped.
 */
export const UNREAD_ROLE_COLUMNS: Readonly<Record<string, string>> = Object.freeze({});

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
 *
 * 🚨 ORDER IS THE RULING, AND A CONNECTION ID IS NOT A RESOURCE ID (lane F-81).
 * The structural census above found two more live connection-side columns the
 * spelling list could not see: `workbench.google_document.resource_id` and
 * `web.youtube_video.channel_resource_id`, both FK'd to
 * `users.integration_connection_resources` (live, read 2026-09-18) — and
 * `web.youtube_video` has NO connection column at all, so on the day U-M3 ships
 * YouTube the strip would have had nothing to read and would have ranked the
 * accounts, which is F-51 exactly. The connection column comes FIRST because it
 * is the account outright; a resource id needs one hop
 * (`integration_connection_resources.connection_id`) and `resolveRowAccountId` in
 * `sourceHealth.ts` takes it, off the inventory both reads already fetch. Adding a
 * resource id to this list WITHOUT that hop would have been the F-51 defect in a
 * new spelling: `preferredAccountId` compares the value against account ids, finds
 * nothing, and silently ranks.
 */
export const ACCOUNT_COLUMNS = [
  "synced_via_connection_id",
  "resource_id",
  "channel_resource_id",
] as const satisfies readonly SyncedRoleColumn[];
/**
 * Columns holding when we last refreshed the row from the source, most specific
 * first — `stringColumn` in `sourceHealth.ts` returns the first of these that is
 * present and non-null, so order IS the ruling. `synced_at` is the refresh on
 * all three mirror tables and stays first: it is the account's own record of
 * when it last touched the row, and a row that has one always answers with it.
 * `external_modified_at` (`workbench.google_document`) is Google's own
 * modified time and answers for a document that has never been re-read.
 * `external_updated_at` (`communication.calendar_event`) is Google's own
 * updated time for the event and joined this list under ruling R28 (chair,
 * 2026-09-18): a synced record's freshness line reads the provider's own
 * modified time wherever the mirror table carries one, in the same position
 * for every table. F-54 parked it in `UNREAD_ROLE_COLUMNS` as an open
 * escalation ("would this change what an event with no `synced_at` shows?");
 * R28 answered yes and ruled that the change is correct, so lane F-56 moved
 * it here. F-54 also retired `last_refreshed_at` — no table anywhere — which
 * sat FIRST and therefore looked like the primary answer while never matching
 * anything.
 *
 * `last_synced_at` is the SAME answer as `synced_at` under a second spelling —
 * our own record of when we last refreshed the row — and it is what
 * `media.source_library` and `code.code_repositories` carry (neither has
 * `synced_at`; no table in the database carries both, so its position next to
 * `synced_at` changes nothing for any existing row). It could not be added
 * before 2026-09-18: `SyncedRoleColumn` is derived from the generated types and
 * the `media` schema was not in them, which is the exact defect
 * `SCHEMAS_AWAITING_REGENERATION` was built to make visible. With the
 * regeneration landed (`30e05dbd80`), the reverse census named
 * `media.source_library.last_synced_at` on its first run — as the declaration
 * predicted it would — and this is the answer.
 */
export const REFRESHED_COLUMNS = [
  "synced_at",
  "last_synced_at",
  "external_modified_at",
  "external_updated_at",
] as const satisfies readonly SyncedRoleColumn[];
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

// ───────────────────────────────────────────────────────────────────────────────
// 🚨 THE UNIVERSE THIS CENSUS DERIVES FROM IS ITSELF CONFIGURED BY HAND — AND IT
// WAS WRONG (lane F-93, hostile verifier V-22, finding NEW-5).
//
// Everything above derives its universe from `types/database.types.ts`: a synced
// table IS a table whose generated `Row` declares `sync_status`. That derivation
// is sound. What nobody had checked is the universe of the GENERATED FILE, which
// is not the database — it is the hand-written `--schema` list in
// `package.json`'s `db-types` script. Live, SIX tables carry `sync_status`:
//
//     code.code_repositories        commerce.cloud_sync_connection
//     communication.calendar_event  media.source_library
//     web.youtube_video             workbench.google_document
//
// The sixth, `media.source_library`, is an ACTIVE and LISTED entity
// (`platform.entity_types.token = 'media_source_library'`, label "Source
// Library") with `sync_status` + `external_id`, a working screen at
// `/libraries/<id>`, and at least one live row — and the `media` schema was
// absent from the `--schema` list, so it appears NOWHERE in the generated types.
// Every leg of the F-54/F-81 machinery therefore could not see it: not
// `SyncedTableColumn`, not the reverse census, not `UNREAD_ROLE_COLUMNS`. The
// guards were green because the table does not exist as far as the type can
// tell. The same audit found a second missing schema, `provider`, which holds
// two registered entity types (`provider_account`,
// `provider_account_credential`).
//
// THE FIX WAS IN TWO HALVES AND BOTH HAVE LANDED. The `--schema` list names
// `media` and `provider` (and the script's own post-generation assertions demand
// both schemas landed, beside the existing `hr` / `esign` ones), and the
// regeneration itself reached the committed file on 2026-09-18 in `30e05dbd80`
// — so `media.source_library` is now visible to every type-derived census here
// and `SCHEMAS_AWAITING_REGENERATION` is EMPTY. The guard that names a
// configured-but-absent schema stays: it fails the moment a schema is missing
// and NOT declared — or a declared one has landed and the entry was left behind,
// which is the failure that carried these two entries for a day after the
// regeneration.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Schemas the `db-types` generator is configured to emit that the COMMITTED
 * `types/database.types.ts` does not carry yet, with what each one costs while
 * it is missing. Each value must name the command that clears it.
 *
 * 🚨 An entry here is a MEASUREMENT GAP, never an exemption: while a schema is
 * listed, every type-derived census in this feature is knowingly blind to its
 * tables. Clear an entry by running the regeneration and deleting the line —
 * both in the same change, because a stale entry hides a table that is now
 * visible. Guard:
 * `__tests__/the-generated-types-carry-every-configured-schema.test.ts`.
 */
export const SCHEMAS_AWAITING_REGENERATION: Readonly<Record<string, string>> =
  Object.freeze({
    // EMPTY, and that is the point: `media` and `provider` were both declared
    // here until the regeneration landed (`30e05dbd80`, 2026-09-18). A stale
    // entry hides a table that is now visible, so the guard fails on one — which
    // is how `media.source_library`'s `last_synced_at` finally reached
    // REFRESHED_COLUMNS below.
  });

/**
 * Every table that carries `sync_status` in the LIVE database, read 2026-09-18
 * (`information_schema.columns`, project `brsgrqvjdzwihsvnfqkf`). This is the
 * truth the generated types are measured AGAINST: the census asserts that the
 * synced tables visible in the generated file are exactly this list minus the
 * tables in the schemas declared above — so a synced table can no longer hide
 * behind a schema nobody generated, and a NEW synced table in a schema we DO
 * generate still fails the census by name.
 */
export const LIVE_SYNCED_TABLES = [
  "code.code_repositories",
  "commerce.cloud_sync_connection",
  "communication.calendar_event",
  "media.source_library",
  "web.youtube_video",
  "workbench.google_document",
] as const;

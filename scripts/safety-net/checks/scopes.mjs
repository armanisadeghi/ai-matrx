// Checks for area "scopes" — lane SN-SCOPES (2026-10-01), items S01–S16.
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
//
// Only what ran GREEN on the clone (clone-20260929) on 2026-10-01 is registered. Suites that were looked
// at and NOT registered, and why (so the next lane does not re-try them blind):
//   scopeswt_the_store_writes_scopes, scopessidefx_*: "permission denied for function create_scope_type /
//     create_context_item" — the old scope writers are revoked on the clone (SCOPES-OLD-WRITERS), the suites
//     still call them; scopesoldwriters_*: need -v a/up file paths (rehearsal harnesses, not checks);
//   scopesrowscopied_*: T1 RED on the clone (Titanium rows_copied already met — fixture drift);
//   proofdefects_a_new_scope_tag_type_*: "association direction is wrong" (registry moved since);
//   scopestails_the_copy_carries_own_words: SUPERSEDED by scopeshomes_every_column_has_a_home;
//   *_measure.sql / *_compare.sql measurements: they print counts and never fail, so they prove nothing red.
const sql = (name, items, extra = {}) => ({
  id: `scopes.sql-${extra.short ?? name}`,
  area: "scopes",
  kind: "sql",
  file: `scripts/campaign-tests/${name}.sql`,
  items,
  targets: ["clone"],
  ...extra,
});

export default [
  // S01–S03: a scope type's, a context field's and a scope's own words live in the store's own homes,
  // and a duplicate slug is refused by the record door.
  sql("scopeshomes_every_column_has_a_home_red_green", ["S01", "S02", "S03"], { short: "homes" }),
  // S03 / S10: every old edit tells the copy (the follow) — values and items reach the store.
  sql("sc2_the_context_copy_follows_red_green", ["S03", "S10"], { short: "copy-follows" }),
  // S04: a template is applied through the store's scope doors (Dental Practice + a parent/reference definition).
  sql("scopestails_templates_through_the_doors_red_green", ["S04"], { short: "templates" }),
  // S10: what an agent is handed — references, system items, the copy fence.
  sql("contextparity_references_red_green", ["S10"], { short: "handoff-references" }),
  sql("cvn2_a_system_item_is_read_only_when_named_red_green", ["S10"], { short: "handoff-system-items", passWhen: "ALL PASS", failWhen: "FAIL —" }),
  sql("cvn3_an_old_caller_gets_the_default_system_items_red_green", ["S10"], { short: "handoff-old-caller", passWhen: "ALL PASS", failWhen: "FAIL —" }),
  sql("sc1p_the_context_copy_fence_red_green", ["S10"], { short: "handoff-fence" }),
  // S11: a member edits a scope in the store as she does today; a members-see-shared-only organization unchanged.
  sql("scopesaccess_a_member_edits_a_scope_as_she_does_today_red_green", ["S11"], { short: "member-edits" }),
  // S13: a person of no organization reads only the platform's tags, nothing else of Matrx System (the org wall).
  sql("scopesaccess_platform_tags_are_read_through_the_scopes_door_red_green", ["S13"], { short: "platform-tags-wall" }),
  // S14 (closest real check): a field kept out of what an agent sees stays kept out, through formulas and rollups.
  sql("storetails3_context_green", ["S14"], { short: "restricted-field-agent", passWhen: "ALL PASS", failWhen: "P[0-9] FAIL" }),
  // S15 / S16: the class functions — a disabled join code and a cleared teacher leave the Record (no stale admit).
  sql("scopesaccess_a_removed_scope_setting_leaves_the_store_red_green", ["S15", "S16"], { short: "class-settings" }),
  // S09 / S10: both resolvers, every live scope type of every organization, as admin@admin.com, on the clone.
  // The database is the five SUPABASE_MATRIX_* values; server_env.py --shell sets them to the proven clone.
  {
    id: "scopes.cmd-context-parity",
    area: "scopes",
    kind: "cmd",
    cmd: "zsh",
    args: ["-c", 'eval "$(uv run python scripts/clone/server_env.py --shell)" && uv run python scripts/context_parity.py --every-type --as admin@admin.com --expect clone'],
    cwd: "../aidream",
    dbEnv: "clone",
    passWhen: "RESULT: PARITY — zero defects in every type, every row copied",
    items: ["S09", "S10"],
    targets: ["clone"],
    timeoutMs: 40 * 60 * 1000,
  },
];

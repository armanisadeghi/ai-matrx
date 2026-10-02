-- chair-step: WINDOW FILE (adds columns to the hot partitioned custom.record — ACCESS EXCLUSIVE on the parent and its 16 partitions for the catalog change; never applied outside the chair's watched window). Adds published_to_web (not null default false), published_to_web_at, published_to_web_by and search_engine_indexed to custom.record with the two T-13 CHECKs (added NOT VALID, then validated); replaces the body of platform._t13_transitional_dual_write so a partitioned table's triggers key their markers and counter on the partition ROOT when the trigger names it (second trigger argument; every existing trigger passes one argument and is unchanged); attaches that dual-write trigger and the T-13 counter trigger to custom.record and marks its defaults (platform._t13_transitional_mark_defaults); enrolls `record` in "Indexed by default" (one platform.feature_knob row, off); creates custom._record_row_defaults and its BEFORE INSERT trigger _a00_row_defaults, which gives every new row its Table's row defaults on EVERY insert path. No grant changes; no policy changes.
-- lane: CHAIR-DOORS-2 (asked by v6 lane 2 MAKE-HOME, need "store tables enrolled in Shown to / Published to the web / Indexed"); companion of chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql, which must be applied first
-- window-class: ADD COLUMN x4 + two NOT VALID CHECKs take ACCESS EXCLUSIVE on custom.record and its 16 partitions (catalog-only, measured ~165 ms on the clone); the three CREATE TRIGGERs take SHARE ROW EXCLUSIVE on the same 17; every reader and writer of the store waits for the transaction (~2.5 s measured end to end); 01:00-04:00 Pacific at production, lock_timeout 2s, retry on timeout.
-- based-on: platform._t13_transitional_dual_write() 3eb9998cc3e52261d6420d8876e81698344815c099e31a365354e9ed3a2e5e53
--
-- WHY A WINDOW: custom.record is the store's one hot table (16 hash partitions). ADD COLUMN with a constant
-- default and NOT VALID CHECKs are catalog-only, but each still takes ACCESS EXCLUSIVE on the parent and every
-- partition for its few milliseconds, and the trigger creations take SHARE ROW EXCLUSIVE. lock_timeout 2s: if
-- a long reader holds the table the file fails fast and is simply re-run. Measured on the clone: see the
-- lane's report (pnpm db:rehearse output).
--
-- WHAT IT COMPLETES (T-13 PLAN §2.3 handover: "custom.record_p00–p15 go to the custom data system"):
--   * Published to the web on a store row = custom.record.published_to_web, kept in step with the retiring row
--     column by the ONE dual-write trigger every entity table carries, so platform.set_search_engine_indexed,
--     platform._published_to_web_sql and the store's existing readers all agree with it before the switch.
--   * Indexed = custom.record.search_engine_indexed (null = follow access.indexed_by_default/record, off).
--   * The Table's defaults (data.row_defaults, set by custom.table_row_defaults_set) reach EVERY new row —
--     forms, graph writes, imports, checklists, kits — through _a00_row_defaults, which fires before the
--     dual-write trigger. It fills only what the writer did not give: shown_to when null, search_engine_indexed
--     when null, published_to_web when the writer left it to its default (the T-13 marker says so).
--
-- WHY THE DUAL-WRITE BODY CHANGES: Postgres runs a partitioned table's row triggers with TG_RELID = the
-- PARTITION, while the marker defaults (set on the parent) and the statement counter (fired on the parent)
-- name the PARENT. Unchanged, every insert into custom.record would read as "the row column was written"
-- (counted as a legacy write forever) and a published_to_web given without the row column would be refused as
-- a disagreement. The fix is opt-in by a second trigger argument, so the 334 expanded tables are untouched.

set local lock_timeout = '2s';

alter table custom.record
  add column published_to_web boolean not null default false,
  add column published_to_web_at timestamptz,
  add column published_to_web_by uuid,
  add column search_engine_indexed boolean,
  add constraint t13_indexed_only_when_published
    check (search_engine_indexed is not true or published_to_web) not valid,
  add constraint t13_everyone_on_ai_matrx_only_when_published
    check (shown_to is distinct from 'everyone_on_ai_matrx' or published_to_web) not valid;

comment on column custom.record.published_to_web is
  'Published to the web: the only anonymous lane (access ladder). Not published = behaves as an Organization record. A new row takes its Table''s data.row_defaults.published_to_web.';
comment on column custom.record.published_to_web_at is
  'When the web state was last set through published_to_web; null = derived from the retiring row column (T-13).';
comment on column custom.record.published_to_web_by is
  'Who last set the web state through published_to_web; null = derived from the retiring row column (T-13).';
comment on column custom.record.search_engine_indexed is
  'Indexed by search engines (access ladder T-12). NULL = follow the type knob access.indexed_by_default/record; true/false = this row''s choice. Meaningful only while published to the web; read it only through platform.search_engine_indexed(), never directly.';

CREATE OR REPLACE FUNCTION platform._t13_transitional_dual_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
-- T-13 phase 3.2 + 3.2b (TRANSITIONAL, expires 2026-12-15). TG_ARGV[0] = 'shown_to' when the table carries it.
-- TG_ARGV[1] (optional) = the partition root, for a partitioned table: its markers and counter name the root,
-- because the defaults and the statement trigger live on the root while this row trigger runs per partition.
-- published_to_web_by = the operating person, the platform actor stamp (platform._stamp_actor): app.user_id, else auth.uid().
declare
  v_has_shown   boolean := tg_nargs > 0 and tg_argv[0] = 'shown_to';
  v_rel         text := case when tg_nargs > 1 then (tg_argv[1]::regclass)::oid::text else tg_relid::text end;
  v_vis_changed boolean;
  v_ptw_changed boolean;
  v_vis_given   boolean;
  v_ptw_given   boolean;
  v_counted     boolean := false;
  v_key         text := 't13w.r' || v_rel;
  v_mark_vis    text := 't13d.v' || v_rel;
  v_mark_ptw    text := 't13d.p' || v_rel;
  v_vis_default boolean := coalesce(current_setting(v_mark_vis, true), '') = '1';
  v_ptw_default boolean := coalesce(current_setting(v_mark_ptw, true), '') = '1';
  v_person      uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()));
begin
  -- The markers belong to this row only: cleared on every row, INSERT or UPDATE.
  if v_vis_default then perform set_config(v_mark_vis, '', true); end if;
  if v_ptw_default then perform set_config(v_mark_ptw, '', true); end if;
  if tg_op = 'INSERT' then
    v_vis_given := not v_vis_default and new.visibility is not null;
    v_ptw_given := not v_ptw_default and new.published_to_web is not null;
    if v_vis_given and v_ptw_given then
      if (new.visibility = 'public') is distinct from new.published_to_web then
        raise exception 't13_row_column_disagrees: % insert says published_to_web % and row column % at once',
            tg_table_schema || '.' || tg_table_name, new.published_to_web, new.visibility
          using errcode = 'check_violation',
                hint = 'Write published_to_web alone; "only me" is shown_to (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      new.published_to_web_at := coalesce(new.published_to_web_at, now());
      new.published_to_web_by := coalesce(new.published_to_web_by, v_person);
      v_counted := true;
    elsif v_vis_given then
      new.published_to_web := (new.visibility = 'public');
      new.published_to_web_at := null;
      new.published_to_web_by := null;
      v_counted := true;
    elsif v_ptw_given then
      if new.published_to_web then
        new.visibility := 'public';
      elsif new.visibility is null or new.visibility = 'public' then
        new.visibility := 'internal';
      end if;  -- else the table's default stands ('personal' keeps its lock until the switch)
      new.published_to_web_at := coalesce(new.published_to_web_at, now());
      new.published_to_web_by := coalesce(new.published_to_web_by, v_person);
    else
      if new.visibility is null then
        new.visibility := 'internal';
      end if;
      new.published_to_web := (new.visibility = 'public');
      new.published_to_web_at := null;
      new.published_to_web_by := null;
    end if;
    -- Nested on purpose: PL/pgSQL resolves every NEW field an expression names before it
    -- evaluates any of it, so `v_has_shown and ... new.shown_to` raised 42703 on every INSERT into
    -- a table with no shown_to column (billing.spend_approval, extend.wbx_guidance,
    -- users.user_analysis_preferences, web.voice_fingerprint, platform.dated_change). The UPDATE
    -- branch below already nests it.
    if v_has_shown and new.visibility = 'personal' then
      if new.shown_to is null then
        new.shown_to := 'only_me';
      end if;
    end if;
  else
    v_vis_changed := new.visibility is distinct from old.visibility;
    v_ptw_changed := new.published_to_web is distinct from old.published_to_web;
    if v_vis_changed and v_ptw_changed then
      if (new.visibility = 'public') is distinct from new.published_to_web then
        raise exception 't13_row_column_disagrees: % row % changes both web states and they disagree (% / published_to_web %)',
            tg_table_schema || '.' || tg_table_name, new.id, new.visibility, new.published_to_web
          using errcode = 'check_violation',
                hint = 'Write published_to_web alone; the retiring row column is derived from it (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      new.published_to_web_at := now();
      new.published_to_web_by := v_person;
      v_counted := true;
    elsif v_vis_changed then
      if new.visibility = 'public' and not new.published_to_web and old.published_to_web_at is not null then
        raise exception 't13_stale_row_column_write: % row % was taken off the web through published_to_web; a write through the retiring row column cannot put it back',
            tg_table_schema || '.' || tg_table_name, new.id
          using errcode = 'check_violation',
                hint = 'This is a stale full-row write. Re-read the row and set published_to_web = true to publish it (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      if new.published_to_web is distinct from (new.visibility = 'public') then
        new.published_to_web := (new.visibility = 'public');
        new.published_to_web_at := null;
        new.published_to_web_by := null;
      end if;
      v_counted := true;
    elsif v_ptw_changed then
      if new.published_to_web then
        new.visibility := 'public';
      elsif old.visibility = 'public' then
        new.visibility := 'internal';
      end if;
      new.published_to_web_at := now();
      new.published_to_web_by := v_person;
    elsif new.published_to_web is distinct from (new.visibility = 'public') then
      -- Not yet backfilled: heal the derived column from the source of truth (before the switch).
      new.published_to_web := (new.visibility = 'public');
    end if;
    if v_vis_changed and v_has_shown and new.visibility = 'personal' then
      if new.shown_to is null then
        new.shown_to := 'only_me';
      end if;
    end if;
  end if;
  if v_counted then
    perform set_config(v_key, (coalesce(nullif(current_setting(v_key, true), ''), '0')::bigint + 1)::text, true);
  end if;
  return new;
end
$function$;

create trigger _a0_t13_dual_write before insert or update on custom.record
  for each row execute function platform._t13_transitional_dual_write('shown_to', 'custom.record');
create trigger _t13_count_row_column_writes after insert or update on custom.record
  for each statement execute function platform._t13_transitional_flush_writes();
-- 3.2b: the two columns' defaults mark themselves, so the insert branch tells a default from a written value.
select platform._t13_transitional_mark_defaults('custom.record'::regclass);

-- Rows already public through the row column (none on 2026-10-02) are published; the dual-write trigger
-- would heal each on its next write anyway.
update custom.record set published_to_web = true where visibility = 'public' and not published_to_web;

alter table custom.record validate constraint t13_indexed_only_when_published;
alter table custom.record validate constraint t13_everyone_on_ai_matrx_only_when_published;

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis,
   review_due, overridable_by, override_direction)
values
  ('access.indexed_by_default', 'record', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Indexed by default: table rows',
   'Whether a table row that is published to the web may be listed by search engines, unless its table or the row says otherwise.',
   'agent', 'Arman, 2026-10-02 (MAKE-HOME rulings 3, 11:20 defaults): Indexed is off by default; each table sets its own default and each row can override it.',
   '2026-12-02', '{organization,user}', 'any')
on conflict do nothing;

CREATE OR REPLACE FUNCTION custom._record_row_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- CHAIR-DOORS-2 j. A NEW ROW STARTS WITH ITS TABLE'S ROW DEFAULTS, on every insert path.
-- Fires first (_a00_ sorts before _a0_t13_dual_write) and fills only what the writer left out:
--   shown_to              when null;
--   search_engine_indexed when null;
--   published_to_web      when it holds its column default (the T-13 marker for custom.record is set). Turning
--                         it on clears that marker, so the dual-write trigger reads it as written and puts the
--                         retiring row column in step.
-- A Table that names none ('{}') changes nothing: Shown to follows the organization's default at list time,
-- Published to the web stays off, Indexed follows access.indexed_by_default/record.
declare
  v_d    jsonb;
  v_mark text := 't13d.p' || ('custom.record'::regclass)::oid::text;
begin
  if new.data_class <> 'record' or new.table_id is null then
    return new;
  end if;
  v_d := custom._table_row_defaults(new.organization_id, new.table_id);
  if v_d is null or v_d = '{}'::jsonb then
    return new;
  end if;
  if coalesce(current_setting(v_mark, true), '') = '1' and (v_d ->> 'published_to_web')::boolean then
    perform set_config(v_mark, '', true);
    new.published_to_web := true;
  end if;
  if new.search_engine_indexed is null and v_d ? 'indexed' and new.published_to_web then
    new.search_engine_indexed := (v_d ->> 'indexed')::boolean;
  end if;
  if new.shown_to is null and v_d ? 'shown_to'
     and (v_d ->> 'shown_to' <> 'everyone_on_ai_matrx' or new.published_to_web) then
    new.shown_to := (v_d ->> 'shown_to')::platform.shown_to;
  end if;
  return new;
end
$function$;
revoke all on function custom._record_row_defaults() from public, anon, authenticated;

create trigger _a00_row_defaults before insert on custom.record
  for each row execute function custom._record_row_defaults();

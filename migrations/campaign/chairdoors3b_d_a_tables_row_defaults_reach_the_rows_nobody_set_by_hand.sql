-- chair-step: CREATES one SECURITY DEFINER door, custom.table_row_defaults_apply, declares it in platform.client_callable_door and GRANTs EXECUTE on it to `authenticated`; INSERTS one row into platform.metadata_reserved_keys (record / row_controls_from_default) so the door may keep its own marker on a row. `anon` gains nothing. No table, column, index, trigger, policy, knob row or existing function is touched.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 2 MAKE-HOME, need "Apply to existing rows")
--
-- A TABLE'S ROW DEFAULTS REACH THE ROWS NOBODY SET BY HAND (Arman, 2026-10-02: the table default is
-- "auto-applied to all but then overridable always"). custom.table_row_defaults_set decides what NEW rows
-- start with; this door carries the same defaults to the rows that already exist, and leaves alone every
-- row somebody changed individually.
--
-- THE USE CASE. Dana Whitlock keeps Cedar Ridge Physical Therapy's "Home exercise plans" table. 412 plans
-- are already in it when she sets the table to "Shown to: My team". She presses Apply to existing rows:
-- 409 plans move to My team; the three she had set to Only me by hand stay Only me, and the answer says so.
--
--   custom.table_row_defaults_apply(p_organization_id, p_table_id, p_after uuid default null, p_budget_ms integer default 4000)
--     → jsonb {table_id, defaults, seen, changed, kept_by_hand, done, next_after, sentence}
--   RUNG: the one custom.table_row_defaults_set asks — the person who made the table, or full access to it.
--   PAGED UNDER THE 8 s CLOCK: one call walks rows in id order from p_after until p_budget_ms (100–6000) is
--   spent; done=false means call again with p_after = next_after. Counts are for this call.
--
-- "SET BY HAND", PER CONTROL (Shown to · Published to the web · Indexed), WITHOUT A NEW COLUMN:
--   a row FOLLOWS the default for a control when its value is unset (Shown to null · never published ·
--   Indexed null), or equals what a default last stamped on it — the row's own marker
--   metadata.row_controls_from_default {shown_to, published_to_web, indexed}, written by this door and (after
--   the chair's window file chairdoors3b_d2) by the insert trigger on every insert path — or already equals
--   the table's default. Anything else was changed on the row itself, through any door, and is kept.
--   A control the table names no default for goes back to unset on the rows that follow.
--   The ladder's own rules hold per row: "everyone on AI Matrx" only on a published row; Indexed only on a
--   published row.
-- BEFORE THE WINDOW FILE LANDS (custom.record carries no published_to_web / search_engine_indexed on
-- production yet) the door applies Shown to only — custom._row_control_columns() says which switches the
-- store carries — and a row a write door stamped with an EARLIER default carries no marker, so it reads as
-- set by hand and keeps its value (the safe side). The window file closes that.
--
-- INVERSE: migrations/inverse/chairdoors3b_d_a_tables_row_defaults_reach_the_rows_nobody_set_by_hand_down.sql

insert into platform.metadata_reserved_keys (table_token, key, reason)
values ('record', 'row_controls_from_default',
        'CHAIR-DOORS-3B: what a Table''s row defaults last stamped on this row — {shown_to, published_to_web, indexed}. Written only by custom.table_row_defaults_apply and the insert trigger custom._record_row_defaults; read only by custom.table_row_defaults_apply to tell a row that follows its Table''s defaults from one somebody set by hand. System state about the row, never user content.')
on conflict do nothing;

create or replace function custom.table_row_defaults_apply(p_organization_id uuid, p_table_id uuid, p_after uuid default null, p_budget_ms integer default 4000)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me      uuid := custom.query_principal();
  v_owner   uuid;
  v_name    text;
  v_cols    jsonb := custom._row_control_columns();
  v_has_pub boolean := (v_cols ->> 'published_to_web')::boolean;
  v_has_idx boolean := (v_cols ->> 'indexed')::boolean;
  v_d       jsonb;
  d_shown   text;
  d_pub     boolean;
  d_idx     boolean;
  v_t0      timestamptz := clock_timestamp();
  v_budget  integer := least(greatest(coalesce(p_budget_ms, 4000), 100), 6000);
  v_after   uuid := p_after;
  v_seen    integer := 0;
  v_changed integer := 0;
  v_kept    integer := 0;
  v_done    boolean := false;
  v_got     integer;
  v_last    uuid;
  v_c       integer;
  v_k       integer;
  v_chunk   constant integer := 100;
  v_t1      timestamptz;
  v_sql     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_row_defaults_apply');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_row_defaults_apply');
  select t.created_by, t.data ->> 'name' into v_owner, v_name
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  if not found then
    raise exception 'That table is not in this organization.' using errcode = '02000',
      hint = 'The store is keyed (organization_id, id): open the table from its own organization. Nothing was written.';
  end if;
  -- The rung custom.table_row_defaults_set asks: the person who made it, or someone with full access to it.
  if not (custom.query_is_store_owner() or v_owner = v_me
          or iam.has_access('record', p_table_id, 'admin'::public.permission_level)) then
    raise exception 'Only the person who made this table (or someone with full access to it) can apply its row defaults to the rows already in it.'
      using errcode = '42501', hint = 'Nothing was written. Ask an owner of the table to do it, or to give you full access.';
  end if;

  v_d     := custom._table_row_defaults(p_organization_id, p_table_id);
  d_shown := v_d ->> 'shown_to';
  d_pub   := v_has_pub and coalesce((v_d ->> 'published_to_web')::boolean, false);
  d_idx   := case when v_has_idx and d_pub then (v_d ->> 'indexed')::boolean end;
  if d_shown = 'everyone_on_ai_matrx' and not d_pub then
    d_shown := null;   -- cannot be a default without the web (table_row_defaults_set refuses it); never stamped
  end if;

  -- ONE STATEMENT PER CHUNK. custom.record's statement-level triggers (history, the change feed) cost
  -- the same once per statement, so 100 rows in one UPDATE take ~2 s on the clone where 100 single-row
  -- UPDATEs took ~28 s. The first chunk always runs; the next starts only while the budget allows it.
  v_sql := $q$
    with page as (
      select x.id, to_jsonb(x) as j
        from custom.record x
       where x.organization_id = $1 and x.table_id = $2 and x.data_class = 'record' and x.deleted_at is null
         and ($3::uuid is null or x.id > $3::uuid)
       order by x.id
       limit $4::integer),
    c0 as (
      select id, j,
             case when jsonb_typeof(j #> '{metadata,row_controls_from_default}') = 'object'
                  then j #> '{metadata,row_controls_from_default}' else '{}'::jsonb end as m,
             j ->> 'shown_to' as c_shown,
             coalesce((j ->> 'published_to_web')::boolean, false) as c_pub,
             (j ->> 'search_engine_indexed')::boolean as c_idx,
             j ->> 'published_to_web_at' as c_at
        from page),
    -- does the row follow the default, per control?
    c1 as (
      select *,
             (c_shown is null or (m ? 'shown_to' and m ->> 'shown_to' = c_shown) or c_shown is not distinct from $5::text) as f_shown,
             ($8::boolean and ((m ? 'published_to_web' and (m ->> 'published_to_web')::boolean = c_pub)
                               or (not m ? 'published_to_web' and not c_pub and c_at is null)
                               or c_pub = $6::boolean)) as f_pub,
             ($9::boolean and (c_idx is null or (m ? 'indexed' and (m ->> 'indexed')::boolean = c_idx) or c_idx is not distinct from $7::boolean)) as f_idx
        from c0),
    c2 as (
      select *, case when f_pub then $6::boolean else c_pub end as p_pub0,
                case when f_shown then $5::text else c_shown end as p_shown0
        from c1),
    -- "everyone on AI Matrx" only on a published row: kept off the web by hand → the Shown to default
    -- cannot apply; shown to everyone by hand → it stays on the web.
    c3 as (
      select *,
             case when p_shown0 = 'everyone_on_ai_matrx' and not p_pub0 and not f_shown then c_pub else p_pub0 end as n_pub,
             case when p_shown0 = 'everyone_on_ai_matrx' and not p_pub0 and f_shown then nullif(c_shown, 'everyone_on_ai_matrx') else p_shown0 end as n_shown
        from c2),
    c4 as (
      select *, case when not n_pub then null when f_idx then $7::boolean else c_idx end as n_idx from c3),
    c5 as (
      select *, jsonb_strip_nulls(jsonb_build_object(
                  'shown_to', case when f_shown then n_shown end,
                  'published_to_web', case when f_pub and (n_pub or c_pub or c_at is not null) then n_pub end,
                  'indexed', case when f_idx then n_idx end)) as n_m
        from c4),
    upd as (
      update custom.record r
         set shown_to = c.n_shown::platform.shown_to,
             metadata = case when c.n_m = '{}'::jsonb then r.metadata - 'row_controls_from_default'
                             else jsonb_set(r.metadata, '{row_controls_from_default}', c.n_m, true) end
             @SET_PUB@ @SET_IDX@
        from c5 c
       where r.organization_id = $1 and r.id = c.id
         and (c.n_shown is distinct from c.c_shown or c.n_pub is distinct from c.c_pub
              or c.n_idx is distinct from c.c_idx or c.n_m is distinct from c.m)
      returning c.id,
                (c.n_shown is distinct from c.c_shown or c.n_pub is distinct from c.c_pub or c.n_idx is distinct from c.c_idx) as changed)
    select count(*)::integer as seen,
           (select u.id from page u order by u.id desc limit 1) as last_id,
           (select count(*) from upd where upd.changed)::integer as changed,
           count(*) filter (where not (f_shown and (f_pub or not $8::boolean) and (f_idx or not $9::boolean)))::integer as kept
      from c5
  $q$;
  v_sql := replace(replace(v_sql, '@SET_PUB@', case when v_has_pub then ', published_to_web = c.n_pub' else '' end),
                   '@SET_IDX@', case when v_has_idx then ', search_engine_indexed = c.n_idx' else '' end);

  loop
    v_t1 := clock_timestamp();
    execute v_sql into v_got, v_last, v_c, v_k
      using p_organization_id, p_table_id, v_after, v_chunk, d_shown, d_pub, d_idx, v_has_pub, v_has_idx;
    v_seen    := v_seen + coalesce(v_got, 0);
    v_changed := v_changed + coalesce(v_c, 0);
    v_kept    := v_kept + coalesce(v_k, 0);
    if v_last is not null then v_after := v_last; end if;
    if coalesce(v_got, 0) < v_chunk then
      v_done := true;
      exit;
    end if;
    -- Another chunk only if one more of the size just measured still fits the budget.
    exit when extract(epoch from clock_timestamp() - v_t0) * 1000 + extract(epoch from clock_timestamp() - v_t1) * 1000 > v_budget;
  end loop;

  return jsonb_build_object(
    'table_id', p_table_id,
    'defaults', v_d,
    'seen', v_seen,
    'changed', v_changed,
    'kept_by_hand', v_kept,
    'done', v_done,
    'next_after', case when v_done then null else v_after end,
    'sentence', case
      when not v_done then format('%s rows checked so far in "%s"; more to go.', v_seen, custom.said(v_name, 'this table'))
      when v_kept > 0 then format('%s rows now follow the defaults of "%s"; %s set by hand kept theirs.', v_changed, custom.said(v_name, 'this table'), v_kept)
      else format('%s rows now follow the defaults of "%s".', v_changed, custom.said(v_name, 'this table')) end);
end
$function$;
comment on function custom.table_row_defaults_apply(uuid, uuid, uuid, integer) is
  'Chair (v6) — "Apply to existing rows": carries a Table''s row defaults (Shown to, Published to the web, Indexed) to the rows that follow them and keeps every row somebody set by hand (metadata.row_controls_from_default tells the two apart). The maker of the Table or full access to it. Paged: walks rows in id order from p_after within p_budget_ms (100–6000); done=false means call again with next_after. Counts are per call.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_row_defaults_apply', 'p_organization_id uuid, p_table_id uuid, p_after uuid, p_budget_ms integer',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'integer'::regtype::oid],
   'Applies a Table''s row defaults to its existing rows that follow them, keeping rows set by hand. custom.assert_store_door and custom.assert_client_may_reach first; then the maker of the Table or full access to it (the rung custom.table_row_defaults_set asks).',
   'chairdoors3b_d_a_tables_row_defaults_reach_the_rows_nobody_set_by_hand.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; every row is read and written in this organization only.')),
     'p_table_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Read only as a Table of p_organization_id; the maker or full access (iam.has_access admin) decides any change.')),
     'p_after', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Only a cursor: rows are matched by organization_id and table_id, so a foreign or invented id just moves the starting point inside the caller''s own table.')))))
on conflict do nothing;

grant execute on function custom.table_row_defaults_apply(uuid, uuid, uuid, integer) to authenticated;

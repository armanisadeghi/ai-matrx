-- LANE TAILS-2 — THE RED TWIN. It runs the REAL BYTES of both inverses and then asks the
-- green suite's own questions, which must all fail. A guard nobody has watched fail is not
-- a guard; this is the half that can go red.
--
-- RUN IT:  ./binlocal/p.sh -f scripts/campaign-tests/tails2_red.sql
--
-- IT ROLLS BACK, and the rollback is VERIFIED outside the transaction at the end — a file
-- that put the defect back and left it there would be the worst thing in this directory.

\set ON_ERROR_STOP on
\timing off

begin;

-- ═══ THE REAL ROLLBACK, EXECUTED — not a description of one ══════════════════════════
\i migrations/inverse/tails2_a_name_belongs_where_a_name_belongs_down.sql
\i migrations/inverse/tails2_a_formula_says_when_it_works_itself_out_down.sql

do $t$
declare
  v_org    constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_card   uuid;
  v_raw    text;
  v_words  text;
  v_table  uuid;
  v_labour uuid;
  v_parts  uuid;
  v_fid    uuid;
  v_doc    jsonb;
  v_red    integer := 0;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
  perform set_config('app.actor_system', 'campaign-test/tails2_red', true);
  perform set_config('request.jwt.claims',
    '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  select r.id, r.data ->> 'room' into v_card, v_raw
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_quotes and r.deleted_at is null
     and nullif(r.data ->> 'room', '') is not null
   order by r.created_at limit 1;

  -- ══ RED 1 — THE PUBLIC PAGE PRINTS THE ROOM'S ID ═════════════════════════════════════
  v_words := custom.portal_record_title(v_org, v_card);
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_red := v_red + 1;
    raise notice 'RED 1 — on the pre-TAILS-2 bytes custom.portal_record_title answers "%", on a PUBLIC page. As expected.', v_words;
  else
    raise exception 'RED 1 DID NOT GO RED: the old bytes answered "%" — this twin proves nothing', v_words;
  end if;

  -- ══ RED 2 — THE RELATION CHIP THE STORE ANSWERS ══════════════════════════════════════
  v_words := platform.relation_label(v_org, 'record', v_card);
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    v_red := v_red + 1;
    raise notice 'RED 2 — platform.relation_label answers "%". As expected.', v_words;
  else
    raise exception 'RED 2 DID NOT GO RED: the old bytes answered "%"', v_words;
  end if;

  -- ══ RED 3 — THE SHARE DIALOG ═════════════════════════════════════════════════════════
  v_words := custom.share_subject_name(v_org, 'record', v_card);
  if v_words ~ '^[0-9a-f]{8}' then
    v_red := v_red + 1;
    raise notice 'RED 3 — custom.share_subject_name answers "%". As expected.', v_words;
  else
    raise exception 'RED 3 DID NOT GO RED: the old bytes answered "%"', v_words;
  end if;

  -- ══ RED 4 — THE RESOLVER ITSELF IS GONE ══════════════════════════════════════════════
  begin
    perform custom.record_words(v_org, v_card);
    raise exception 'RED 4 DID NOT GO RED: custom.record_words still exists after its own inverse ran';
  exception when undefined_function then
    v_red := v_red + 1;
    raise notice 'RED 4 — custom.record_words does not exist on the old bytes. As expected.';
  end;

  -- ══ RED 5 — THE DOOR TOLD `compute_on` ANSWERS SUCCESS AND CHANGES NOTHING ═══════════
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name',           'budget lines (red twin)',
    'slug',           'home_renovation_budget_lines_red',
    'type',           'entity',
    'weight',         'light',
    'display',        'list',
    'ordered',        false,
    'parent_id',      '254f6db3-cb3e-404a-bca4-c38e520646c1',
    'row_order',      'manual',
    'title_field',    'line_name',
    'default_sort',   jsonb_build_array(jsonb_build_object('field','line_name','direction','asc')),
    'label_plural',   'budget lines',
    'label_singular', 'budget line',
    'agent_writable', true,
    'retention_days', 365,
    'fields', jsonb_build_array(
      jsonb_build_object('name','line_name'), jsonb_build_object('name','labour'),
      jsonb_build_object('name','parts'),     jsonb_build_object('name','line_total'))));
  perform custom.field_declare(v_org, v_table,
    jsonb_build_object('key','line_name','label','What it is for','type','text'));
  v_labour := custom.field_declare(v_org, v_table,
    jsonb_build_object('key','labour','label','Labour','type','number'));
  v_parts := custom.field_declare(v_org, v_table,
    jsonb_build_object('key','parts','label','Materials','type','number'));
  v_fid := custom.field_declare(v_org, v_table,
    jsonb_build_object('key','line_total','label','Line total','type','formula',
      'expr', jsonb_build_object('op','add','args',
        jsonb_build_array(jsonb_build_object('field', v_labour),
                          jsonb_build_object('field', v_parts)))));

  perform custom.field_update(v_org, v_fid, '{"compute_on":"write"}'::jsonb);
  v_doc := custom.read_record(v_org, v_fid, false);
  if coalesce(v_doc ->> 'compute_on', '') = 'write' then
    raise exception 'RED 5 DID NOT GO RED: the old bytes applied compute_on';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 — the old custom.field_update returned the field id, reported success, and the column still reads compute_on "%". As expected.',
    coalesce(v_doc ->> 'compute_on', '(absent)');

  -- ══ RED 6 — AND IT DOES NOT EVEN REFUSE THE IMPOSSIBLE ═══════════════════════════════
  begin
    perform custom.field_update(v_org, v_labour, '{"compute_on":"write"}'::jsonb);
    v_red := v_red + 1;
    raise notice 'RED 6 — the old bytes accepted compute_on on a plain number column without a word. As expected.';
  exception when check_violation then
    raise exception 'RED 6 DID NOT GO RED: the old bytes already refused it';
  end;

  raise notice '% BLOCKS RED on the real bytes of both inverses.', v_red;
end;
$t$;

rollback;

-- ═══ AND THE ROLLBACK IS VERIFIED, OUTSIDE THE TRANSACTION ═══════════════════════════
do $v$
declare v_words text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'custom' and p.proname = 'record_words') then
    raise exception 'ROLLBACK FAILED: custom.record_words is still missing — the defect was left on the main database';
  end if;
  v_words := custom.portal_record_title('1a7fefc6-77e1-4c48-826f-003b1a2e17fd',
    (select r.id from custom.record r
      where r.organization_id = '1a7fefc6-77e1-4c48-826f-003b1a2e17fd'
        and r.table_id = '0e108f31-5078-48ec-9a15-b492baa414ba'
        and r.deleted_at is null and nullif(r.data ->> 'room', '') is not null
      order by r.created_at limit 1));
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception 'ROLLBACK FAILED: the public portal title is answering "%" again', v_words;
  end if;
  raise notice 'ROLLBACK VERIFIED — the resolver is back and the public title reads "%".', v_words;
end;
$v$;

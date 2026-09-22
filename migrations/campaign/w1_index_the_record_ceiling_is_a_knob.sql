-- target: branch,production
-- additive: yes
-- guard: custom/field_index_guard
--
-- W1-INDEX — REC-N-5's RECORD CEILING, PUBLISHED AS A KNOB (check C-5).
--
-- `w1_index_the_promotion_layer.sql` published REC-N-5's two ceilings as functions returning
-- literals. That is publication, and it is half the law: a ceiling that no organization can
-- move is a number an agent chose for every customer on earth. The campaign's rule is that a
-- behavioural choice is an organization-settable knob with a sensible default, so the
-- 150,000-record ceiling becomes exactly what `custom.containment_depth_ceiling` already is —
-- a platform default, an organization override, and a platform MAXIMUM the override cannot
-- pass.
--
-- WHY THE OVERLOAD RATHER THAN A REPLACEMENT. `custom.table_record_ceiling()` is zero-argument
-- and IMMUTABLE, and it is the right shape for the PLATFORM number: it is what the product
-- publishes when nobody has asked about a particular organization. A knob read is STABLE, not
-- IMMUTABLE, so it cannot live in that body without lying about its volatility. This file adds
-- the one-argument, STABLE sibling that answers for an organization, and leaves the published
-- platform number exactly where it was. Nothing is replaced, so this file carries no
-- `-- based-on:` header.
--
-- AND IT HAS A CONSUMER, because a knob nobody reads is a knob-shaped comment.
-- `custom.table_capacity(organization, table)` answers "how full is this Table" in the one
-- sentence a person asks it in — records, ceiling, remaining, and whether it is over — and it
-- is the function a UI, an import and a promotion all read instead of each choosing a number.
-- It is a READ: no write path pays for it, which is the reason the ceiling is not a per-insert
-- trigger. Counting 150,000 rows on every single insert to enforce a ceiling nobody is near is
-- the silent tax REC-N-2 exists to refuse.
--
-- IT IS THE SECOND OF TWO. `w1_index_the_record_ceiling_knob.sql` seeds the knob row and is
-- applied first; the judgement refuses one file carrying both `-- seeds-guards: yes` and
-- `-- guard:`. Both readers below fall back to the published platform number when the row is
-- missing, so the order is a preference rather than a dependency.
--
-- THE INVERSE: `migrations/inverse/w1_index_the_record_ceiling_is_a_knob_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- The organization's answer. Same shape as `custom.containment_depth_ceiling`, deliberately:
-- a default, an override, and a maximum the override is clamped to rather than refused at,
-- because a person who types a bigger number should get the biggest number they can have and
-- be able to read what it is.
create or replace function custom.table_record_ceiling(p_organization_id uuid)
  returns integer language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_platform_maximum constant integer := 1000000;  -- REC-N-5: settable up to here, never past it.
  v_knob             integer;
begin
  if p_organization_id is null then
    return custom.table_record_ceiling();
  end if;
  select nullif(platform.knob_resolve('custom', 'table_record_ceiling', p_organization_id)
                  #>> '{}', '')::integer
    into v_knob;
  if v_knob is null then
    return custom.table_record_ceiling();
  end if;
  return least(greatest(v_knob, 1), v_platform_maximum);
exception when others then
  -- An unseeded or unreadable knob is the PUBLISHED number, never an error and never zero:
  -- a ceiling that fails closed would tell an organization its empty Table is full.
  return custom.table_record_ceiling();
end $$;

comment on function custom.table_record_ceiling(uuid) is
  'REC-N-5: this organization''s record ceiling — the published 150,000 unless it set its own, '
  'clamped to the platform maximum of 1,000,000. The zero-argument sibling is the published '
  'platform number and stays IMMUTABLE so it can be read from an index expression.';

create or replace function custom.table_capacity(p_organization_id uuid, p_table_id uuid)
  returns jsonb language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_records bigint;
  v_ceiling integer := custom.table_record_ceiling(p_organization_id);
begin
  select count(*) into v_records
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.deleted_at is null;

  return jsonb_build_object(
    'records',   v_records,
    'ceiling',   v_ceiling,
    'remaining', greatest(v_ceiling - v_records, 0),
    'over',      v_records > v_ceiling,
    'knob',      'custom/table_record_ceiling',
    'says',      case
                   when v_records > v_ceiling then
                     format('this table holds %s records, which is more than the %s it is set up for', v_records, v_ceiling)
                   else
                     format('this table holds %s of the %s records it is set up for', v_records, v_ceiling)
                 end);
end $$;

comment on function custom.table_capacity(uuid, uuid) is
  'REC-N-5: how full one Table is, in the sentence a person asks it in, against the ceiling '
  'their own organization is set to. The ONE reader of custom/table_record_ceiling, so no '
  'screen and no importer picks its own number.';

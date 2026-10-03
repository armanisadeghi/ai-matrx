-- inverse of lane7conf_c_every_door_answers_the_confidential_facts_honestly.sql. Puts the five patched
-- bodies back (each fragment asserted present once), restores lane7conf_a's INSERT/UPDATE trigger body,
-- drops the two per-column triggers, the column-write function and the overlay door. Values in
-- crm.party_confidential are untouched. Re-base before use if a later file replaced any of these bodies.
-- ground-standing-ok: b — order is c's inverse, then b's, then a's (a's drops crm.party_confidential_level and the trigger together).
-- window-class: two DROP TRIGGER on crm.party (ACCESS EXCLUSIVE, metadata only) + six bodies; run in the window.
-- based-on: custom.entity_record_read(uuid, text, uuid) 1bc030939fc20b8c52d212c176f03d5d1649b8fddc90cccd4c6678d05287c4ee
-- based-on: custom.entity_reference_rows(uuid, text, uuid[]) cf8e3bd437d8fb37990f8fbe86f63c5e0bc99378a2b988a34fb6ebb8ead2f793
-- based-on: platform.drill_rows(uuid, jsonb, jsonb) c83440432d5e0253a12f1ad5ee30799677cf0731a97dee2aa3f24e58ef614f1b
-- based-on: public.crm_merge_parties(uuid, uuid, text, text) ca8e920c5d99144f6aaab769e060eb190dbae03488ba307c65d33376327c71dd
-- based-on: public.crm_unmerge_parties(uuid) 57a835b032f4d22a7ffc2d76853b6de72442471a8bc92fe4492945900d4e0b88
-- based-on: crm._party_confidential_moves_aside() 4b22b459b7aa7057c466bba73a236c8611ba8e959448dbfa294e9a6120684c5b
-- (hashes are the clone's bodies with lane7conf_c applied; on production re-base with pnpm db:based-on before running)
set local lock_timeout = '3s';
CREATE OR REPLACE FUNCTION pg_temp.lane7conf_patch(p_fn regprocedure, p_anchor text, p_new text)
 RETURNS void LANGUAGE plpgsql AS $f$
declare v_def text := pg_get_functiondef(p_fn); v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  if v_n <> 1 then
    raise exception 'lane7conf_c inverse: % holds its anchor % time(s), not once; nothing was changed. Anchor: %', p_fn, v_n, p_anchor
      using errcode = '55000';
  end if;
  execute replace(v_def, p_anchor, p_new);
end $f$;

SELECT pg_temp.lane7conf_patch('public.crm_unmerge_parties(uuid)'::regprocedure,
$b$  -- LANE7-CONF-C: take back exactly the confidential facts the merge filled, if still unchanged.
  if jsonb_typeof(v_m.moved -> 'confidential_filled') = 'object' then
    update crm.party_confidential c
       set tax_id = case when c.tax_id is not distinct from (v_m.moved -> 'confidential_filled' ->> 'tax_id')
                         and v_m.moved -> 'confidential_filled' ? 'tax_id' then null else c.tax_id end,
           date_of_birth = case when c.date_of_birth is not distinct from (v_m.moved -> 'confidential_filled' ->> 'date_of_birth')::date
                         and v_m.moved -> 'confidential_filled' ? 'date_of_birth' then null else c.date_of_birth end,
           updated_at = now(), updated_by = (select auth.uid())
     where c.party_id = v_m.winner_id;
  end if;

  update crm.party set canonical_id = null where id = v_m.loser_id;$b$,
$a$  update crm.party set canonical_id = null where id = v_m.loser_id;$a$);

SELECT pg_temp.lane7conf_patch('public.crm_merge_parties(uuid,uuid,text,text)'::regprocedure,
$b$  -- LANE7-CONF-C: the loser's confidential facts fill the winner's EMPTY ones (the winner's own
  -- values win; a tax ID only onto a company, a date of birth only onto a person). What was filled is
  -- recorded so unmerge takes back exactly that.
  declare
    v_w record; v_l record; v_fill jsonb := '{}'::jsonb;
  begin
    select p.party_kind, c.tax_id, c.date_of_birth into v_w
      from crm.party p left join crm.party_confidential c on c.party_id = p.id where p.id = p_winner;
    select c.tax_id, c.date_of_birth into v_l from crm.party_confidential c where c.party_id = p_loser;
    if v_l.tax_id is not null and v_w.tax_id is null and v_w.party_kind = 'organization' then
      v_fill := v_fill || jsonb_build_object('tax_id', v_l.tax_id);
    end if;
    if v_l.date_of_birth is not null and v_w.date_of_birth is null and v_w.party_kind = 'person' then
      v_fill := v_fill || jsonb_build_object('date_of_birth', v_l.date_of_birth);
    end if;
    if v_fill <> '{}'::jsonb then
      insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
      values (p_winner, v_org, v_fill ->> 'tax_id', (v_fill ->> 'date_of_birth')::date, (select auth.uid()))
      on conflict (party_id) do update
         set tax_id        = coalesce(c.tax_id, excluded.tax_id),
             date_of_birth = coalesce(c.date_of_birth, excluded.date_of_birth),
             updated_at    = now(), updated_by = excluded.updated_by;
      v_moved := v_moved || jsonb_build_object('confidential_filled', v_fill);
    end if;
  end;

  update crm.party set canonical_id = p_winner where id = p_loser;$b$,
$a$  update crm.party set canonical_id = p_winner where id = p_loser;$a$);

SELECT pg_temp.lane7conf_patch('platform.drill_rows(uuid,jsonb,jsonb)'::regprocedure,
$b$  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  -- LANE7-CONF-C: a contact's confidential facts come from their own table, for their readers.
  if p_source ->> 'kind' = 'entity' and p_source ->> 'token' = 'party' then
    v_rows := crm.party_confidential_apply(v_rows);
  end if;$b$,
$a$  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';$a$);

SELECT pg_temp.lane7conf_patch('custom.entity_reference_rows(uuid,text,uuid[])'::regprocedure,
$b$    into v_out using p_ids, v_drop, p_token;
  -- LANE7-CONF-C: a contact's confidential facts come from their own table, for their readers.
  if p_token = 'party' then
    select coalesce(jsonb_object_agg(e.key, crm.party_confidential_apply(e.value)), '{}'::jsonb)
      into v_out from jsonb_each(v_out) e;
  end if;$b$,
$a$    into v_out using p_ids, v_drop, p_token;$a$);

SELECT pg_temp.lane7conf_patch('custom.entity_record_read(uuid,text,uuid)'::regprocedure,
$b$    -- LANE7-CONF-C: a contact's confidential facts come from their own table, for their readers.
    'columns', case when t.token = 'party'
                    then crm.party_confidential_apply((v_row - 'custom_fields') - v_excluded)
                    else (v_row - 'custom_fields') - v_excluded end,$b$,
$a$    'columns', (v_row - 'custom_fields') - v_excluded,$a$);

DROP TRIGGER IF EXISTS _zz_party_confidential_tax_id ON crm.party;
DROP TRIGGER IF EXISTS _zz_party_confidential_date_of_birth ON crm.party;
DROP FUNCTION IF EXISTS crm._party_confidential_column_write();

CREATE OR REPLACE FUNCTION crm._party_confidential_moves_aside()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tax text := nullif(btrim(new.tax_id), '');
  v_lvl text;
begin
  if v_tax is null and new.date_of_birth is null then
    new.tax_id := null;
    return new;
  end if;
  if v_tax is not null and new.party_kind <> 'organization' then
    raise exception 'A tax ID belongs to a company, not a person.' using errcode = '23514';
  end if;
  if new.date_of_birth is not null and new.party_kind <> 'person' then
    raise exception 'A date of birth belongs to a person, not a company.' using errcode = '23514';
  end if;
  if new.organization_id is null then
    raise exception 'A tax ID or date of birth is kept only on a contact that belongs to an organization.' using errcode = '22023';
  end if;
  if platform.is_client_channel() then
    v_lvl := crm.party_confidential_level(new.organization_id, new.created_by, new.assigned_to, auth.uid());
    if v_lvl is distinct from 'editor' then
      raise exception 'Only this contact''s confidential editors can change its tax ID or date of birth; an owner or admin of the organization can add you.' using errcode = '42501';
    end if;
  end if;
  insert into crm.party_confidential as c (party_id, organization_id, tax_id, date_of_birth, updated_by)
  values (new.id, new.organization_id, v_tax, new.date_of_birth, auth.uid())
  on conflict (party_id) do update
     set tax_id        = coalesce(excluded.tax_id, c.tax_id),
         date_of_birth = coalesce(excluded.date_of_birth, c.date_of_birth),
         updated_at    = now(),
         updated_by    = excluded.updated_by;
  new.tax_id := null;
  new.date_of_birth := null;
  return new;
end
$function$;

DELETE FROM platform.client_callable_door WHERE schema_name = 'crm' AND function_name = 'party_confidential_apply';
DROP FUNCTION IF EXISTS crm.party_confidential_apply(jsonb);

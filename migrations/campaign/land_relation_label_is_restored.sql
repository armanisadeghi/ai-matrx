-- chair-step: this REPLACES a live body, platform.relation_label, putting lane W1-REL's OWN BYTES back. They were stood down for 30 minutes by land_relation_label_waits_for_its_tables{,_v2,_v3}.sql because the two tables they name — custom.record and custom.external_link — did not exist on the main database yet, plpgsql_check therefore called the function broken, and `platform.provision` refuses to certify ANY table in schema `custom` while a dependent function is broken. Both tables now exist, so the original body is whole again and is restored byte for byte: this is `pg_get_functiondef` of the body as W1-REL left it, sha256 49dfdc3c869c1ef7afbcea10120b88238d4bb5a903877b6fe7c43437177d2ec4.
-- based-on: platform.relation_label(uuid, text, uuid) d304a3dbab2cff07288fd42c576e2546dbf92f0ae4a6f857f0b1c6b847b85ff2
--
-- LAND — platform.relation_label IS RESTORED.
--
-- Nothing of W1-REL's was lost and nothing of theirs was improved: the bytes below are the
-- ones read from the main database at 19:26 UTC, before the first replacement ran.

set lock_timeout = '5s';
set statement_timeout = '120s';

CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_title text;
  v_col   text;
  v_sch   text;
  v_tab   text;
begin
  -- REL-14. The label is READ, never stored on the edge: a stored label is a copy that goes
  -- stale the moment the target is renamed, and T4's "nothing migrates" depends on the chip
  -- following the record rather than a copy of its old name.
  if p_target_type = 'record' then
    -- A record of ours: the title is the value of ITS TABLE'S declared title field.
    select r.data ->> (t.data ->> 'title_field') into v_title
      from custom.record r
      join custom.record t on t.id = r.table_id
     where r.id = p_target_id and r.deleted_at is null
       and (r.organization_id = p_organization_id or r.data_class = 'kernel')
     limit 1;
    if v_title is null then
      -- W1-TIER's external stub keeps the cached title of a row that is not ours.
      select l.cached_title into v_title
        from custom.external_link l
       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    return v_title;
  end if;

  -- Any other registered token: the registry says which column carries its title, and it is
  -- read dynamically rather than guessed. A token with no title column has no label, and
  -- returning null is the honest answer - never the id wearing a name.
  select e.schema_name, e.table_name, nullif(e.title_column, '')
    into v_sch, v_tab, v_col
    from platform.entity_types e
   where e.token = p_target_type
   limit 1;
  if v_col is null or v_sch is null or v_tab is null then
    return null;
  end if;
  execute format('select %I::text from %I.%I where id = $1 limit 1', v_col, v_sch, v_tab)
    into v_title using p_target_id;
  return v_title;
end;
$function$

;

-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_relation_candidate(uuid, uuid, text[]) dd442ca5132f6b854aafd81a0f836936ddddb006b277d6416beb5009212ae3d9
--
-- LANE IMPORT — "NOT THIS TABLE" IS NOT A CONDITION WHEN THERE IS NO TABLE.
--
-- `import_a_table_that_does_not_exist_yet.sql` let the planning doors take a NULL table, so
-- a file could be judged before the table it is for exists — which is the case the product
-- is named after. Measured immediately afterwards: with a NULL table the relation arm found
-- nothing, ever. `custom.io_relation_candidate` excludes the table being planned with
-- `r.id <> p_table_id`, and `anything <> NULL` is NULL, which a WHERE treats as false — so
-- the candidate loop iterated over ZERO tables and answered "no relation here" with complete
-- confidence.
--
-- It is the same class W3-MIG's verdict found in `custom.field_dependants`: a NULL in a
-- predicate that reads as a quiet, plausible "no". There is nothing to exclude when there is
-- no table, and the condition now says that.

CREATE OR REPLACE FUNCTION custom.io_relation_candidate(p_organization_id uuid, p_table_id uuid, p_words text[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      record;
  v_title  text;
  v_hits   integer;
  v_words  integer := cardinality(coalesce(p_words, array[]::text[]));
begin
  if v_words < 2 then
    return null;
  end if;
  for v_t in
    select r.id, r.data ->> 'title_field' as title_field
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.deleted_at is null
       -- NULL MEANS "THIS TABLE DOES NOT EXIST YET", AND `r.id <> NULL` IS NULL, WHICH A
       -- WHERE TREATS AS FALSE — so this loop saw ZERO candidate tables for exactly the
       -- case the previous file opened, and the one arm that turns a flat file into a
       -- database answered "no" silently every time. The same NULL-comparison class the
       -- W3-MIG verdict found in custom.field_dependants. There is no table to exclude when
       -- there is no table.
       and (p_table_id is null or r.id <> p_table_id)
       and nullif(r.data ->> 'title_field', '') is not null
     order by r.created_at desc
     limit 40
  loop
    -- THE WALL, PER CANDIDATE. A Table this person cannot open is not a suggestion this
    -- person gets, and the refusal is swallowed here rather than ending the inference:
    -- "you may not see that one" is not an error in an answer about a file.
    begin
      perform custom.assert_may_know_table(p_organization_id, v_t.id, 'custom.io_relation_candidate');
    exception when others then
      continue;
    end;
    v_title := v_t.title_field;
    select count(distinct r.data ->> v_title) into v_hits
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = v_t.id
       and r.data_class = 'record'
       and r.deleted_at is null
       and r.data ->> v_title = any (p_words);
    if v_hits = v_words then
      return v_t.id;
    end if;
  end loop;
  return null;
end;
$function$

;

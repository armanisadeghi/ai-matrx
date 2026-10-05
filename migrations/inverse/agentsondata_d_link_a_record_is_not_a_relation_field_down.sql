-- lane: AGENTS-ON-DATA
-- Inverse of agentsondata_d: the trigger body before it.

set local statement_timeout = '30s';

CREATE OR REPLACE FUNCTION custom._store_relation_edge_names_its_field()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- Only edges OUT OF the record store. Every other subsystem's associations are none of
  -- this store's business, and they are the 85,354 rows that legitimately name no field.
  if new.source_type <> 'record' then
    return new;
  end if;
  if new.relation_field_id is not null then
    return new;
  end if;
  -- The STRUCTURAL roles are not relation fields: `contains` is REC-7's parent, `home` is
  -- REC-26's placement and `references` is REL-6's carrying link. They are declared in
  -- custom.carrying_rule, which is the one table that says what a role conveys, so this
  -- reads that table rather than keeping a second list of the same three words.
  if exists (select 1 from custom.carrying_rule cr where cr.role = new.role) then
    return new;
  end if;

  raise exception 'a relation on a record has to say which field it came from, and "%" does not',
    custom.said(new.role, '<no role>')
    using errcode = '23514',
          hint = 'REL-10 / T7: a relation is an association whose `role` IS the field key and whose relation_field_id IS that field. Without the field, nothing can read what the relation does when its target is deleted, how many targets it allows, or which tables it may point at — so the delete rules, the cardinality and the organization wall all silently do nothing. Write the relation value through the record store (custom.record_write / custom.record_update) and the edge is written for you, or call platform.relation_set, which names the field itself.';
end;
$function$;

-- chair-step: the inverse of
--   migrations/campaign/oldtables_w7c_both_halves_of_the_relation_guard_judge_what_commits.sql.
--   Restores the previous body of custom._relation_halves_agree() byte for byte (the value
--   half reads NEW again). ACCESS SHARE on no table.
-- based-on: custom._relation_halves_agree() 6e2af5496481bef2dce559f55549f8162b78b36cc8f0592e5a0afc2ba846970f
-- lock: platform
-- lane: OLD-TABLES-4

CREATE OR REPLACE FUNCTION custom._relation_halves_agree()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rec       custom.record%rowtype;
  v_missing   text;
  v_implied   boolean;
  v_org       uuid;
  v_source    uuid;
  v_target    uuid;
  v_role      text;
  v_going     boolean;   -- is this edge on its way OUT (hard delete or soft delete)?
begin
  -- ── THE VALUE HALF ────────────────────────────────────────────────────────────────────
  -- Every edge this record's document implies must have a live association by COMMIT.
  if tg_table_schema = 'custom' then
    select string_agg(format('%L → %s', e.edge_role, e.target_id), ', ' order by e.edge_role)
      into v_missing
      from custom.record_relation_edges(new.organization_id, new.id, new.table_id,
                                        new.data_class, new.data, new.deleted_at) e
     where not exists (
             select 1
               from platform.associations a
              where a.source_type = 'record'
                and a.source_id   = new.id
                and a.target_type = 'record'
                and a.target_id   = e.target_id
                and a.role        = e.edge_role
                and a.deleted_at is null);

    if v_missing is not null then
      raise exception
        using errcode = '23514',
              message = format(
                'a relation landed its VALUE with no association beside it — record %s names %s',
                new.id, v_missing),
              detail  = 'REL-11, corrected under DD-023: a relation''s value is the target''s id and the '
                     || 'edge is an association written in the same transaction. Neither is derived from '
                     || 'the other, and neither may land alone.',
              hint    = 'Write the edge in the same transaction, or let the store''s own '
                     || 'zz_w2a_relation_association_s_* triggers write it — do not disable them.';
    end if;
    return null;
  end if;

  -- ── THE EDGE HALF ─────────────────────────────────────────────────────────────────────
  -- Only a RELATION edge is ours: one that names the field it came from. Every other kind of
  -- association on this table (containment, surface bindings, lineage) is somebody else's law.
  if coalesce(new.relation_field_id, old.relation_field_id) is null then
    return null;
  end if;

  v_org    := coalesce(new.organization_id, old.organization_id);
  v_source := coalesce(new.source_id, old.source_id);
  v_target := coalesce(new.target_id, old.target_id);
  v_role   := coalesce(new.role, old.role);
  v_going  := (tg_op = 'DELETE') or (new.deleted_at is not null);

  if coalesce(new.source_type, old.source_type) <> 'record'
     or coalesce(new.target_type, old.target_type) <> 'record' then
    return null;
  end if;

  select r.* into v_rec
    from custom.record r
   where r.organization_id = v_org
     and r.id = v_source;

  v_implied := found and exists (
    select 1
      from custom.record_relation_edges(v_rec.organization_id, v_rec.id, v_rec.table_id,
                                        v_rec.data_class, v_rec.data, v_rec.deleted_at) e
     where e.target_id = v_target
       and e.edge_role = v_role);

  if not v_going and not v_implied then
    raise exception
      using errcode = '23514',
            message = format(
              'a relation''s ASSOCIATION landed with no value beside it — record %s has no %L holding %s',
              v_source, v_role, v_target),
            detail  = 'REL-11, corrected under DD-023: the value and the edge are two halves of one fact '
                   || 'and can never disagree. An edge with no cell behind it is an index of something '
                   || 'nobody wrote.',
            hint    = 'Write the id into the record''s own document under the field''s key in the same '
                   || 'transaction, and the store''s triggers will write this edge for you.';
  end if;

  if v_going and v_implied then
    raise exception
      using errcode = '23514',
            message = format(
              'a relation''s ASSOCIATION was removed while its VALUE still names the record — record %s '
              || 'still holds %s under %L',
              v_source, v_target, v_role),
            detail  = 'REL-11, corrected under DD-023: neither half is derived from the other, so removing '
                   || 'the edge alone leaves a cell the index cannot find.',
            hint    = 'Clear the id from the record''s document in the same transaction.';
  end if;

  return null;
end;
$function$;

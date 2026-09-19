-- chair-step: the inverse of visfix_containment_reaches_the_ladder.sql. It DROPS the trigger and the two
--   functions that file created and puts custom.containment_edges back on data.parent_id. A DROP is refused
--   by the production allow-list by name, which is exactly right for a forward file and exactly wrong for
--   the reversal of one, so the reversal is named, printed in full and run only when the command names it.
-- based-on: custom.containment_edges(uuid) 27cd36b9978b28853617f295a6143438208384b9cf0c051ba4c547eaef38e2fb
-- VIS-FIX — THE INVERSE of `visfix_containment_reaches_the_ladder.sql`.
--
-- It takes the trigger off `custom.record` and puts `custom.containment_edges` back on
-- `data.parent_id`, byte-for-byte the body that was live on the main database before the
-- forward file ran. After this the store is exactly as broken as it was: containment does not
-- reach the ladder.
--
-- IT DOES NOT DELETE THE BACKFILLED EDGES. They are true statements about the graph — "this
-- record is inside that one" — written into the platform's one association store, read by the
-- platform's own reachability and retired with their records by
-- `platform._gc_entity_associations`. Removing them would be the destructive half of a
-- reversal that has no destructive half.

drop trigger if exists zz_w2_containment_association on custom.record;

create or replace function custom.containment_edges(p_organization_id uuid)
 returns table(parent_id uuid, child_id uuid, via text)
 language sql
 stable
 set search_path to 'pg_catalog'
as $$
  -- contained records: the containment tree (REC-7, REC-8, REC-10)
  select custom.containment_parent(r.data), r.id, 'contained'::text
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and custom.containment_parent(r.data) is not null
  union all
  -- referenced CARRYING relations, from this record to its target (REC-10, REC-26): a
  -- carrying relation reaches what it points at, which is what makes an additional Home
  -- reachable from the Home record without the Table being contained by it.
  select (r.data ->> 'from')::uuid, (r.data ->> 'to')::uuid, 'carrying'::text
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'relation'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'from' is not null
     and r.data ->> 'to' is not null;
$$;

drop function if exists custom._containment_association();
drop function if exists custom.record_carrying_edges(uuid, text, jsonb, timestamptz);

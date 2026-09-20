-- target: branch,production
-- additive: yes
--   It REPLACES the two bodies that answer "what carries this record" — `custom.carrying_edges_in`
--   and `custom.carrying_edges_of` — adding ONE arm to each and changing not a character of the
--   arms already there. Both carry a `-- based-on:` line. Nothing is dropped, revoked or moved.
--   The inverse is `migrations/inverse/portal_the_field_that_names_the_client_is_what_carries_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.carrying_edges_in(uuid) d32ae56386962ca9985fb90ceec5312fb3c62a0ab6f75cd4565b111be409df1b
-- based-on: custom.carrying_edges_of(text, uuid) 41731794c1ae3891408e36484ed61083e413165a9e9a01f75992376f514bd3eb
--
-- PORTAL — THE ASSOCIATION IS THE ANSWER, AND IT IS ALREADY THERE.
--
-- When a Job names a client in a relation Field, the store ALREADY writes the edge:
-- `custom._relation_associations` inserts a `platform.associations` row whose `source_id` is
-- the Job, whose `target_id` is the client's record, and whose `relation_field_id` is that
-- Field. That row exists today, on every record of every relation Field, written by a trigger
-- nobody has to remember.
--
-- So a portal adds NO edge and NO query. It says which of those existing edges CARRIES, and
-- these two arms are the whole of that sentence: the record the Field POINTS AT is the
-- container, the record HOLDING the Field is the item, and what it conveys is what the portal
-- declared. Give the client `viewer` on her own record — one grant, written by
-- `custom.share_grant`, the one share door — and every Job and Invoice naming it is hers,
-- through the same ladder a record inside a record is reached by. A Job written five minutes
-- from now reaches her with nothing re-run; a Job that stops naming her stops reaching her in
-- the same statement that changes the Field.
--
-- WHY IT MATCHES ON `relation_field_id` AND NOT ON THE ROLE. `custom.carrying_rule`'s three
-- existing rows match `cr.role = a.role`, and a role is the FIELD KEY (REL-10). "client" is a
-- field key a hundred organizations will choose, and a rule keyed on it would make every one
-- of their `client` relations carrying — a silent widening in organizations that never heard
-- of a portal. `relation_field_id` is one Field of one Table of one organization, so this arm
-- can only ever speak about the portal that declared it. That is also why this file does not
-- add a row to `custom.carrying_rule`: the rule table is right for a rule ABOUT A ROLE, and
-- wrong for a rule about one organization's Field.
--
-- COST. `carrying_edges_of` is on the hot ladder — it is called once per node of
-- `custom.visibility_ancestors`. The added arm is an index probe on
-- `platform.associations (source_type, source_id)`, which every other arm of that function
-- already makes, joined to `custom.portal_table` by primary-key-shaped lookup on
-- `names_via_field_id`. In an organization with no portal the join finds nothing and stops.

-- The one index the new arms read. Declared before the bodies that read it, so the plan is
-- never a sequential scan of the portal tables on the visibility path.
create index if not exists portal_table_names_via_idx
  on custom.portal_table (names_via_field_id);

create or replace function custom.carrying_edges_in(p_organization_id uuid)
returns table(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
language sql
stable security definer
set search_path to ''
as $function$
  -- arm 1 — platform.containment_edges
  select case when r.container_side = 'source' then a.source_type else a.target_type end,
         case when r.container_side = 'source' then a.source_id   else a.target_id   end,
         case when r.container_side = 'source' then a.target_type else a.source_type end,
         case when r.container_side = 'source' then a.target_id   else a.source_id   end,
         r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type
     and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null
     and r.is_active
     and r.container_side = any (array['source', 'target'])
     and (a.organization_id = p_organization_id or a.organization_id is null)
  union
  -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
  select case when cr.container_side = 'source' then a.source_type else a.target_type end,
         case when cr.container_side = 'source' then a.source_id   else a.target_id   end,
         case when cr.container_side = 'source' then a.target_type else a.source_type end,
         case when cr.container_side = 'source' then a.target_id   else a.source_id   end,
         cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr
      on cr.role = a.role
     and cr.is_active
   where a.deleted_at is null
     and (a.organization_id = p_organization_id or a.organization_id is null)
  union
  -- arm 3 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The record the Field points at is
  -- the container; the record holding the Field is the item. This is what makes "only theirs"
  -- answerable without a per-portal query: an outsider holding her own client record reaches
  -- exactly the records that name it, at the level the portal declared, through the same
  -- ladder as everything else on this platform.
  select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
    from platform.associations a
    join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
    join custom.portal p on p.id = pt.portal_id and p.is_active
   where a.deleted_at is null
     and a.organization_id = p_organization_id
     and pt.organization_id = p_organization_id
     and a.source_type = 'record'
     and a.target_type = 'record';
$function$;

create or replace function custom.carrying_edges_of(p_item_type text, p_item_id uuid)
returns table(container_type text, container_id uuid, conveys_max permission_level)
language sql
stable security definer
set search_path to ''
as $function$
  -- arm 1a — platform.containment_edges, the rule whose SOURCE is the container
  select a.source_type, a.source_id, r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null and r.is_active and r.container_side = 'source'
     and a.target_type = p_item_type and a.target_id = p_item_id
  union
  -- arm 1b — the same rule table, the rule whose TARGET is the container
  select a.target_type, a.target_id, r.conveys_max
    from platform.associations a
    join platform.association_types r
      on r.source_type = a.source_type and r.target_type = a.target_type
     and (r.label is null or r.label = a.label)
   where a.deleted_at is null and r.is_active and r.container_side = 'target'
     and a.source_type = p_item_type and a.source_id = p_item_id
  union
  -- arm 2a — custom.carrying_rule, source side
  select a.source_type, a.source_id, cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr on cr.role = a.role and cr.is_active
   where a.deleted_at is null and cr.container_side = 'source'
     and a.target_type = p_item_type and a.target_id = p_item_id
  union
  -- arm 2b — custom.carrying_rule, target side
  select a.target_type, a.target_id, cr.conveys_max
    from platform.associations a
    join custom.carrying_rule cr on cr.role = a.role and cr.is_active
   where a.deleted_at is null and cr.container_side = 'target'
     and a.source_type = p_item_type and a.source_id = p_item_id
  union
  -- arm 3 — THE TABLE A RECORD LIVES IN (SHARED-ONLY, 2026-09-19). Every arm above reads
  -- `platform.associations`; this one is not there to read, because a record's Table is the
  -- `table_id` COLUMN of the record itself. Sharing a Table is the most ordinary thing a
  -- person does on this store and it conveyed NOTHING before this line: under `shared_only`
  -- a colleague shared a whole table at Admin opened it and saw zero rows.
  --
  -- `admin` is the same `conveys_max` the `contains` and `home` rules already carry, so a
  -- Table shared at Viewer conveys viewer and one shared at Admin conveys admin — the
  -- MINIMUM along the path decides (VIS-3), exactly as for a record inside a record.
  --
  -- THE SAME-ORGANISATION JOIN IS THE GUARD, not decoration. The kernel Tables (`Table`,
  -- `Field`, and the home-record kernel every fixture hangs off) live in the SYSTEM
  -- organization, which is global_readable, so a Table row (whose own `table_id` is the
  -- kernel `Table`) and a Field row (whose `table_id` is the kernel `Field`) produce no edge
  -- here: nobody is ever carried by the Table-of-all-Tables. `r.table_id <> r.id` is the
  -- second: the kernel `Table` row's `table_id` IS itself.
  select 'record'::text, r.table_id, 'admin'::public.permission_level
    from custom.record r
    join custom.record t
      on t.id = r.table_id
     and t.organization_id = r.organization_id
     and t.deleted_at is null
   where p_item_type = 'record'
     and r.id = p_item_id
     and r.table_id is not null
     and r.table_id <> r.id
     and r.deleted_at is null
     -- THE ROW'S OWN VISIBILITY IS THE BOUNDARY, and dropping it would be a LEAK, not a
     -- widening. `personal` is below every organization lane the access kernel runs (DD-136:
     -- the org arms honour the row's own `visibility`), so a row somebody marked personal is
     -- reached by a grant and by its creator and by nothing else. Carrying it on a TABLE share
     -- would hand every member of every `all_records` organization — who already reaches every
     -- Table — every personal row in it, which is the opposite of what this file is for.
     and r.visibility >= 'internal'::platform.visibility
  union
  -- arm 4 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The mirror of arm 3 of
  -- `custom.carrying_edges_in`, asked from the item's side: this Job names a client, that
  -- client's record is its container, and what it conveys is what the portal declared. It
  -- matches on `relation_field_id` — one Field of one Table of one organization — and never
  -- on the role, because a role is a field key and "client" is a word a hundred organizations
  -- will use.
  select 'record'::text, a.target_id, pt.conveys_max
    from platform.associations a
    join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
    join custom.portal p on p.id = pt.portal_id and p.is_active
   where a.deleted_at is null
     and p_item_type = 'record'
     and a.source_type = 'record'
     and a.source_id = p_item_id
     and a.target_type = 'record';
$function$;

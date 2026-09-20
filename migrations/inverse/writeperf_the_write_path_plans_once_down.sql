-- inverse of writeperf_the_write_path_plans_once.sql
-- WHAT IT DOES NOT UNDO: nothing. Every body below is the LANGUAGE sql body read out of the
-- live catalogue immediately before the file was applied, byte for byte, so running this puts
-- all seven back to being re-planned on every call. No data was written, so none is lost.

CREATE OR REPLACE FUNCTION custom.io_changed_field_ids(p_organization_id uuid, p_table_id uuid, p_old jsonb, p_new jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- `custom.applicable_fields` is the platform's one answer to "which Fields does this Table
  -- have". Joining on key alone matched every Table's Field of the same name.
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
    from unnest(custom.io_changed_keys(p_old, p_new)) k
    join custom.applicable_fields(p_organization_id, p_table_id, null) f
      on (f.data ->> 'key') = k;
  -- It reads no knob of its own: it is payload for an event the trigger above only writes
  -- after custom.assert_store_door has resolved custom/system_enabled.
$function$;

CREATE OR REPLACE FUNCTION custom.organization_references(p_kind text, p_organization_id uuid, p_row jsonb)
 RETURNS TABLE(site text, what text, ref_id uuid, openable boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- THE CENSUS. One row per id the store accepts that must resolve inside the organization.
  -- `openable` marks the one site REC-29's "unless the Table allows it" can open.
  --
  -- custom.record — the Table a record belongs to.
  select 'table_id', 'the table this record belongs to',
         nullif(p_row ->> 'table_id', '')::uuid, false
   where p_kind = 'custom.record'

  union all
  -- custom.record — the two ends of a relation row (REC-26). THE OPENABLE SITE.
  select 'data.' || e.k, case e.k when 'from' then 'the record this relation starts at'
                                  else 'the record this relation points at' end,
         nullif(p_row -> 'data' ->> e.k, '')::uuid, true
    from (values ('from'), ('to')) e(k)
   where p_kind = 'custom.record' and p_row ->> 'data_class' = 'relation'

  union all
  -- custom.record — a Field's declared relation target (FLD-13), and a list Field's options
  -- Table (FLD-5), and the Table a Field defines (FLD-8).
  select 'data.' || e.k, e.w, nullif(p_row -> 'data' ->> e.k, '')::uuid, false
    from (values ('relation_target',      'the table this relation field points at'),
                 ('entity_definition_id', 'the table this field belongs to'),
                 ('scope_table_id',       'the table this rule is about'),
                 ('target_field_id',      'the field this rule works out'),
                 ('rule_id',              'the rule this merge field uses')) e(k, w)
   where p_kind = 'custom.record'

  union all
  select 'data.config.options_table_id', 'the table this list field takes its choices from',
         nullif(p_row -> 'data' -> 'config' ->> 'options_table_id', '')::uuid, false
   where p_kind = 'custom.record'

  union all
  -- custom.record — every Field a Rule's expression reaches for, by id (REC-17).
  select 'data.expr.field', 'a field this rule reads', (l ->> 'field')::uuid, false
    from jsonb_path_query(coalesce(p_row -> 'data' -> 'expr', '{}'::jsonb),
                          '$.**{0 to 12} ? (exists(@.field))') l
   where p_kind = 'custom.record'
     and jsonb_typeof(l -> 'field') = 'string'
     and (l ->> 'field') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

  union all
  -- custom.external_link — the stub Record it stands for and the source it came from.
  select 'record_id', 'the record this external link stands for',
         nullif(p_row ->> 'record_id', '')::uuid, false
   where p_kind = 'custom.external_link'
  union all
  select 'source_id', 'the external source this link came from',
         nullif(p_row ->> 'source_id', '')::uuid, false
   where p_kind = 'custom.external_link';
  -- custom.external_source carries no reference into the store: its columns are the
  -- connection token, the foreign schema and table, and the link template. It is listed here
  -- in words rather than omitted, so the next reader knows it was looked at.
$function$;

CREATE OR REPLACE FUNCTION custom.query_is_store_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select pg_has_role(custom.caller_role(),
                     (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                     'member');
$function$;

CREATE OR REPLACE FUNCTION custom.record_carrying_edges(p_id uuid, p_data_class text, p_data jsonb, p_deleted_at timestamp with time zone)
 RETURNS TABLE(container_id uuid, item_id uuid, edge_role text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- arm 1 — REC-7 / REC-14: the parent IS the containment edge, and there is at most one.
  select custom.containment_parent(p_data), p_id, 'contains'::text
  where p_deleted_at is null
    and p_id is not null
    and custom.containment_parent(p_data) is not null
  union all
  -- arm 2 — REC-26 / REL-6: a referenced CARRYING relation reaches what it points at, so the
  -- `from` end is the container and the `to` end is the item. Its declared role is honoured
  -- when `custom.carrying_rule` knows it (that table is what decides how much a role conveys);
  -- a role nobody declared falls back to `references`, the rule for a plain referenced
  -- relation, rather than producing an edge `custom.carrying_edges` would drop in silence.
  select (p_data ->> 'from')::uuid,
         (p_data ->> 'to')::uuid,
         case
           when exists (select 1 from custom.carrying_rule cr
                         where cr.role = (p_data ->> 'role') and cr.is_active)
             then p_data ->> 'role'
           else 'references'
         end
  where p_deleted_at is null
    and p_data_class = 'relation'
    and coalesce((p_data ->> 'carrying')::boolean, false)
    and coalesce(p_data ->> 'kind', 'referenced') <> 'owned'
    and p_data ->> 'from' is not null
    and p_data ->> 'to' is not null;
$function$;

CREATE OR REPLACE FUNCTION custom.record_relation_edges(p_organization_id uuid, p_id uuid, p_table_id uuid, p_data_class text, p_data jsonb, p_deleted_at timestamp with time zone)
 RETURNS TABLE(target_id uuid, edge_role text, field_id uuid, ord integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- REL-10: the role IS the field key, and REL-11: nothing about the relation is stored in
  -- the value — the value is only WHICH record, and every property of the relation is read
  -- from the Field. A key that holds something which is not a uuid is not an edge; it is
  -- reported by the backfill's census rather than guessed at.
  --
  -- SEAT-SUITES 2026-09-19: ONE EDGE PER (target, role). A relation that names the same
  -- record twice states one fact twice, and the writer downstream of this reader does an
  -- `on conflict … do update`, which Postgres refuses outright when one command proposes the
  -- same key twice — so without this the record could not be written at all.
  select distinct on (e.target_id, e.edge_role)
         e.target_id, e.edge_role, e.field_id, e.ord
    from (
      select (t.val #>> '{}')::uuid as target_id,
             coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as edge_role,
             f.id as field_id,
             case when coalesce((f.data -> 'config' ->> 'ordered')::boolean, false)
                  then t.ord::integer else null end as ord,
             t.ord as seq
        from custom.record f
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'array'
              then p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')
            when jsonb_typeof(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name')) = 'string'
              then jsonb_build_array(p_data -> coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'))
            else '[]'::jsonb
          end) with ordinality as t(val, ord)
       where p_deleted_at is null
         and p_id is not null
         and p_table_id is not null
         and coalesce(p_data_class, '') = 'record'
         and f.deleted_at is null
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.organization_id = p_organization_id
         and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_table_id
         and f.data ->> 'type' = 'relation'
         and (t.val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) e
   order by e.target_id, e.edge_role, e.seq;
$function$;

CREATE OR REPLACE FUNCTION iam.has_org_access(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER COST 5000
 SET search_path TO 'public'
AS $function$
  SELECT iam.has_org_access_for((SELECT auth.uid()), p_org);
$function$;

CREATE OR REPLACE FUNCTION platform.is_provisioning()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- pg_current_xact_id_if_assigned() (never pg_current_xact_id()) so a read-only
  -- transaction is not forced to burn a transaction id just to answer "no".
  select coalesce(
           (select m.active
              from platform.provision_marker m
             where m.txid = pg_current_xact_id_if_assigned()),
           false)
$function$;

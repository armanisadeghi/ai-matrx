-- chair-step: this replaces the body of custom.computed_provenance, a live client door, so the judge cannot read what the statement will do from its allow-list
-- based-on: custom.computed_provenance(uuid, uuid) 3a2dd92d07f7135680eb83b393c8d1906afc6d62eb7b0f982d33f5c09b8af9cf
--
-- SHARE-OUT item 2, third and last half — THE DEFAULT CASE HAD NO FOOTNOTE EITHER.
--
-- MEASURED. `custom._field_document_for` defaults `compute_on` to **'read'** for every
-- formula and lookup, and forces 'read' for every rollup (a write-stamped rollup would be
-- stale the moment a contained record changed). So the overwhelming majority of worked-out
-- columns in this platform are worked out AT READ TIME and are never stamped into
-- `_derived` at all. A footnote that read only the two stored blocks answered "nothing was
-- worked out here" about the ordinary case — the one a person meets every day.
--
-- Proved on Ironclad Mobile Mechanic's Invoices: declaring Total as LABOUR + PARTS through
-- `custom.field_update` from the owner's own seat produces `compute_on: "read"`, the
-- record's Total is worked out on every read, and the previous body returned 0 rows for it.
--
-- WHAT CHANGES. The footnote now names EVERY worked-out column of the record, from the
-- three places a worked-out value can come from, most specific first:
--
--   `_computed` — a RULE produced it. Carries `rule_id` and `rule_version`.
--   `_derived`  — the FIELD produced it AT WRITE TIME and the store stamped it.
--   read-time   — the FIELD produces it on every read (`compute_on = 'read'`). It is
--                 evaluated here, now, through `custom.derived_value` — the same evaluator
--                 the read path itself uses, never a second one — and `computed_at` is
--                 `now()`, which is the literal truth about a read-time value.
--
-- A key seen more than once is answered once, by the most specific account of it.
--
-- WHY `custom.derived_value` AND NOT A COPY: it is the one body that dispatches lookup,
-- rollup and formula, and it already re-raises a refusal or a cancellation rather than
-- swallowing it (a column that could not be worked out warns and answers null). Asking it
-- here means the footnote can never disagree with the value the record itself shows.
--
-- THE RETURN SHAPE IS UNCHANGED — same six columns, same types — so `@ai-matrx/records`
-- and `records-ui`'s Peek need no bump.
--
-- LEFT BEHIND, NAMED: `custom.field_update` builds its spec from a fixed key list that
-- does NOT carry `compute_on`, so a person who declares a write-stamped formula through
-- that door silently gets a read-time one. That is the field door's defect, not this one's;
-- it is recorded in `FOUND_DEFECTS.md` and this body is correct either way.
--
-- THE INVERSE: `migrations/inverse/shareout_footnote_read_time_down.sql`.

create or replace function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, rule_id uuid,
              rule_version integer, computed_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mask jsonb;
  v_rec  custom.record;
  v_type text;
  v_key  text;
begin
  -- THE SAME ORDER AS EVERY OTHER DOOR IN THIS STORE: the organization wall, then the row.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.computed_provenance');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.computed_provenance',
                                        'viewer'::public.permission_level, 'record');

  select r.* into v_rec from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    return;
  end if;

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  v_key := custom.table_type_field(p_organization_id, v_rec.table_id);
  if v_key is not null then
    v_type := v_rec.data ->> v_key;
  end if;

  return query
    with blocks as (
      -- 1. A RULE produced it: the most specific account there is, so it answers first.
      select 1 as rank, e.key as k,
             (e.value ->> 'field_id')::uuid            as fid,
             e.value -> 'value'                        as val,
             (e.value ->> 'rule_id')::uuid             as rid,
             (e.value ->> 'rule_version')::integer     as rver,
             (e.value ->> 'at')::timestamptz           as at
        from jsonb_each(coalesce(v_rec.data -> '_computed', '{}'::jsonb)) e
      union all
      -- 2. The FIELD produced it at write time and the store stamped it then.
      select 2, e.key,
             (e.value ->> 'field_id')::uuid,
             e.value -> 'value',
             null::uuid, null::integer,
             (e.value ->> 'at')::timestamptz
        from jsonb_each(coalesce(v_rec.data -> '_derived', '{}'::jsonb)) e
      union all
      -- 3. The FIELD produces it on every read — the store's own default for a formula,
      --    a lookup and every rollup. Worked out HERE, NOW, by the one evaluator.
      select 3, f.data ->> 'key',
             f.id,
             custom.derived_value(p_organization_id, p_record_id, f.data,
                                  v_rec.data - '_computed' - '_retired' - '_values'
                                             - '_sources' - '_derived'),
             null::uuid, null::integer,
             now()
        from custom.applicable_fields(p_organization_id, v_rec.table_id, v_type) f
       where custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
         and coalesce(f.data ->> 'compute_on', '') = 'read'
    ),
    one_per_key as (
      select distinct on (k) k, fid, val, rid, rver, at from blocks order by k, rank
    )
    select b.k,
           b.fid,
           -- THE MASK. The rule ran and that fact is not a secret; the value it produced
           -- for a field this reader may not see is.
           case when custom.mask_says_withheld(v_mask, b.k)
                then custom.withheld_marker(v_mask, b.k)
                else b.val end,
           b.rid,
           b.rver,
           b.at
      from one_per_key b;
end;
$fn$;

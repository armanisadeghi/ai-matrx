-- chair-step: this replaces the body of custom.computed_provenance, a live client door, so the judge cannot read what the statement will do from its allow-list
-- based-on: custom.computed_provenance(uuid, uuid) 52d6c67d01dc65589ea91f4cae443fc1bff7bd276a0664e0d26e49c63ab51bd1
--
-- SHARE-OUT item 2, second half — OPENING THE DOOR WAS NOT ENOUGH: IT READ AN EMPTY BLOCK.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-21, after the door was opened:
--
--   select count(*) filter (where data ? '_derived')  as derived,
--          count(*) filter (where data ? '_computed') as computed,
--          count(*)                                   as total
--     from custom.record;
--   ->  derived 1 | computed 0 | total 15156
--
-- `custom.computed_provenance` read `data -> '_computed'` and NOTHING ELSE. That block is
-- carried by ZERO of the store's 15,156 records. The block the store actually stamps when
-- it works a value out at write time is `_derived` — `custom._derived_fields()` writes it,
-- `custom.derived_values_of` reads it first, and `custom.computed_block` unwraps it.
--
-- So a door granted to every signed-in person would have answered "no columns were worked
-- out here" about every record in the platform, forever, and read as working. That is a
-- green screen over an unasked question, which is the exact failure the honest footnote
-- was written to avoid.
--
-- WHAT CHANGES. The footnote reads BOTH blocks, which is what "which rule computed this
-- value" honestly means in this store:
--
--   `_derived`  — the FIELD worked it out (a formula, a lookup or a rollup declared with
--                 compute_on = write). It carries `field_id`, `parity` and `at`. No Rule
--                 produced it, so `rule_id` and `rule_version` are NULL, which is the
--                 truthful answer and not a missing one.
--   `_computed` — W1-RULE's own computed block, carrying `rule_id` and `rule_version`.
--
-- A key in both is answered once, by `_computed`, because a Rule naming a version is the
-- more specific account of the same value.
--
-- The RETURN SHAPE IS UNCHANGED — same six columns, same types — so `@ai-matrx/records`
-- and `records-ui`'s Peek need no bump: `computedInPlainWords` reads `field_key`, `value`
-- and `computed_at` and never touches `rule_id`.
--
-- THE MASK IS UNCHANGED and now covers both blocks: a field this reader may not SEE hands
-- over `custom.withheld_marker` instead of its value, on either side of the union.
--
-- THE INVERSE: `migrations/inverse/shareout_footnote_both_blocks_down.sql`.

create or replace function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, rule_id uuid,
              rule_version integer, computed_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mask jsonb;
begin
  -- THE SAME ORDER AS EVERY OTHER DOOR IN THIS STORE: the organization wall, then the row.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.computed_provenance');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.computed_provenance',
                                        'viewer'::public.permission_level, 'record');

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  return query
    with blocks as (
      -- W1-RULE's block first: it names the Rule and its version, so where both blocks
      -- hold a key it is the one that answers.
      select 1 as rank, e.key as k, e.value as v
        from custom.record r,
             lateral jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = p_record_id
      union all
      -- What the FIELD worked out at write time. No Rule produced it and the row says so.
      select 2 as rank, e.key, e.value
        from custom.record r,
             lateral jsonb_each(coalesce(r.data -> '_derived', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = p_record_id
    ),
    one_per_key as (
      select distinct on (k) k, v from blocks order by k, rank
    )
    select b.k,
           (b.v ->> 'field_id')::uuid,
           case when custom.mask_says_withheld(v_mask, b.k)
                then custom.withheld_marker(v_mask, b.k)
                else b.v -> 'value' end,
           (b.v ->> 'rule_id')::uuid,
           (b.v ->> 'rule_version')::integer,
           (b.v ->> 'at')::timestamptz
      from one_per_key b;
end;
$fn$;

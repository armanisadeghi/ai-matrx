-- INVERSE of tails3_a_phone_number_may_be_written_the_way_people_write_it.sql
--
-- chair-step: it DROPS the three functions the forward file added, un-swaps two live
--   function bodies and rewrites stored Rule values back to the pattern that refuses
--   `(415) 555-0178`. Running it on the main database puts a customer-facing defect back,
--   so it runs only when the command names it.
--
-- Running it puts the defect back: `custom._field_document_for` writes
-- `^[+0-9][0-9 ()\-\.]{4,}$` again, `custom.io_infer_column` stops recognising a CSV column
-- of `(415) 555-0178` as phone numbers, every phone Field that was moved forward refuses a
-- leading `(` again, and the three new functions are gone — unless a LATER lane adopted
-- `custom.phone_pattern()`, in which case the three helpers are left standing and the file
-- says so on screen (see the note over the drops at the foot of this file).
--
-- ONE THING IT CANNOT UNDO EXACTLY, and it says so rather than pretending. Two old patterns
-- were live — `^[+0-9][0-9 ()\-\.]{4,}$` (12 Field rows) and `^[+]?[0-9 ().-]{7,20}$` (8 rows,
-- the kernel `contact_phone` spelling) — and the forward file collapsed both into one. On the
-- way down every migrated row is set to the FIRST of them, because the stored row no longer
-- records which it came from. The two behaved identically on every spelling a person writes
-- (both refused a leading parenthesis), so nothing observable is lost; a Rule somebody wrote
-- themselves was never touched in either direction.

-- ── the two function bodies, un-swapped ───────────────────────────────────────────────
do $unswap$
declare
  v_fn  oid  := to_regprocedure('custom._field_document_for(uuid,uuid,jsonb)');
  v_src text;
begin
  if v_fn is null then
    raise notice 'custom._field_document_for does not exist here; nothing to un-swap.';
    return;
  end if;
  v_src := pg_get_functiondef(v_fn);
  if position('custom.phone_pattern()' in v_src) = 0 then
    raise notice 'custom._field_document_for does not call custom.phone_pattern(); leaving it alone.';
  else
    execute replace(v_src,
      '''kind'', ''pattern'', ''value'', custom.phone_pattern()',
      '''kind'', ''pattern'', ''value'', ''^[+0-9][0-9 ()\-\.]{4,}$''');
  end if;
end;
$unswap$;

do $unswap$
declare
  v_fn  oid  := to_regprocedure('custom.io_infer_column(uuid,uuid,text,jsonb)');
  v_src text;
begin
  if v_fn is null then
    raise notice 'custom.io_infer_column does not exist here; nothing to un-swap.';
    return;
  end if;
  v_src := pg_get_functiondef(v_fn);
  if position('custom.phone_pattern()' in v_src) = 0 then
    raise notice 'custom.io_infer_column does not call custom.phone_pattern(); leaving it alone.';
  else
    execute replace(v_src, 'custom.phone_pattern()', '''^[+]?[0-9][0-9 ()./-]{6,19}$''');
  end if;
end;
$unswap$;

-- ── the rows, put back ────────────────────────────────────────────────────────────────
do $rows$
declare
  v_new text := '^(?=(?:[^0-9]*[0-9]){7,22}[^0-9]*$)[+]?[0-9 ().-]+(?:[ ]*(?:[eE][xX][tT][eE][nN][sS][iI][oO][nN]|[eE][xX][tT]\.?|[xX])[ ]*[0-9]{1,8})?$';
  v_old text := '^[+0-9][0-9 ()\-\.]{4,}$';
begin
  update custom.record r
     set data = jsonb_set(
                  r.data, '{rules}',
                  (select jsonb_agg(
                            case when rule ->> 'kind' = 'pattern' and (rule ->> 'value') = v_new
                                 then jsonb_set(rule, '{value}', to_jsonb(v_old)) else rule end)
                     from jsonb_array_elements(r.data -> 'rules') rule))
   where r.data_class = 'field'
     and r.deleted_at is null
     and jsonb_typeof(r.data -> 'rules') = 'array'
     and exists (select 1 from jsonb_array_elements(r.data -> 'rules') rule
                  where rule ->> 'kind' = 'pattern' and (rule ->> 'value') = v_new);

  update custom.record r
     set data = jsonb_set(
                  r.data, '{change,field,rules}',
                  (select jsonb_agg(
                            case when rule ->> 'kind' = 'pattern' and (rule ->> 'value') = v_new
                                 then jsonb_set(rule, '{value}', to_jsonb(v_old)) else rule end)
                     from jsonb_array_elements(r.data -> 'change' -> 'field' -> 'rules') rule))
   where r.data_class = 'work_approval'
     and r.deleted_at is null
     and jsonb_typeof(r.data -> 'change' -> 'field' -> 'rules') = 'array'
     and exists (select 1 from jsonb_array_elements(r.data -> 'change' -> 'field' -> 'rules') rule
                  where rule ->> 'kind' = 'pattern' and (rule ->> 'value') = v_new);
end;
$rows$;

-- ── the three helpers, dropped ONLY if nothing adopted them ───────────────────────────
--
-- 🚨 WHY THIS IS A CONDITION AND NOT THREE BARE DROPS (lane FIX-11B, 2026-09-22).
-- `custom.phone_pattern()` outlived this lane. A LATER migration outside it —
-- `fix10b_f6_the_store_names_every_kind_a_column_can_be.sql` — rewrote
-- `custom._field_document_for`, the body every declared Field passes through, and its new
-- `phone` arm CALLS `custom.phone_pattern()`. Three bare drops would therefore not put this
-- lane's defect back: they would take the ground out from under a body on the live path, and
-- the next phone Field anybody declares would raise `function custom.phone_pattern() does not
-- exist`. The un-swaps above already neuter the two bodies THIS lane swapped; anything that
-- adopted the function afterwards is not this file's to break, so the function is left
-- standing and the file says so out loud rather than failing at 3 a.m.
-- depends-on: custom.phone_pattern() is adopted by custom._field_document_for
--   (migrations/campaign/fix10b_f6_the_store_names_every_kind_a_column_can_be.sql).
-- ground-standing-ok: d — the drop below runs only when the catalogue shows no body calling
--   custom.phone_pattern(); an adopter outside this lane leaves it standing, with a notice.
do $drops$
declare
  v_left text[];
begin
  select array_agg(pn.nspname || '.' || p.proname order by pn.nspname, p.proname)
    into v_left
    from pg_proc p
    join pg_namespace pn on pn.oid = p.pronamespace
   where p.prokind = 'f'
     and pn.nspname not in ('pg_catalog', 'information_schema')
     and pg_get_functiondef(p.oid) like '%custom.phone_pattern()%';

  if v_left is not null then
    raise notice
      'custom.phone_pattern() is still called by % - leaving it, custom.phone_canonical(text) and custom.phone_display(text) standing. This lane''s defect is back (the stored patterns and the two un-swapped bodies above); the helper is not this file''s to take away from a body that adopted it later.',
      array_to_string(v_left, ', ');
    return;
  end if;

  execute 'drop function if exists custom.phone_display(text)';
  execute 'drop function if exists custom.phone_canonical(text)';
  execute 'drop function if exists custom.phone_pattern()';
end;
$drops$;

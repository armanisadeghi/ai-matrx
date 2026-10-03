-- LANE 9 SCOPES-ON-THE-STORE, sublane W2-W — A SCOPE TYPE FILED UNDER ANOTHER TYPE KEEPS ITS PARENT IN THE
-- STORE, AND ITS SCOPES FILE UNDER SCOPES OF THAT PARENT TYPE, measured RED then GREEN on the dev clone
-- (migrations/campaign/scopesw2w_a_scope_type_under_a_type_keeps_its_parent_in_the_store.sql).
--
-- THE USE CASE (both seats, everything rolled back): a brand studio keeps Brand Color (Red, Blue) and, filed
-- under it, Shade (Crimson under Red, Navy under Blue); Campaign Channel (Print) is a second, unrelated type.
--   test@test.com in Alex Hart's Workspace (owner); admin@admin.com in Castellano & Reyes, LLP (owner).
-- THE BREAK THIS CATCHES: custom._ctx_store_type dropping the old row's parent_type_id, so the store's parent
--   rule (custom._ctx_scope_parent_holds) cannot see the type parent and refuses Crimson under Red, while the
--   old tables accept it.
-- WHAT MUST HOLD (per seat, through the lane-9 doors custom.context_type_write / custom.context_scope_write):
--   P1  the Shade Table's document carries parent_type_id = Brand Color; custom.scope_type_row_of says the same
--   P2  Crimson (Shade) under Red is accepted, and the store Record's data.parent_id is Red
--   P3  Navy (Shade) under Print (Campaign Channel) is refused, 23514-class, nothing written
--   P4  Scarlet (Shade) with no parent is refused (the type-level rule)
--   P5  Dark Red (Brand Color) under Red is accepted, data.parent_id is Red (same-type nesting, unchanged)
-- RED on the bodies of 2026-10-03 (P1 and P2); GREEN after. When the file is live here the suite also
-- applies the inverse inside its transaction and requires RED.

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesw2w_a_scope_type_under_a_type_keeps_its_parent_red_green.sql'
\set expect 'clone'
\set requires 'function:custom.context_type_write|function:custom.context_scope_write|function:custom._ctx_store_type|function:custom.scope_type_row_of'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create or replace function pg_temp.w2wp_run() returns text[] language plpgsql as $run$
declare
  v_fails text[] := '{}';
  v_seat record;
  v_color jsonb; v_shade jsonb; v_channel jsonb; v_red jsonb; v_print jsonb; v_x jsonb;
  v_color_id uuid; v_shade_id uuid; v_red_id uuid;
  v_doc jsonb; v_row jsonb; v_state text; v_msg text; v_n int;
begin
  for v_seat in
    select * from (values
      ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '8cb71c8b-5b49-4563-a5fe-d77ff600f8ee'::uuid),
      ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '7cd12da2-2213-4378-8fba-a9e2dc4ea657'::uuid)
    ) t(name, uid, org)
  loop
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_seat.uid, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_color := custom.context_type_write(v_seat.org, null, '{"label_singular":"Brand Color","label_plural":"Brand Colors","icon":"palette"}');
      v_color_id := (v_color -> 'row' ->> 'id')::uuid;
      v_shade := custom.context_type_write(v_seat.org, null, jsonb_build_object('label_singular', 'Shade', 'label_plural', 'Shades', 'parent_type_id', v_color_id));
      v_shade_id := (v_shade -> 'row' ->> 'id')::uuid;
      v_channel := custom.context_type_write(v_seat.org, null, '{"label_singular":"Campaign Channel","label_plural":"Campaign Channels"}');
      v_red := custom.context_scope_write(v_seat.org, null, v_color_id, '{"name":"Red"}');
      v_red_id := (v_red -> 'row' ->> 'id')::uuid;
      v_print := custom.context_scope_write(v_seat.org, null, (v_channel -> 'row' ->> 'id')::uuid, '{"name":"Print"}');
      perform set_config('role', 'none', true);

      -- P1
      select r.data into v_doc from custom.record r where r.organization_id = v_seat.org and r.id = v_shade_id;
      select custom.scope_type_row_of(r) into v_row from custom.record r where r.organization_id = v_seat.org and r.id = v_shade_id;
      if (v_doc ->> 'parent_type_id') is distinct from v_color_id::text or (v_row ->> 'parent_type_id') is distinct from v_color_id::text then
        v_fails := v_fails || format('P1 RED (%s): Shade Table parent_type_id %s, scope_type_row_of %s — want %s',
                                     v_seat.name, coalesce(v_doc ->> 'parent_type_id', 'none'), coalesce(v_row ->> 'parent_type_id', 'null'), v_color_id);
      else raise notice 'P1 GREEN (%): the Shade Table keeps parent type %', v_seat.name, v_color_id; end if;

      -- P2 .. P5, each in its own sub-transaction
      for v_n in 2..5 loop
        v_x := null; v_state := null; v_msg := null;
        begin
          perform set_config('role', 'authenticated', true);
          v_x := case v_n
                   when 2 then custom.context_scope_write(v_seat.org, null, v_shade_id, jsonb_build_object('name', 'Crimson', 'parent_scope_id', v_red_id))
                   when 3 then custom.context_scope_write(v_seat.org, null, v_shade_id, jsonb_build_object('name', 'Navy', 'parent_scope_id', v_print -> 'row' ->> 'id'))
                   when 4 then custom.context_scope_write(v_seat.org, null, v_shade_id, '{"name":"Scarlet"}')
                   else        custom.context_scope_write(v_seat.org, null, v_color_id, jsonb_build_object('name', 'Dark Red', 'parent_scope_id', v_red_id)) end;
          perform set_config('role', 'none', true);
          select r.data into v_doc from custom.record r where r.organization_id = v_seat.org and r.id = (v_x -> 'row' ->> 'id')::uuid;
          raise exception using errcode = 'P0W2P', message = 'rolled back';
        exception
          when sqlstate 'P0W2P' then null;
          when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
        end;
        perform set_config('role', 'none', true);
        if v_n in (2, 5) then
          if v_state is not null then
            v_fails := v_fails || format('P%s RED (%s): refused %s "%s" — it must be accepted', v_n, v_seat.name, v_state, v_msg);
          elsif (v_doc ->> 'parent_id') is distinct from v_red_id::text then
            v_fails := v_fails || format('P%s RED (%s): store parent %s — want Red %s', v_n, v_seat.name, coalesce(v_doc ->> 'parent_id', 'none'), v_red_id);
          else raise notice 'P% GREEN (%): accepted, store parent is Red', v_n, v_seat.name; end if;
        else
          if v_state is null then
            v_fails := v_fails || format('P%s RED (%s): accepted (store parent %s) — it must be refused', v_n, v_seat.name, coalesce(v_doc ->> 'parent_id', 'none'));
          else raise notice 'P% GREEN (%): refused % "%"', v_n, v_seat.name, v_state, v_msg; end if;
        end if;
      end loop;
      raise exception using errcode = 'P0W2Q', message = 'seat rolled back';
    exception
      when sqlstate 'P0W2Q' then null;
      when others then
        get stacked diagnostics v_msg = message_text;
        v_fails := v_fails || format('SETUP RED (%s): %s', v_seat.name, v_msg);
    end;
    perform set_config('role', 'none', true);
  end loop;
  return v_fails;
end
$run$;

select position('LANE 9 W2-W' in pg_get_functiondef('custom._ctx_store_type(uuid,uuid,jsonb)'::regprocedure)) > 0 as file_is_live \gset
\if :file_is_live
do $g$
declare v text[] := pg_temp.w2wp_run();
begin
  if array_length(v, 1) > 0 then
    raise exception E'scopesw2w parent: the live bodies fail % check(s):\n%', array_length(v, 1), array_to_string(v, E'\n');
  end if;
  raise notice 'scopesw2w parent: GREEN on the live bodies (both seats, P1–P5)';
end $g$;
\echo 'scopesw2w parent: the inverse is applied in this transaction; the suite must go RED on it'
\i migrations/inverse/scopesw2w_a_scope_type_under_a_type_keeps_its_parent_in_the_store_down.sql
do $r$
declare v text[] := pg_temp.w2wp_run();
begin
  if coalesce(array_length(v, 1), 0) = 0 then
    raise exception 'scopesw2w parent: the inverse passed every check — this suite guards nothing';
  end if;
  raise notice E'scopesw2w parent: RED on the inverse, as it must be (% failures):\n%', array_length(v, 1), array_to_string(v, E'\n');
end $r$;
\else
do $old$
declare v text[] := pg_temp.w2wp_run();
begin
  if array_length(v, 1) > 0 then
    raise exception E'scopesw2w parent: % failed on the bodies live here (the file is not applied):\n%', array_length(v, 1), array_to_string(v, E'\n');
  end if;
end $old$;
\endif
rollback;
\echo 'scopesw2w_a_scope_type_under_a_type_keeps_its_parent_red_green: PASS'

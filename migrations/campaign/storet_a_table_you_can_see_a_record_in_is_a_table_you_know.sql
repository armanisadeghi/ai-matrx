-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.assert_may_know_table(uuid, uuid, text) c5642eb3936e981d97edda950eb6a4616ff1b13e3ff777135739ab52e275dbed
--
-- STORE-T / T2 — THE TWO QUESTIONS ABOUT A TABLE, RECONCILED.
--
-- WHAT WAS MEASURED, on the main database on 2026-09-20, from the seat a signed-in person has,
-- in a throwaway organization whose privacy setting is the stricter of the two
-- (`custom/member_default_visibility = shared_only`, "people only see what is shared with
-- them"). A note was carried by a Project; the Project was shared with `test@test.com` at
-- viewer; `custom.has_visibility` answers TRUE for her on the note. Every screen answers:
--
--     You do not have access to this table, so custom.applicable_fields has nothing to show
--     you.
--
-- and `custom.read_record`, `custom.read_records` and `custom.applicable_fields` all refuse.
-- The sixth pass's words for the same thing: "the store says the colleague can see the record
-- and every screen refuses to show it to her… An organization that chooses the stricter of the
-- two privacy settings loses sharing."
--
-- WHOSE IT IS. Lane STORE-REL built `custom.assert_may_know_table` for T10 — "a principal
-- shared on X alone… cannot see that a Table called Incident exists, nor its Fields" — and
-- nine doors now ask it. It asks ONE question: may you open the TABLE RECORD at viewer. Under
-- the shipped setting every member can open every record, the Table included, so the question
-- was always true and nobody noticed. Under `shared_only` a colleague shared ONE RECORD holds
-- nothing on the Table record, so the answer is no, and the door that was meant to hide a
-- table she has no business knowing about hid the table of the record she was just given. The
-- kernel and the door were asking different questions and nothing reconciled them.
--
-- THE RULE, WHICH IS THE ONE A PERSON WOULD STATE. You know a Table if you may open the Table
-- record, OR if you can see anything that is IN it. Both halves are the same ladder — the
-- second is `custom.visible_predicate_sql`, which is exactly what `custom.read_records` filters
-- its own page with, so a table whose rows all answer no is still secret and T10 is untouched:
-- someone shared on Project X alone can see no Incident, so she still cannot tell Incident
-- exists. And a table she was given a record in is a table she may read the columns of, which
-- is the only way the record can be shown to her at all.
--
-- IT STOPS AT THE FIRST ROW. `exists (… limit 1)` over the predicate, on the partition-local
-- index READ-PERF built, so this costs one index probe and not a visible-id list.

create or replace function custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
-- NOT security definer, exactly as before: every caller of this is already a definer door of
-- this store, so it runs as the store's own role there and has no call surface of its own.
as $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
begin
  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$;

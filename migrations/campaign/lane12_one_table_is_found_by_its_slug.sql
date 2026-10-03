-- target: clone,production
-- additive: yes
--   It ADDS one new function and one platform.client_callable_door row, and nothing else:
--     · custom.table_find(uuid, text, text, text)  the door: ONE Table of this organization, found by
--                                             its slug (or, with no slug, its name) and, when asked,
--                                             what it is kept for; or null
--   No table, column, trigger, policy or grant is touched; nothing is dropped, replaced or revoked.
--   The grant is its own chair-step file, `lane12_the_new_table_and_record_doors_can_be_reached.sql`.
--   The inverse is `migrations/inverse/lane12_one_table_is_found_by_its_slug_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
--
-- LANE PLATFORM-APP-DATA (v6 lane 12), wave 1, item 2.
--
-- THE USE CASE. A page (a kit's ledger, a content-IR kind home, the server's records gateway)
-- needs ONE table it knows by its address — "front_desk_callback_log" — and today every one of
-- them lists every table the organization has and searches the answer by hand. This door answers
-- the one table in one request.
--
-- THE STORE SWITCH. custom.assert_store_door is asked first, as every store door asks it, so an
-- organization that switched its record store off is refused here too (chair review, 2026-10-02).
--
-- WHAT DECIDES WHAT A CALLER SEES. Not this door. The candidates are found by slug or name, and
-- then they are read through custom.read_records_by_ids on the Table kernel — THE SAME read door
-- `tableRead` / `tableList` use (custom.assert_may_know_table, the one ladder, the one mask). A
-- table the caller may not see is not in that answer, so it is answered null exactly like a slug
-- nobody declared: telling her it exists would be the leak T10 forbids.
--
-- DUPLICATES. Sixteen (organization, slug) groups on the main database already hold more than one
-- live table (measured on the clone 2026-10-02). No unique index is added here; where several
-- match, the OLDEST one the caller may see answers, every time — the same pick custom.table_ensure
-- makes, so a find and an ensure never disagree about which table a slug means.

-- KEPT FOR (verifier, 2026-10-02). A slug is not unique: a person's own "loaner_kits" table and the
-- app's "loaner_kits" table (kept_for = equipment) are different tables, and the OLDEST of them
-- answered a find by slug alone — so a person's table made first silently hid the app's from every
-- app-table path. With `p_kept_for` the find matches the slug AND what the table is kept for, the
-- same match custom.table_ensure makes. Without it, nothing changes.
--
-- AN ARCHIVED APP TABLE IS ANSWERED, NOT HIDDEN. With `p_kept_for` and no live match, the oldest
-- ARCHIVED table of that slug and kept_for is answered as {id, archived: true, archived_at} — no
-- document. custom.table_ensure refuses to make that table again (lane12_f), and a screen needs to
-- say "archived — restore it" rather than "missing". It is said only to a caller custom.
-- assert_client_may_reach admits to the organization, the same audience table_ensure's refusal
-- names the table to.

create function custom.table_find(p_organization_id uuid, p_slug text default null, p_name text default null,
                                  p_kept_for text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_slug text := nullif(btrim(p_slug), '');
  v_name text := nullif(lower(btrim(p_name)), '');
  v_kept text := nullif(btrim(p_kept_for), '');
  v_ids  uuid[];
  v_gone record;
  v_row  record;
begin
  -- The record-store switch, first, exactly as table_ensure and record_upsert ask it (chair review
  -- REVIEW-PAD-WAVE1): a store switched off answers no door, this reader included.
  perform custom.assert_store_door(p_organization_id, 'custom.table_find');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_find');

  if v_slug is null and v_name is null then
    raise exception 'Say which table to find: its slug or its name.'
      using errcode = '22023',
            hint = 'Pass a slug (the table''s address) or its name. Nothing was read.';
  end if;

  -- THE CANDIDATES, oldest first. A slug, when given, is the whole question; a name is asked
  -- only when there is no slug, compared as a person types it (case and outer spaces ignored).
  select coalesce(array_agg(c.id order by c.created_at, c.id), '{}'::uuid[]) into v_ids
    from (select r.id, r.created_at
            from custom.record r
           where r.organization_id = p_organization_id
             and r.table_id = custom.table_kernel_id()
             and r.data_class = 'table'
             and r.deleted_at is null
             and case when v_slug is not null then r.data ->> 'slug' = v_slug
                      else lower(btrim(r.data ->> 'name')) = v_name end
             and (v_kept is null or nullif(btrim(r.data ->> 'kept_for'), '') = v_kept)
           order by r.created_at, r.id
           limit 200) c;

  if cardinality(v_ids) = 0 then
    if v_kept is not null then
      select r.id, r.deleted_at into v_gone
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.table_kernel_id()
         and r.data_class = 'table'
         and r.deleted_at is not null
         and case when v_slug is not null then r.data ->> 'slug' = v_slug
                  else lower(btrim(r.data ->> 'name')) = v_name end
         and nullif(btrim(r.data ->> 'kept_for'), '') = v_kept
       order by r.created_at, r.id
       limit 1;
      if v_gone.id is not null then
        return jsonb_build_object('id', v_gone.id, 'archived', true, 'archived_at', v_gone.deleted_at);
      end if;
    end if;
    return null;
  end if;

  -- THROUGH THE READ DOOR: what the caller may see of these, and as she may see it.
  select x.id, x.document, x.level into v_row
    from custom.read_records_by_ids(p_organization_id, custom.table_kernel_id(), v_ids, false) x
    join unnest(v_ids) with ordinality u(id, n) on u.id = x.id
   order by u.n
   limit 1;

  if v_row.id is null then
    return null;
  end if;
  return jsonb_build_object('id', v_row.id, 'document', v_row.document, 'level', v_row.level);
end;
$function$;

comment on function custom.table_find(uuid, text, text, text) is
  'Lane PLATFORM-APP-DATA: one Table of this organization by its slug (or, with no slug, its name) and, when p_kept_for is given, what it is kept for — read through custom.read_records_by_ids on the Table kernel so the caller sees it only if she may; the oldest she may see when several share it; with p_kept_for and no live match, the oldest archived match as {id, archived: true, archived_at}; null when none.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_find',
   'p_organization_id uuid, p_slug text, p_name text, p_kept_for text',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid],
   'Takes an organization, a slug or a name, and optionally what the table is kept for. Refuses unless custom.assert_store_door and custom.assert_client_may_reach admit the caller to that organization; then answers the one Table of that slug (or name, and kept_for when given) through custom.read_records_by_ids on the Table kernel, so only a Table the caller may see is answered, masked as the read door masks it; with kept_for and no live match, the archived match''s id and archived_at only. It writes nothing.',
   'lane12_one_table_is_found_by_its_slug.sql', null, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-02 lane PLATFORM-APP-DATA — read from this body"}}, "declared_at": "2026-10-02 lane PLATFORM-APP-DATA", "declared_by": "lane12_one_table_is_found_by_its_slug.sql"}'::jsonb)
on conflict do nothing;

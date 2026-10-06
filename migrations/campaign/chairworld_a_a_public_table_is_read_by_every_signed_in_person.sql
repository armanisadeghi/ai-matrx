-- additive: yes
-- lane: CHAIR-WORLD-LANE
-- based-on: custom.assert_client_may_reach(uuid, text) 4928729e8a1030094245e7e14b30772991b39a5b028b7d758770b9a279b1a06d
-- based-on: custom.assert_may_know_table(uuid, uuid, text) 015aaff38bd7787e4bea71bf747fa4cf00712aed414c0072ca763b50c4b3cf25
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) 64d9275e83df3ab5f003b328f4bedf88faa64fcece376535e7e43fdeef2923e3
-- based-on: custom.views(uuid, uuid) bfb8730153837de6c4052c9a0e6d9133ed29349f1a82c11e0e149c392654b750
-- based-on: custom.read_record(uuid, uuid, boolean) a9cecbdaa90dc2925e3e488b141195669da505b2157364ed652042c48d56ee24
-- LOCKS: three new functions (EXECUTE revoked from PUBLIC, anon and authenticated: they are asked only
-- inside the store's doors, like custom.assert_client_may_reach itself) and five function bodies
-- (CREATE OR REPLACE keeps their grants). No table, row, trigger, grant or policy is touched.
--
-- A PUBLIC TABLE IS READ BY EVERY SIGNED-IN PERSON (chair ruling 2026-10-05, CHAIR-WORLD-LANE). The access
-- ladder gives a Table one of four levels; at Public it opens to people outside its organization without
-- being shared. A Table record published to the web (`published_to_web`, the ladder's word; the T-13
-- dual-write trigger keeps the retiring row column at `public` beside it) is already answered yes at viewer — and never above — by custom.has_visibility for the Table and every row it carries
-- (the kernel's public arm, iam.has_access_for_base). What refused was the organization wall,
-- custom.assert_client_may_reach, which every door asks first and which knew only members, portal
-- principals and shares. It now has a fourth way through, for READ doors only, in an organization that holds
-- a Public Table; the Table doors turn every Table that is not Public back into the wall's own refusal, so
-- nothing else of that organization opens and every write is refused exactly as before.
--
-- 1. custom.door_reads_only(text) — the read doors, by the name each passes to the wall: platform.resolve_id
--    (where_id_opens), custom.read_records, read_records_page, read_record, read_records_by_ids,
--    read_records_matching, read_records_in_view_order, record_aggregate, applicable_fields, views,
--    view_look_read, table_decorations, table_dimensions, table_kind_facts. Each of them asks
--    custom.assert_may_know_table or custom.assert_client_may_open (or, for views and read_record, the
--    helper itself) right after the wall, naming its Table. A door not listed is unchanged.
-- 2. custom.organization_has_a_public_table(uuid) — a live Table record published to the web, in a live
--    organization. Read through `published_to_web` and never the retiring row column (T-13).
-- 3. custom._not_a_member_refusal(text) — the wall's refusal, moved word for word into one place so the wall
--    and the Table check say the same sentence (42501, same hint).
-- 4. custom.assert_public_reader_names_a_public_table(org, table, door) — when the wall admitted this seat to
--    this organization ONLY through the world lane in this statement (memo 'w:pub' set, 'w:r' not), the Table
--    named must be a live Public Table of that organization, else the wall's refusal; once it is, the doors
--    the read door calls on its way (custom.query_visible_ids, custom.table_type_field, …) pass the wall in
--    that statement (memo 'w:pubt') — and only in that statement. For everybody else it returns at once.
-- 5. The wall, assert_may_know_table, assert_client_may_open, views and read_record ask it.
-- Inverse: migrations/inverse/chairworld_a_a_public_table_is_read_by_every_signed_in_person_down.sql.

set local lock_timeout = '3s';

create or replace function custom.door_reads_only(p_door text)
 returns boolean
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  -- THE READ DOORS THE WORLD LANE ADMITS (CHAIR-WORLD-LANE), by the name each passes to
  -- custom.assert_client_may_reach. A door joins this list only when it names its Table to
  -- custom.assert_may_know_table / custom.assert_client_may_open (or to
  -- custom.assert_public_reader_names_a_public_table) right after the wall, and writes nothing.
  select coalesce(p_door = any (array[
    'platform.resolve_id',
    'custom.read_records',
    'custom.read_records_page',
    'custom.read_record',
    'custom.read_records_by_ids',
    'custom.read_records_matching',
    'custom.read_records_in_view_order',
    'custom.record_aggregate',
    'custom.applicable_fields',
    'custom.views',
    'custom.view_look_read',
    'custom.table_decorations',
    'custom.table_dimensions',
    'custom.table_kind_facts'
  ]), false)
$function$;

create or replace function custom.organization_has_a_public_table(p_organization_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Does this live organization hold a live Table published to the web — the ladder's Public table? (CHAIR-WORLD-LANE)
  select p_organization_id is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null
                    and t.published_to_web)
     and not exists (select 1 from iam.organizations o
                      where o.id = p_organization_id and o.archived_at is not null)
$function$;

create or replace function custom._not_a_member_refusal(p_door text)
 returns void
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $function$
begin
  -- THE WALL'S REFUSAL, ONE SENTENCE IN ONE PLACE (moved here word for word from
  -- custom.assert_client_may_reach by CHAIR-WORLD-LANE, so the Table check says exactly the same).
  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end
$function$;

create or replace function custom.assert_public_reader_names_a_public_table(p_organization_id uuid, p_table_id uuid, p_door text)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  -- Only a seat the wall admitted to this organization through the world lane ALONE, in this statement.
  if platform.memo_k_get('w:pub:' || coalesce(p_organization_id::text, '-')) is distinct from '1'
     or platform.memo_k_get('w:r:' || coalesce(p_organization_id::text, '-')) = '1' then
    return;
  end if;
  if p_table_id is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null
                    and t.published_to_web) then
    -- The read door has named a Public Table: the doors it calls on its way pass the wall (see there).
    perform platform.memo_k_put('w:pubt:' || p_organization_id::text, '1');
    return;
  end if;
  -- Any other Table of the organization — or none named — answers exactly what the wall said before.
  perform custom._not_a_member_refusal(p_door);
end
$function$;

revoke execute on function custom.door_reads_only(text) from public, anon, authenticated;
revoke execute on function custom.organization_has_a_public_table(uuid) from public, anon, authenticated;
revoke execute on function custom._not_a_member_refusal(text) from public, anon, authenticated;
revoke execute on function custom.assert_public_reader_names_a_public_table(uuid, uuid, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- A PLATFORM CONTEXT READ IN PROGRESS (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (1)). custom.context_scopes
  -- sets this for the length of ONE read of ONE platform context Table (custom.table_is_platform_context — a context
  -- Table of a global-readable system organization) the one ladder already lets the caller see, and clears it after;
  -- no client can set it (set_config is no client door). It admits nothing else: no memo is written, and every other
  -- door, Table and organization meets this wall as before.
  if nullif(current_setting('mx.platform_context_org', true), '') = p_organization_id::text then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- 🌐 THE WORLD LANE, FOR READING ONLY (CHAIR-WORLD-LANE, chair ruling 2026-10-05; access ladder: a Public
  -- table opens to anyone without being shared). An organization that holds a Table at the ladder's Public
  -- level (its Table record published to the web — the ladder's word; T-13) is reachable by any signed-in person through a READ
  -- door (custom.door_reads_only) and through nothing else: every write door still meets the refusal below.
  -- IT ADMITS AND NOTHING MORE, and it is the narrowest admission in this function: no memo 'w:r' is written,
  -- so it never carries to another door in the statement, and it leaves the marker 'w:pub' that the table
  -- doors read (custom.assert_public_reader_names_a_public_table, asked by custom.assert_may_know_table,
  -- custom.assert_client_may_open, custom.views and custom.read_record right after this wall). Those turn a
  -- Table that is NOT Public back into this very refusal, word for word — so for every other Table of the
  -- organization (the Matrx System kernel Tables included) every door answers exactly as before. The ladder
  -- is the next line of every door and gives a Public Table's rows at viewer and never above.
  -- A door the read door calls on its way (custom.query_visible_ids, custom.table_type_field, …) names itself
  -- here too; it passes only once the read door it serves has, in this same statement, named a Public Table
  -- (memo 'w:pubt', written by custom.assert_public_reader_names_a_public_table). Called on its own, in a
  -- statement of its own, it meets the refusal below exactly as before.
  if (custom.door_reads_only(p_door)
      or platform.memo_k_get('w:pubt:' || coalesce(p_organization_id::text, '-')) = '1')
     and custom.organization_has_a_public_table(p_organization_id) then
    perform platform.memo_k_put('w:pub:' || p_organization_id::text, '1');
    return;
  end if;

  perform custom._not_a_member_refusal(p_door);
end $function$;

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);
  -- CHAIR-WORLD-LANE: a person the wall admitted ONLY through the world lane knows a Public Table and no other.
  perform custom.assert_public_reader_names_a_public_table(p_organization_id, p_table_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_k_put(v_memo, '1');
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
    perform platform.memo_k_put(v_memo, '1');
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

CREATE OR REPLACE FUNCTION custom.assert_client_may_open(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'viewer'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always, and it is `custom.assert_client_may_change`'s order: the
  -- organization wall first, then the row.
  perform custom.assert_client_may_reach(p_organization_id, p_door);
  -- CHAIR-WORLD-LANE: a person the wall admitted ONLY through the world lane opens a Public Table, or a row of
  -- one, and nothing else (the subject's Table: itself when it is a Table, else the Table it lives in).
  perform custom.assert_public_reader_names_a_public_table(p_organization_id,
    (select case when r.table_id = custom.table_kernel_id() then r.id else r.table_id end
       from custom.record r
      where r.organization_id = p_organization_id and r.id = p_subject_id),
    p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous doors, which have
  -- already decided the request against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23).
  -- This used to look only inside p_organization_id and RETURN — let the call through —
  -- when the subject was elsewhere, trusting every door to filter by that organization a
  -- line later. Sixteen doors never did: `custom.record_as_of` handed a member of one
  -- organization the full, unmasked state of a record in an organization she does not
  -- belong to (proven live 2026-09-23 as test@test.com, rolled back). Access is a question
  -- about the PERSON and the ROW, never about which organization was passed in
  -- (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000, the same for an invented id.
  if v_subject_org is null then
    return;
  end if;

  -- The platform's globally readable tenants (the Matrx System kernel Tables every
  -- organization builds on) stay reachable exactly as before.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  -- THE ONE LADDER, asked about the row wherever it lives.
  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % has nothing to show you.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.views(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(view_id uuid, name text, table_id uuid, filters jsonb, definition jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  -- CHAIR-WORLD-LANE: a person admitted only through the world lane lists the views of one Public Table.
  perform custom.assert_public_reader_names_a_public_table(p_organization_id, p_table_id, 'custom.views');
  return query
    select sv.id, sv.name, nullif(sv.definition ->> 'table_id', '')::uuid,
           coalesce(sv.definition -> 'filters', '{}'::jsonb),
           -- THE WHOLE DOCUMENT. The layout, the Field the board groups by, the Field the
           -- calendar reads, the sorts and the look all live in here, and the screen that
           -- drew it is the one thing that knows which of them it needs.
           coalesce(sv.definition, '{}'::jsonb),
           sv.created_at
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and (p_table_id is null or (sv.definition ->> 'table_id')::uuid = p_table_id)
       -- A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT: narrowed in SQL, as
       -- the definer, to Tables this caller can already open — so the list of views
       -- can never reveal a Table.
       and (sv.definition ->> 'table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by sv.name;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me  uuid := auth.uid();
  v_now uuid;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST (REC-29).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);
  -- CHAIR-WORLD-LANE: a person admitted only through the world lane reads a row of a Public Table and no other.
  perform custom.assert_public_reader_names_a_public_table(p_organization_id,
    (select case when r.table_id = custom.table_kernel_id() then r.id else r.table_id end
       from custom.record r
      where r.organization_id = p_organization_id and r.id = v_now),
    'custom.read_record');

  -- AND THE LADDER BEFORE EXISTENCE: a record you may not open and a record that is not there
  -- answer the same thing (custom.has_visibility is false for an id that is not there) - except a
  -- row of a Confidential Table this person is not named on, which answers its HEADER and nothing
  -- else: {id, exists: true, submitted_at} (CHAIR-ACCESS b, HR proof gap 4: a stamp nobody can fake).
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    if custom.confidential_header(v_me, v_now) is not null then
      return custom.confidential_header(v_me, v_now);
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  -- DOOR-1. The rest of the door — existence, the one mask at the rung this person holds on the
  -- record, the choice words, the whole-value pointers, the alternates and the retired values —
  -- is custom._read_record_with, handed the two answers this body has just worked out.
  return (select w.o_doc
            from custom._read_record_with(p_organization_id, p_record_id, p_by_id,
                   jsonb_build_object(v_now::text, jsonb_build_object(
                     's', true, 'l', custom.effective_level(v_me, null, v_now))),
                   '{}'::jsonb) w);
end;
$function$;

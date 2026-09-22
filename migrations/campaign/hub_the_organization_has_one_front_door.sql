-- target: branch,production
-- additive: yes
--   It ADDS three new functions — `custom.pipelines`, `custom.shares_outside` and
--   `custom.hub_changed_by` — and their `platform.client_callable_door` rows, and nothing
--   else. No table, column, trigger, policy or grant is touched; nothing existing is
--   replaced, dropped or revoked; no row of anybody's data is rewritten. No business-shaped
--   table is created, so the provisioner is not involved.
--   The inverse is `migrations/inverse/hub_the_organization_has_one_front_door_down.sql`.
-- guard: custom/system_enabled
--
-- LANE DATA-HUB — the organization's front door for the record store.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- WHY THESE THREE AND NOT A FOURTH
-- ════════════════════════════════════════════════════════════════════════════════
--
-- /data-v2 is about to stop being "a list of tables" and become the hub for everything the
-- store holds: Tables, Forms, Bookings, Portals, Dashboards, Digests, Checklists,
-- Automations, what is shared, and what has been archived. Every one of those listings has
-- to read the WHOLE organization in ONE call — a screen that asked per table would be a
-- client-side fan-out, which is N round trips, N chances to disagree with itself, and a
-- reader that can be told a different story than the store would tell.
--
-- Nine of the eleven already have exactly that door and this file does not touch them:
--
--   Tables      custom.read_records(org, custom.table_kernel_id())
--   Forms       custom.forms(org)
--   Bookings    custom.bookings(org)
--   Portals     custom.list_portals(org, <archived>)
--   Dashboards  custom.dashboards(org)
--   Digests     custom.subscriptions(org)
--   Checklists  custom.checklist_templates(org) / custom.checklist_runs(org)
--   Archived    custom.read_records_archived(org, custom.table_kernel_id()) for Tables,
--               custom.list_portals(org, 'archived') for Portals
--   Shared IN   custom.table_share_outside_for_me()
--
-- Two had NO cross-table door at all, and one question had no door anywhere:
--
--   1. AUTOMATIONS. `custom.pipeline_read(org, table_id)` answers ONE table. Nothing
--      answered "which of this organization's tables run a board, and what rules guard
--      them" — so the hub could not have listed automations without asking per table.
--   2. SHARING OUTSIDE. `custom.table_share_outside(org, table_id)` answers ONE table.
--      Nothing answered "who outside this organization has been given something of ours".
--   3. WHO CHANGED IT. Every listing door above answers WHAT and WHEN; not one answers
--      WHO. `custom.record_history(org, record_id)` does, one record at a time, which on a
--      page of forty things is forty round trips.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- THE WALL IS THE TABLE'S, EVERY TIME — THE SAME ONE `custom.forms` STANDS BEHIND
-- ════════════════════════════════════════════════════════════════════════════════
--
-- All three narrow to `custom.query_visible_ids(org, custom.table_kernel_id())`: the Tables
-- this caller can already open. A hub is not a second way to learn that a Table exists, and
-- a pipeline, an outside invitation and an author are all facts ABOUT a Table (VIS-5).
--
-- COMPANY: Airtable's workspace home and Notion's sidebar both list every artefact of a
-- workspace in one read and apply the reader's own permissions inside it; neither hides the
-- page and calls it security, and neither asks the browser to assemble the list.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.pipelines — every board in this organization, in one call.
--
-- It does not re-implement `custom.pipeline_read`; it CALLS it, once per visible Table,
-- inside the database. So the hub's "4 stages, 2 rules" and the board's own drawing come
-- from one body and cannot drift into two answers. A Table whose stage column has been
-- deleted underneath it raises 23503 inside `pipeline_read`; that is caught here and
-- reported as a row that SAYS SO, because a hub that silently dropped a broken board would
-- be hiding the one thing a person needs to see.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.pipelines(p_organization_id uuid)
returns table(table_id uuid, table_name text, stage_field text, stage_label text,
              stages integer, rules integer, broken text,
              updated_at timestamptz, updated_by uuid)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_tbl  record;
  v_read jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.pipelines');

  for v_tbl in
    select t.id, coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)') as name,
           t.updated_at, t.updated_by
      from custom.record t
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
       and nullif(t.data ->> 'stage_field', '') is not null
       and t.id in (select v from custom.query_visible_ids(p_organization_id,
                                                           custom.table_kernel_id()) v)
     order by t.data ->> 'name'
  loop
    begin
      v_read := custom.pipeline_read(p_organization_id, v_tbl.id);
    exception when others then
      -- The board is declared and cannot be drawn. Say which table and say why, in the
      -- store's own words, rather than leaving it off the list.
      table_id := v_tbl.id; table_name := v_tbl.name;
      stage_field := null; stage_label := null; stages := 0; rules := 0;
      broken := sqlerrm;
      updated_at := v_tbl.updated_at; updated_by := v_tbl.updated_by;
      return next;
      continue;
    end;

    if coalesce((v_read ->> 'is_pipeline')::boolean, false) then
      table_id    := v_tbl.id;
      table_name  := v_tbl.name;
      stage_field := v_read ->> 'stage_field';
      stage_label := v_read ->> 'stage_label';
      stages      := jsonb_array_length(coalesce(v_read -> 'stages', '[]'::jsonb));
      rules       := jsonb_array_length(coalesce(v_read -> 'rules', '[]'::jsonb));
      broken      := null;
      updated_at  := v_tbl.updated_at;
      updated_by  := v_tbl.updated_by;
      return next;
    end if;
  end loop;
end;
$fn$;

comment on function custom.pipelines(uuid) is
  'The organization''s boards, across every Table this caller can already open — the same '
  'wall custom.forms and custom.dashboards stand behind (VIS-5). Each row is produced by '
  'custom.pipeline_read itself, so the hub and the board can never disagree about how many '
  'stages or rules a Table has; a Table whose stage column has gone is returned WITH the '
  'store''s own refusal in `broken` rather than dropped from the list.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'pipelines',
        'p_organization_id uuid',
        array['uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach before a row is read, so an organization this caller is not in is refused by name and NULL is refused there. The list is then narrowed to custom.query_visible_ids(org, custom.table_kernel_id()), so it can never name a Table the caller could not already open, and every per-board fact comes from custom.pipeline_read, which asks custom.assert_may_know_table for itself. It writes nothing and it returns no record of any Table.',
        'hub_the_organization_has_one_front_door.sql',
        null,
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.shares_outside — everyone outside this organization who has been given
-- something of ours, across every Table, in one call.
--
-- `custom.table_share_outside(org, table_id)` answers one Table and carries the dialog's
-- own knobs (may this person invite, is the lane open). This is the ORGANIZATION's list,
-- so it carries neither: the hub shows who holds what, and the dialog on the table stays
-- the one place an invitation is made or withdrawn.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.shares_outside(p_organization_id uuid)
returns table(invitation_id uuid, table_id uuid, table_name text, email text,
              level text, level_label text, status text, joined boolean, expired boolean,
              invited_at timestamptz, expires_at timestamptz, say text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.shares_outside');
  return query
    select i.id,
           t.id,
           coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
           i.email,
           coalesce(i.metadata ->> 'level', 'viewer'),
           iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
           i.status,
           i.status = 'accepted',
           i.expires_at is not null and i.expires_at <= now(),
           i.created_at,
           i.expires_at,
           -- The SAME three sentences custom.table_share_outside writes on the table's own
           -- dialog. One wording, so the hub and the dialog cannot say different things
           -- about the same invitation.
           case
             when i.status = 'accepted'
               then format('%s can open %s as a %s.', i.email,
                           coalesce(nullif(t.data ->> 'name', ''), 'this table'),
                           coalesce(i.metadata ->> 'level', 'viewer'))
             when i.expires_at is not null and i.expires_at <= now()
               then format('%s was invited to %s, and the invitation has run out. Resend it from that table to give them a fresh link.', i.email,
                           coalesce(nullif(t.data ->> 'name', ''), 'a table'))
             else format('%s is invited to %s and has not joined yet. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing.', i.email,
                         coalesce(nullif(t.data ->> 'name', ''), 'a table'))
           end
      from iam.invitations i
      join custom.record t
        on t.id = i.target_id
       and t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.deleted_at is null
     where i.target_type = 'custom_table'
       and i.organization_id = p_organization_id
       and i.deleted_at is null
       and i.status <> 'revoked'
       -- ONLY the Tables this caller can already open. The outside-share list is not a
       -- second way to learn that a Table exists.
       and t.id in (select v from custom.query_visible_ids(p_organization_id,
                                                           custom.table_kernel_id()) v)
     order by i.created_at desc;
end;
$fn$;

comment on function custom.shares_outside(uuid) is
  'Every outside invitation this organization has live, across the Tables this caller can '
  'already open — the organization-wide half of custom.table_share_outside, which answers '
  'one Table. It carries no knob and no control: making or withdrawing an invitation stays '
  'on the table''s own dialog, which is where the may-I question is asked.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'shares_outside',
        'p_organization_id uuid',
        array['uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach before a row is read, so an organization this caller is not in is refused by name and NULL is refused there. Rows are then joined to custom.query_visible_ids(org, custom.table_kernel_id()), so an invitation over a Table this caller cannot open is not returned at all. It writes nothing, it revokes nothing, and it returns no token — the accept token lives only on custom.table_share_outside_for_me, which answers the invited person about their own invitation.',
        'hub_the_organization_has_one_front_door.sql',
        null,
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.hub_changed_by — WHO last touched each of these, in ONE call.
--
-- Every listing door in the store answers WHAT and WHEN. None answers WHO, and the only
-- door that does — `custom.record_history` — answers one record at a time. A hub page
-- showing forty things would be forty round trips, which is the fan-out this whole file
-- exists to remove.
--
-- 🚨 THE BOUND, SAID OUT LOUD: it answers ONLY for the store's own STRUCTURAL objects —
-- a Table, a dashboard, a rule, a checklist template, a form, a booking page, a portal.
-- `data_class = 'record'` (a person's actual business row) is excluded in the WHERE, so
-- this door cannot be used to mine authorship of anybody's customer data. Attribution on a
-- business record stays where it already is: `custom.field_history`, per cell, on the
-- gesture that reaches it (SCR-17).
--
-- Names come from `custom.history_people`, the roster door the history panel already uses,
-- so the hub, the grid cell and the timeline all put the same words to the same person —
-- and it never returns a user id the caller could not already resolve for themselves.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.hub_changed_by(p_organization_id uuid,
                                                p_kind text,
                                                p_ids uuid[])
returns table(id uuid, at timestamptz, who text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_ids    uuid[] := coalesce(p_ids, array[]::uuid[]);
  v_people jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.hub_changed_by');

  if p_kind not in ('structure', 'form', 'portal') then
    raise exception 'custom.hub_changed_by does not know the kind %', coalesce(p_kind, '(null)')
      using errcode = '22023',
            hint = 'The kinds are: structure (a Table, dashboard, rule, checklist or work '
                   'template), form (a form, booking page or capture sheet) and portal.';
  end if;

  if array_length(v_ids, 1) is null then
    return;
  end if;
  if array_length(v_ids, 1) > 500 then
    raise exception 'custom.hub_changed_by was asked about % things at once', array_length(v_ids, 1)
      using errcode = '54000',
            hint = 'Ask about at most 500 at a time — that is one page of a hub, and more '
                   'than a person reads.';
  end if;

  if p_kind = 'structure' then
    return query
      with people as (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct coalesce(r.updated_by, r.created_by)
                         from custom.record r
                        where r.organization_id = p_organization_id
                          and r.id = any (v_ids)
                          and coalesce(r.updated_by, r.created_by) is not null)) as m
      )
      select r.id,
             coalesce(r.updated_at, r.created_at),
             people.m #>> array[coalesce(r.updated_by, r.created_by)::text, 'name']
        from custom.record r cross join people
       where r.organization_id = p_organization_id
         and r.id = any (v_ids)
         -- THE BOUND. A person's own business row is never answered here.
         and coalesce(r.data_class, 'record') <> 'record';

  elsif p_kind = 'form' then
    return query
      with people as (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct coalesce(f.updated_by, f.created_by)
                         from custom.anon_form f
                        where f.organization_id = p_organization_id
                          and f.id = any (v_ids)
                          and coalesce(f.updated_by, f.created_by) is not null)) as m
      )
      select f.id,
             coalesce(f.updated_at, f.created_at),
             people.m #>> array[coalesce(f.updated_by, f.created_by)::text, 'name']
        from custom.anon_form f cross join people
       where f.organization_id = p_organization_id
         and f.id = any (v_ids)
         and f.table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                   custom.table_kernel_id()) v);

  else
    return query
      with people as (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct p.created_by
                         from custom.portal p
                        where p.organization_id = p_organization_id
                          and p.id = any (v_ids)
                          and p.created_by is not null)) as m
      )
      select p.id,
             p.created_at,
             people.m #>> array[p.created_by::text, 'name']
        from custom.portal p cross join people
       where p.organization_id = p_organization_id
         and p.id = any (v_ids);
  end if;
end;
$fn$;

comment on function custom.hub_changed_by(uuid, text, uuid[]) is
  'WHO last touched each of these, in one call, for the store''s own structural objects '
  'only — a Table, a dashboard, a rule, a checklist or work template, a form, a booking '
  'page, a capture sheet, a portal. A business record (data_class = ''record'') is excluded '
  'by the WHERE, so this is not a way to read authorship off somebody''s customer data; '
  'that stays on custom.field_history, per cell. Names come from custom.history_people, the '
  'same roster the history panel resolves through, and an unresolvable author comes back '
  'NULL so the screen can say so in words rather than print an id (SCR-N-5).';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'hub_changed_by',
        'p_organization_id uuid, p_kind text, p_ids uuid[]',
        array['uuid'::regtype, 'text'::regtype, 'uuid[]'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach before a row is read, so an organization this caller is not in is refused by name and NULL is refused there. p_kind is a closed vocabulary of three words and anything else raises 22023 by name. p_ids is capped at 500 and an id belonging to another organization simply matches nothing, because organization_id is in every WHERE. The answer is bounded twice more: a business record (data_class = ''record'') is excluded outright, and the form arm is narrowed to custom.query_visible_ids(org, custom.table_kernel_id()). It returns a display NAME and never a user id, and it writes nothing.',
        'hub_the_organization_has_one_front_door.sql',
        null,
        true, false)
on conflict do nothing;

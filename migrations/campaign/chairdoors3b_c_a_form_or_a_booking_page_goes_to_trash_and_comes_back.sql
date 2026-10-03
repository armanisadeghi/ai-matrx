-- chair-step: CREATES four SECURITY DEFINER doors — custom.form_archive, custom.form_restore, custom.forms_archived, custom.checklist_templates_archived — declares them in platform.client_callable_door and GRANTs EXECUTE on them to `authenticated`. `anon` gains nothing. No table, column, index, trigger, policy, knob row or existing function is touched; the only rows the two write doors change are custom.anon_form.deleted_at / updated_at / updated_by of the one form named.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 2 MAKE-HOME, need "archive law"; lane 8 TEMPLATES "archive doors for forms")
--
-- A FORM OR A BOOKING PAGE GOES TO TRASH AND COMES BACK (delete means archive: everything a person makes
-- archives and comes back from Trash). Until this file a form or a booking page was archived only with its
-- whole table (custom.table_archive), and an archived checklist template (it archives through
-- custom.record_delete) was listed nowhere, so it could never be brought back.
--
-- THE USE CASE. Dana Whitlock runs the front desk at Cedar Ridge Physical Therapy. Last spring's "Summer
-- hours request" form is still in her list. She presses Archive: its public address stops answering, it
-- leaves her forms list, and nothing it collected is touched. In Trash she finds it, presses Bring back,
-- and it is exactly as it was — same address, same answers, still published.
--
--   custom.form_archive(p_organization_id, p_form_id)  → jsonb {archived, changed, form_id, kind, title, archived_at, sentence}
--   custom.form_restore(p_organization_id, p_form_id)  → jsonb {archived, changed, form_id, kind, title, sentence}
--       A booking page is a form (custom.anon_form with presentation.booking), so these two cover it.
--       RUNG: admin on the form's table — the rung custom.form_declare and custom.booking_declare climb.
--       Archive = deleted_at := now(): every public door (form_public, form_submit, booking_public,
--       booking_hold, booking_confirm, booking_manage, portal_form …) already asks `deleted_at is null`,
--       and the live-slug unique index is partial on it, so the address is closed in the same instant.
--       Restore refuses, by name, when the table is archived (restore the table first) or when a live
--       form took the address meanwhile.
--       custom.table_restore brings back only the forms custom.table_archive itself archived (it matches
--       the moment it stamped), so a form archived here on its own stays archived when its table returns.
--   custom.forms_archived(p_organization_id, p_table_id default null, p_limit default 100)
--       → rows (form_id, table_id, table_name, kind 'form'|'booking', title, slug, archived_at, archived_by,
--               table_archived, can_restore) — the Trash listing for forms and booking pages, newest first.
--       Lists only forms of tables the caller may open (archived tables included: the row says so).
--   custom.checklist_templates_archived(p_organization_id, p_about_table_id default null, p_limit default 100)
--       → rows (template_id, name, about_table_id, about_table, steps, archived_at, archived_by, table_archived)
--       — the Trash listing for checklist templates; each comes back through custom.record_restore.
-- The live listings custom.forms / custom.bookings / custom.checklist_templates already leave archived
-- rows out and are unchanged.
--
-- INVERSE: migrations/inverse/chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back_down.sql

create or replace function custom.form_archive(p_organization_id uuid, p_form_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_f    custom.anon_form;
  v_kind text;
  v_word text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_archive');

  select * into v_f from custom.anon_form f
   where f.organization_id = p_organization_id and f.id = p_form_id
   for update;
  if not found then
    raise exception 'There is no such form in this organization, so nothing was archived.' using errcode = '02000',
      hint = 'A form id from another organization reads as absent (REC-29).',
      detail = jsonb_build_object('form_id', p_form_id)::text;
  end if;
  v_kind := case when v_f.presentation ? 'booking' then 'booking' else 'form' end;
  v_word := case when v_kind = 'booking' then 'booking page' else 'form' end;

  -- THE ONE LADDER, at the rung the declare doors climb: admin on the table it writes into.
  perform custom.assert_client_may_change(p_organization_id, v_f.table_id, 'custom.form_archive',
                                          'admin'::public.permission_level, 'table');

  if v_f.deleted_at is not null then
    return jsonb_build_object('archived', true, 'changed', false, 'form_id', v_f.id, 'kind', v_kind,
      'title', v_f.title, 'archived_at', v_f.deleted_at,
      'sentence', format('The %s "%s" was already archived.', v_word, custom.said(v_f.title, 'that one')));
  end if;

  update custom.anon_form f
     set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
   where f.organization_id = p_organization_id and f.id = p_form_id
  returning * into v_f;

  return jsonb_build_object('archived', true, 'changed', true, 'form_id', v_f.id, 'kind', v_kind,
    'title', v_f.title, 'archived_at', v_f.deleted_at,
    'sentence', format('The %s "%s" is archived. Its address no longer answers; everything it collected is kept, and it can be brought back from Trash.',
                       v_word, custom.said(v_f.title, 'that one')));
end
$function$;
comment on function custom.form_archive(uuid, uuid) is
  'Chair (v6) — archive one form or booking page (custom.anon_form.deleted_at): admin on its table, the rung form_declare climbs. Its public address stops answering at once; submissions and booked records are untouched. Undone by custom.form_restore; listed by custom.forms_archived.';

create or replace function custom.form_restore(p_organization_id uuid, p_form_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_f    custom.anon_form;
  v_kind text;
  v_word text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_restore');

  select * into v_f from custom.anon_form f
   where f.organization_id = p_organization_id and f.id = p_form_id
   for update;
  if not found then
    raise exception 'There is no such form in this organization, so nothing was brought back.' using errcode = '02000',
      hint = 'A form id from another organization reads as absent (REC-29).',
      detail = jsonb_build_object('form_id', p_form_id)::text;
  end if;
  v_kind := case when v_f.presentation ? 'booking' then 'booking' else 'form' end;
  v_word := case when v_kind = 'booking' then 'booking page' else 'form' end;

  if not exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_f.table_id
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
    raise exception 'The % "%" belongs to a table that is archived, so it cannot come back on its own.', v_word, custom.said(v_f.title, 'that one')
      using errcode = '23514', hint = 'Restore the table from Trash first.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_f.table_id, 'custom.form_restore',
                                          'admin'::public.permission_level, 'table');

  if v_f.deleted_at is null then
    return jsonb_build_object('archived', false, 'changed', false, 'form_id', v_f.id, 'kind', v_kind,
      'title', v_f.title,
      'sentence', format('The %s "%s" is not archived.', v_word, custom.said(v_f.title, 'that one')));
  end if;

  if exists (select 1 from custom.anon_form o
              where o.organization_id = p_organization_id and o.slug = v_f.slug
                and o.deleted_at is null and o.id <> v_f.id) then
    raise exception 'Another form took the address "%" while this one was archived, so it cannot come back under it.', v_f.slug
      using errcode = '23505', hint = 'Rename or archive the form that holds the address now, then bring this one back. Nothing was changed.';
  end if;

  update custom.anon_form f
     set deleted_at = null, updated_at = now(), updated_by = auth.uid()
   where f.organization_id = p_organization_id and f.id = p_form_id
  returning * into v_f;

  return jsonb_build_object('archived', false, 'changed', true, 'form_id', v_f.id, 'kind', v_kind,
    'title', v_f.title,
    'sentence', format('The %s "%s" is back, exactly as it was.', v_word, custom.said(v_f.title, 'that one')));
end
$function$;
comment on function custom.form_restore(uuid, uuid) is
  'Chair (v6) — the undo of custom.form_archive, on the same rung (admin on the table). Refused by name when the table is archived or a live form holds the address now.';

create or replace function custom.forms_archived(p_organization_id uuid, p_table_id uuid default null, p_limit integer default 100)
 returns table(form_id uuid, table_id uuid, table_name text, kind text, title text, slug text,
               archived_at timestamp with time zone, archived_by uuid, table_archived boolean, can_restore boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.forms_archived');
  return query
    select f.id, f.table_id, t.data ->> 'name',
           case when f.presentation ? 'booking' then 'booking' else 'form' end,
           coalesce(f.title, case when f.presentation ? 'booking' then 'Book a time' end), f.slug,
           f.deleted_at, f.updated_by,
           t.deleted_at is not null,
           t.deleted_at is null
             and custom.my_level(p_organization_id, f.table_id, 'table') >= 'admin'::public.permission_level
      from custom.anon_form f
      join custom.record t
        on t.organization_id = f.organization_id and t.id = f.table_id
       and t.table_id = custom.table_kernel_id()
     where f.organization_id = p_organization_id
       and f.deleted_at is not null
       and (p_table_id is null or f.table_id = p_table_id)
       -- THE WALL. An archived form is only listed to somebody who may open the table it wrote into
       -- (an archived table is judged as it was); the list can never reveal a table.
       and custom.my_level(p_organization_id, f.table_id, 'table') is not null
     order by f.deleted_at desc, f.id
     limit custom.page_size(p_organization_id, 'custom.forms_archived', p_limit, 100, 200);
end
$function$;
comment on function custom.forms_archived(uuid, uuid, integer) is
  'Chair (v6) — Trash for forms and booking pages: the archived custom.anon_form rows of tables the caller may open, newest first, with kind (form|booking), who archived it, whether its table is archived too and whether the caller may bring it back (custom.form_restore).';

create or replace function custom.checklist_templates_archived(p_organization_id uuid, p_about_table_id uuid default null, p_limit integer default 100)
 returns table(template_id uuid, name text, about_table_id uuid, about_table text, steps integer,
               archived_at timestamp with time zone, archived_by uuid, table_archived boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_templates_archived');
  return query
    select c.id,
           c.data ->> 'name',
           nullif(c.data ->> 'about_table_id', '')::uuid,
           t.data ->> 'name',
           jsonb_array_length(coalesce(c.data -> 'steps', '[]'::jsonb)),
           c.deleted_at,
           c.updated_by,
           coalesce(t.deleted_at is not null, false)
      from custom.record c
      left join custom.record t
        on t.organization_id = c.organization_id
       and t.id = nullif(c.data ->> 'about_table_id', '')::uuid
     where c.organization_id = p_organization_id
       and c.data_class = 'checklist_template'
       and c.deleted_at is not null
       and (p_about_table_id is null
            or nullif(c.data ->> 'about_table_id', '')::uuid = p_about_table_id)
       -- THE WALL, the one custom.forms_archived asks: a template is listed to somebody who may open
       -- the table it is about; one about no table, to the person who made it.
       and (custom.query_is_store_owner()
            or case when nullif(c.data ->> 'about_table_id', '') is null
                    then c.created_by = custom.query_principal()
                    else custom.my_level(p_organization_id, nullif(c.data ->> 'about_table_id', '')::uuid, 'table') is not null
               end)
     order by c.deleted_at desc, c.id
     limit custom.page_size(p_organization_id, 'custom.checklist_templates_archived', p_limit, 100, 200);
end
$function$;
comment on function custom.checklist_templates_archived(uuid, uuid, integer) is
  'Chair (v6) — Trash for checklist templates: the archived checklist_template records of tables the caller may open (per table when p_about_table_id is named), newest first. Each comes back through custom.record_restore(organization, template_id).';

-- ── THE DOORS ────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'form_archive', 'p_organization_id uuid, p_form_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'Archives one form or booking page of the caller''s organization. custom.assert_store_door and custom.assert_client_may_reach first, then admin on the form''s table.',
   'chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; the form is matched in this organization only.')),
     'p_form_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Matched only with organization_id = p_organization_id (another organization''s form reads as absent, 02000); admin on its table decides the change.'))))),
  ('custom', 'form_restore', 'p_organization_id uuid, p_form_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'Brings back one archived form or booking page. custom.assert_store_door and custom.assert_client_may_reach first, then admin on the form''s table; refused when the table is archived or the address is taken.',
   'chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; the form is matched in this organization only.')),
     'p_form_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Matched only with organization_id = p_organization_id (another organization''s form reads as absent, 02000); admin on its table decides the change.'))))),
  ('custom', 'forms_archived', 'p_organization_id uuid, p_table_id uuid, p_limit integer',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'integer'::regtype::oid],
   'Lists the archived forms and booking pages of tables the caller may open. Reads only; custom.assert_client_may_reach first, then custom.my_level on each form''s table.',
   'chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_client_may_reach decides it first; every row is read in this organization only.')),
     'p_table_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Only a filter inside p_organization_id; each row still passes custom.my_level on its own table, so a foreign or hidden table lists nothing.'))))),
  ('custom', 'checklist_templates_archived', 'p_organization_id uuid, p_about_table_id uuid, p_limit integer',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'integer'::regtype::oid],
   'Lists the archived checklist templates the caller may see. Reads only; custom.assert_client_may_reach first, then custom.my_level on the table each template is about.',
   'chairdoors3b_c_a_form_or_a_booking_page_goes_to_trash_and_comes_back.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_client_may_reach decides it first; every row is read in this organization only.')),
     'p_about_table_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Only a filter inside p_organization_id; each template still passes custom.my_level on its own table.')))))
on conflict do nothing;

grant execute on function custom.form_archive(uuid, uuid) to authenticated;
grant execute on function custom.form_restore(uuid, uuid) to authenticated;
grant execute on function custom.forms_archived(uuid, uuid, integer) to authenticated;
grant execute on function custom.checklist_templates_archived(uuid, uuid, integer) to authenticated;

-- chair-step: lane FLIP-SEAMS — a switch goes back LOSSLESSLY. New private platform._cutover_seam_reverse_readiness; platform.cutover_seams offers "Switch back" only when it is met and says why not otherwise (reverse_readiness); platform.cutover_seam_press refuses a switch back by name while records written in the new tables since the switch are not yet carried back into the older tables. A refusal's sentence no longer ends in two full stops.
-- based-on: platform.cutover_seams(uuid) 5038d03b2a7ed7eac958dd35e15668bc2ded61654ea2ad1ee41f5fbb861635eb
-- based-on: platform.cutover_seam_press(text, uuid, text, text) 0a70432d0bcf2734f3d1c01f2e10514159a95be6ea374e77e57752ec2b8ad82e
-- lane: FLIP-SEAMS
-- INVERSE: migrations/inverse/flipseams_a_switch_goes_back_without_losing_what_was_written_down.sql

set lock_timeout = '30s';

create or replace function platform._cutover_seam_reverse_readiness(p_seam text, p_org uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
-- WHAT MUST BE TRUE BEFORE A SWITCH GOES BACK: nothing written on the new side since the switch
-- is left behind. For the data tables, every record written in a copy after the switch must be
-- carried back into its older table first (the mover's copy-back, runner --reverse --since), because
-- switching back brings the older tables back exactly as they were. The agents' context switch
-- writes nothing on the new side (the copy is fenced), so it can always go back.
declare
  v_last platform.cutover_seam_press;
  v_ids uuid[];
  v_n bigint;
begin
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if v_last.id is null or v_last.direction <> 'new' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'on_new', 'says', 'This is on the new system', 'met', false,
                         'detail', 'There is nothing to switch back.')));
  end if;

  if p_seam = 'older_tables' then
    select coalesce(array_agg(x::uuid), '{}') into v_ids
      from jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)) x;
    select count(*) into v_n
      from custom.record r
     where r.organization_id = p_org and r.table_id = any (v_ids) and r.data_class = 'record'
       and greatest(r.created_at, r.updated_at, coalesce(r.deleted_at, r.created_at)) > v_last.pressed_at
       and not exists (select 1 from workbench.udt_dataset_rows w
                        where w.id = r.id and w.updated_at >= greatest(r.updated_at, coalesce(r.deleted_at, r.updated_at)));
    return jsonb_build_object('ready', v_n = 0, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'carried_back', 'says', 'Everything written in the new tables since the switch is back in the older tables',
        'met', v_n = 0,
        'detail', case when v_n = 0 then 'Nothing was written in the new tables since the switch that the older tables lack.'
                       else format('%s records were written in the new tables since the switch. They are copied back first, so switching back loses nothing.', v_n) end)));
  end if;

  return jsonb_build_object('ready', true, 'checked_at', now(), 'checks', jsonb_build_array(
    jsonb_build_object('key', 'nothing_written', 'says', 'Nothing is written on the new side of this switch', 'met', true,
                       'detail', 'Switching back leaves nothing behind.')));
end;
$$;

revoke all on function platform._cutover_seam_reverse_readiness(text, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION platform.cutover_seams(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_is_admin boolean := false;
  v_role text;
  v_may boolean := false;
  v_may_detail text;
  v_out jsonb := '[]'::jsonb;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_latest platform.cutover_seam_press;
  v_ready jsonb;
  v_state text;
  v_back jsonb;
begin
  if p_organization_id is null
     or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours',
      'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null then
    -- No person: only the server's own key or a direct database connection may read.
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'says', 'Sign in to see this organization''s switches.');
    end if;
    v_may_detail := 'Only an owner of this organization, signed in on its settings page, can press a switch.';
  else
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours',
        'says', 'There is no organization with that id that you belong to.');
    end if;
    v_may := v_role = 'owner' or v_is_admin;
    v_may_detail := case when v_role = 'owner' then 'You are an owner of this organization.'
                         when v_is_admin then 'You are a platform admin.'
                         else 'Only an owner of this organization can press a switch.' end;
  end if;

  for s in select * from platform.cutover_seam where retired_at is null order by sort_order loop
    v_last := platform._cutover_seam_last_done(s.seam_key, p_organization_id);
    select p.* into v_latest from platform.cutover_seam_press p
     where p.seam_key = s.seam_key and p.organization_id = p_organization_id
     order by p.pressed_at desc, p.id limit 1;
    v_state := case when s.press_kind = 'already_switched' then 'new'
                    when v_last.id is null then 'old'
                    else v_last.direction end;
    v_ready := platform._cutover_seam_readiness(s.seam_key, p_organization_id);
    v_back := case when v_state = 'new' and s.press_kind = 'owner_press'
                   then platform._cutover_seam_reverse_readiness(s.seam_key, p_organization_id) end;

    v_out := v_out || jsonb_build_object(
      'key', s.seam_key,
      'title', s.title,
      'old_side', s.old_side,
      'new_side', s.new_side,
      'per_organization', s.per_organization,
      'press_kind', s.press_kind,
      'state', v_state,
      'flip_does', s.flip_does,
      'needs_first', s.needs_first,
      'reverse_does', s.reverse_does,
      'readiness', v_ready,
      'reverse_readiness', v_back,
      'may_flip', v_may and s.press_kind = 'owner_press' and v_state = 'old' and (v_ready ->> 'ready')::boolean,
      'may_reverse', v_may and s.press_kind = 'owner_press' and v_state = 'new'
                     and coalesce((v_back ->> 'ready')::boolean, false),
      'switched', case when v_last.id is null then null else jsonb_build_object(
          'direction', v_last.direction, 'at', v_last.pressed_at,
          'by', (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email) from auth.users u where u.id = v_last.pressed_by),
          'did', v_last.did) end,
      'last_press', case when v_latest.id is null then null else jsonb_build_object(
          'direction', v_latest.direction, 'outcome', v_latest.outcome, 'at', v_latest.pressed_at,
          'refusal', v_latest.refusal, 'says', v_latest.says) end);
  end loop;

  return jsonb_build_object('ok', true, 'organization_id', p_organization_id, 'checked_at', now(),
                            'may_press', v_may, 'may_press_detail', v_may_detail, 'seams', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.cutover_seam_press(p_seam_key text, p_organization_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_role text;
  v_is_admin boolean;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_state text;
  v_back jsonb;
  v_ready jsonb;
  v_press uuid := gen_random_uuid();
  v_did jsonb;
  v_refusal text;
  v_says text;
begin
  -- Refusals that name no organization of the caller's are answered, never recorded.
  if p_organization_id is null or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null or v_claims is null then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page. A server, a script or a database connection cannot press it.';
  elsif coalesce(v_claims ->> 'role', '') <> 'authenticated' or coalesce(v_claims ->> 'session_id', '') = '' then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page, not with a service key or a minted token.';
  elsif v_headers is null or coalesce(v_headers ->> 'origin', '') = '' then
    v_refusal := 'not_from_the_screen';
    v_says := 'A switch is pressed from the organization''s settings page in a browser. This request did not come from a page.';
  end if;

  if v_refusal is null then
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
    end if;
    if v_role is distinct from 'owner' and not v_is_admin then
      v_refusal := 'not_an_owner';
      v_says := 'Only an owner of this organization can press this switch.';
    end if;
  end if;

  if v_refusal is null then
    select * into s from platform.cutover_seam where seam_key = p_seam_key and retired_at is null;
    if s.seam_key is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown_switch', 'says', format('There is no switch called %s.', p_seam_key));
    elsif p_to is null or p_to not in ('new', 'old') then
      v_refusal := 'bad_direction';
      v_says := 'A switch goes to the new system or back to the old one.';
    elsif s.press_kind <> 'owner_press' then
      v_refusal := 'not_pressed_here';
      v_says := case s.press_kind when 'already_switched' then 'This one is already on the new system.'
                  else 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.' end;
    end if;
  end if;

  if v_refusal is null then
    -- One press per seam per organization at a time.
    perform pg_advisory_xact_lock(hashtextextended('cutover_seam:' || p_seam_key || ':' || p_organization_id::text, 0));
    v_last := platform._cutover_seam_last_done(p_seam_key, p_organization_id);
    v_state := coalesce(v_last.direction, 'old');
    if v_state = p_to then
      v_refusal := 'already_there';
      v_says := case p_to when 'new' then 'This organization is already on the new system here.'
                          else 'This organization is already on the old system here.' end;
    elsif p_to = 'new' then
      v_ready := platform._cutover_seam_readiness(p_seam_key, p_organization_id);
      if not (v_ready ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready yet: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_ready -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      end if;
    else
      -- LOSSLESS UNDO: nothing written on the new side since the switch may be left behind.
      v_back := platform._cutover_seam_reverse_readiness(p_seam_key, p_organization_id);
      v_ready := v_back;
      if not (v_back ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready to switch back: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_back -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      end if;
    end if;
  end if;

  if v_refusal is not null then
    if p_seam_key in (select seam_key from platform.cutover_seam) then
      insert into platform.cutover_seam_press
        (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
      values
        (v_press, p_seam_key, p_organization_id,
         case when p_to in ('new', 'old') then p_to else 'new' end,
         'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press, 'readiness', v_ready);
  end if;

  begin
    v_did := platform._cutover_seam_apply(p_seam_key, p_organization_id, p_to, v_uid, v_press);
  exception when others then
    v_refusal := 'the_step_failed';
    v_says := 'Nothing was changed: the switch stopped part way and was rolled back whole. ' || sqlerrm;
    insert into platform.cutover_seam_press
      (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
    values
      (v_press, p_seam_key, p_organization_id, p_to, 'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press);
  end;

  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, says, pressed_by, readiness, did, note)
  values
    (v_press, p_seam_key, p_organization_id, p_to, 'done',
     case p_to when 'new' then 'Switched to the new system.' else 'Switched back to the old system.' end,
     v_uid, v_ready, v_did, p_note);

  return jsonb_build_object('ok', true, 'press_id', v_press, 'state', p_to, 'did', v_did,
    'says', case p_to when 'new' then 'Switched to the new system.' else 'Switched back to the old system.' end);
end;
$function$;

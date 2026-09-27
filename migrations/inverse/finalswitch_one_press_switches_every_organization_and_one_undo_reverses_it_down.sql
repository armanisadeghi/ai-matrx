-- chair-step: lane FINAL-SWITCH inverse — removes the final switch and puts back the three bodies it replaced.
-- based-on: platform.cutover_seams(uuid) 240f67cb8f40767509637d0b179cc12359dde0270b1df27ab4ad2fdd64b4b168
-- based-on: platform.older_tables_switched(uuid) 9574aab15729e6852491fe33aae6362e3032666100590afbbec560f48e6a8833
-- based-on: platform.cutover_seam_press(text, uuid, text, text, boolean) e369b25178f6e4fc865117a3cd7abc36f4bc4a11246051b72b80d5160fa030c7
-- INVERSE of migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH).
-- Refused while the final switch is on: undo it first from its page (platform.final_switch_undo),
-- so no organization is left switched by a run nothing can reverse. Its press records stay in
-- platform.cutover_seam_press (append-only history); the seam row is retired, never deleted, when
-- a record names it.

do $$
begin
  if to_regprocedure('platform._final_switch_last()') is not null
     and coalesce((platform._final_switch_last()).direction, 'old') = 'new' then
    raise exception 'The final switch is on. Undo it from Administration → Database → Final switch before removing it.'
      using errcode = '55000';
  end if;
end $$;

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('final_switch_state', 'final_switch_readiness', 'final_switch_press', 'final_switch_undo');

-- The three bodies as they were.
CREATE OR REPLACE FUNCTION platform.cutover_seam_press(p_seam_key text, p_organization_id uuid, p_to text, p_note text DEFAULT NULL::text, p_accept_not_carried boolean DEFAULT false)
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
  v_carry jsonb;
  v_refusal text;
  v_says text;
  v_done text;
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
      -- SWITCH BACK CARRIES (SWITCH-BACK-CARRIES): what the new tables gained since the switch goes
      -- into the older tables inside this press. What cannot go is named, and the press waits for the
      -- person to confirm leaving it in the new system.
      v_back := platform._cutover_seam_reverse_readiness(p_seam_key, p_organization_id);
      v_ready := v_back;
      if not (v_back ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready to switch back: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_back -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      elsif coalesce((v_back ->> 'needs_confirm')::boolean, false) and not coalesce(p_accept_not_carried, false) then
        v_refusal := 'confirm_not_carried';
        v_says := 'Switching back leaves these in the new system: '
          || (select string_agg(x, ' ') from jsonb_array_elements_text(v_back -> 'not_carried') x)
          || ' Confirm that they stay behind, then switch back.';
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
    if p_to = 'old' and p_seam_key = 'older_tables' then
      -- The older tables are back (unarchived above); now they take what the new ones gained.
      v_carry := platform._cutover_carry_back(p_organization_id, v_last, true, v_press, v_uid,
                                              coalesce(p_accept_not_carried, false));
      v_did := v_did || jsonb_build_object('carried_back', v_carry);
    end if;
  exception when others then
    v_refusal := 'the_step_failed';
    v_says := 'Nothing was changed: the switch stopped part way and was rolled back whole. ' || sqlerrm;
    insert into platform.cutover_seam_press
      (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
    values
      (v_press, p_seam_key, p_organization_id, p_to, 'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press);
  end;

  v_done := case p_to when 'new' then 'Switched to the new system.'
                 else concat_ws(' ', 'Switched back to the old system.',
                                (select string_agg(x, ' ') from jsonb_array_elements_text(v_carry -> 'says') x)) end;

  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, says, pressed_by, readiness, did, note)
  values
    (v_press, p_seam_key, p_organization_id, p_to, 'done', v_done, v_uid, v_ready, v_did, p_note);

  return jsonb_build_object('ok', true, 'press_id', v_press, 'state', p_to, 'did', v_did, 'says', v_done);
end;
$function$

;

CREATE OR REPLACE FUNCTION platform.older_tables_switched(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select p_organization_id is not null
     and coalesce((platform._cutover_seam_last_done('older_tables', p_organization_id)).direction, 'old') = 'new';
$function$

;

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
$function$

;

drop function if exists platform.final_switch_undo(text, boolean);
drop function if exists platform.final_switch_press(text, jsonb);
drop function if exists platform.final_switch_readiness();
drop function if exists platform.final_switch_state();
drop function if exists platform._final_switch_record(text, text, text, text, jsonb, jsonb, text, uuid);
drop function if exists platform._final_switch_person_refusal();
drop function if exists platform._final_switch_readiness();
drop function if exists platform._final_switch_old_write_doors();
drop function if exists platform._final_switch_is_on();
drop function if exists platform._final_switch_last();
drop function if exists platform._final_switch_platform_org();

update platform.cutover_seam set retired_at = now()
 where seam_key = 'final_switch'
   and exists (select 1 from platform.cutover_seam_press p where p.seam_key = 'final_switch');
delete from platform.cutover_seam s
 where s.seam_key = 'final_switch'
   and not exists (select 1 from platform.cutover_seam_press p where p.seam_key = 'final_switch');

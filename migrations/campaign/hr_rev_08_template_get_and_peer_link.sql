-- chair-step: lane HR-REVIEWS. Creates ONE new door hr.hr_review_template_get(uuid) with its platform.client_callable_door row and GRANT EXECUTE to `authenticated`; replaces hr._rev_notify_peer (declared below) so its payload carries review.id; and UPDATEs the one communication.notification_event_type row hr.performance.peer_feedback_requested so its deep_link_template opens the standard review (/hr/performance/reviews/{{review.id}}) instead of the 360 route. deep_link_template is pillar-owned config that reconcile never overwrites, so a migration is the only instrument (as aidream 0545). The aidream catalog declaration changes in the same lane. No DROP, no REVOKE.
-- lane: HR-REVIEWS
-- based-on: hr._rev_notify_peer(uuid) 3e32498408ec8d9372a69537d060f1f7febf6cd8c069a4e2b5b2043be18b3c5a

update communication.notification_event_type
   set config = jsonb_set(config, '{deep_link_template}', '"/hr/performance/reviews/{{review.id}}?org={{organization.id}}"'::jsonb)
 where event_key = 'hr.performance.peer_feedback_requested' and deleted_at is null;

CREATE OR REPLACE FUNCTION hr._rev_notify_peer(p_nomination_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare n hr.review_peer_nomination%rowtype; r hr.review%rowtype; v_res jsonb; v_first text;
begin
  select * into n from hr.review_peer_nomination where id = p_nomination_id;
  select * into r from hr.review where id = n.review_id;
  if n.peer_user_id is null then return jsonb_build_object('sent', false, 'reason', 'peer_has_no_login'); end if;
  select coalesce(nullif(btrim(e.preferred_first_name), ''), nullif(btrim(e.legal_first_name), ''), 'A colleague')
    into v_first from hr.employment em join hr.employee e on e.id = em.employee_id where em.id = r.employment_id;
  begin
    v_res := communication.notify_from_sql(r.organization_id, 'hr.performance.peer_feedback_requested', n.peer_user_id,
               null, null,
               jsonb_build_object('subject', jsonb_build_object('first_name', v_first, 'id', r.employment_id),
                                  'cycle', jsonb_build_object('id', r.cycle_id), 'review', jsonb_build_object('id', r.id),
                                  'review_id', r.id),
               hr.link_names_its_employer('/hr/performance/reviews/' || r.id::text, r.organization_id),
               'hr_review', r.id, 'hr_review_peer:' || n.id::text);
  exception when others then
    raise warning 'hr._rev_notify_peer: notice for nomination % not sent [%] %', n.id, sqlstate, sqlerrm;
    return jsonb_build_object('sent', false, 'reason', 'notify_refused', 'sqlstate', sqlstate);
  end;
  return jsonb_build_object('sent', true, 'result', v_res);
end
$function$;

create function hr.hr_review_template_get(p_template_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); t hr.review_template%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into t from hr.review_template where id = p_template_id and deleted_at is null;
  if t.id is null or not hr._rev_can_manage(v_uid, t.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  return jsonb_build_object('ok', true, 'template', jsonb_build_object(
    'template_id', t.id, 'organization_id', t.organization_id, 'name', t.name, 'description', t.description,
    'is_default', t.is_default, 'version', t.version, 'sections', t.sections, 'rating_scale', t.rating_scale,
    'updated_at', t.updated_at,
    'cycle_count', (select count(*) from hr.review_cycle c where c.template_id = t.id and c.deleted_at is null)));
end
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, argument_rules)
values ('hr', 'hr_review_template_get', 'p_template_id uuid', array['uuid'::regtype]::oid[], 'hr_rev_08',
  'Standard performance reviews: one template with its sections and scale, for the template editor. Gated by performance.manage.',
  jsonb_build_object('version', 1, 'declared_by', 'hr_rev_08', 'arguments', jsonb_build_object('p_template_id',
    jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true,
      'note', 'The template''s organization is read from its row and hr._rev_can_manage decides; a foreign or invented id answers not_reachable identically.')))))
on conflict do nothing;

grant execute on function hr.hr_review_template_get(uuid) to authenticated;

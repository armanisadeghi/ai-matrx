-- chair-step: the inverse of typeform2_c_a_form_can_email_the_person_who_answered.sql. It restores custom.form_notify without the respondent copy (re-apply forms_a_form_is_a_view_on_a_table.sql's body), DROPS custom.form_respondent_copy, its door row and the custom.form.respondent_copy event type. Notices already queued are not touched.
-- lane: TYPEFORM-2
-- lock: custom,communication

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function custom.form_notify(p_organization_id uuid, p_form_id uuid, p_record_id uuid, p_submission_id uuid)
 returns uuid language plpgsql set search_path to 'pg_catalog'
as $function$
declare
  v_f custom.anon_form;
  s   record;
begin
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found or v_f.notify_rule_id is null then
    return null;
  end if;
  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where rule_id = v_f.notify_rule_id loop
    if s.recipient_user_id is null then
      continue;
    end if;
    return custom.agg_deliver(
      p_organization_id, s.rule_id, p_record_id, s.channel, s.recipient_user_id, s.event_key,
      format('New response: %s', coalesce(v_f.title, 'a form')),
      format('Somebody answered %s. It is in the table now, with the form stamped on it.',
             coalesce(v_f.title, 'your form')),
      jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                         'table_id', v_f.table_id, 'submission_id', p_submission_id,
                         'source', 'form'));
  end loop;
  return null;
end;
$function$;
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'form_respondent_copy';
drop function custom.form_respondent_copy(uuid, uuid, uuid, uuid);
update communication.notification_event_type set deleted_at = now() where event_key = 'custom.form.respondent_copy' and deleted_at is null;

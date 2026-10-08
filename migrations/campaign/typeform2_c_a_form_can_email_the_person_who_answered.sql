-- lane: TYPEFORM-2
-- lock: custom,communication
-- based-on: custom.form_notify(uuid, uuid, uuid, uuid) adddce2474f00f78a04f0aead1becc37724b4c42a300739e484edc00f42e07b4
--
-- LANE TYPEFORM-2, part c — "Email the respondent", Typeform's respondent notification.
--
-- Off unless the form says so: presentation.notify = {email_respondent: true, respondent_field:
-- "<the email question's key>"}. custom.form_notify (called by custom.form_submit once the
-- submission is accepted) now also sends ONE email to the address the person typed, through the
-- platform's one SQL notification producer (communication.notify_from_sql, recipient kind
-- `address`, its own resolver and suppression list), worded from the ending the store's route
-- reached (its title and message), else the thank-you, else a plain receipt. Event
-- `custom.form.respondent_copy` is declared in aidream's notifications/declarations.py; the row is
-- inserted here too (same words) so the email works before that server ships. A failure here is a
-- WARNING and never undoes the person's submission. The owner's subscription path is unchanged.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

insert into communication.notification_event_type
  (event_key, label, description, default_channels, config, enabled, organization_id, visibility)
select 'custom.form.respondent_copy', 'A copy for the person who answered',
       'The person who answered a form gets the form''s own closing words by email, when its owner switched it on.',
       '{"email": true}'::jsonb,
       jsonb_build_object(
         'bucket', 'direct', 'mandatory', false, 'alert_tier', 'informational', 'digestible', false,
         'sms_locked', true, 'target_kind', 'custom.record', 'max_attempts', 5, 'routing_mode', 'declared_audience',
         'push_declared', false, 'non_user_capable', true, 'deep_link_template', null, 'pair_dm_with_email', false,
         'quiet_hours_exempt', true, 'retry_base_seconds', 60, 'sender_program_key', null, 'sensitivity_ceiling', 'internal',
         'templates', jsonb_build_object('email', jsonb_build_object(
           'subject', '{{notice.subject}}',
           'body', E'{{notice.body}}\n\n--\nYou are getting this because you answered {{form.title}}.'))),
       true, t.organization_id, t.visibility
  from communication.notification_event_type t
 where t.event_key = 'custom.form.response' and t.deleted_at is null
on conflict do nothing;

create or replace function custom.form_respondent_copy(p_organization_id uuid, p_form_id uuid, p_record_id uuid, p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f       custom.anon_form;
  v_values  jsonb;
  v_key     text;
  v_to      text;
  v_route   jsonb;
  v_end     jsonb;
  v_subject text;
  v_body    text;
begin
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found or coalesce(v_f.presentation #>> '{notify,email_respondent}', 'false') <> 'true' then
    return null;
  end if;
  v_key := nullif(btrim(coalesce(v_f.presentation #>> '{notify,respondent_field}', '')), '');
  if v_key is null then return jsonb_build_object('skipped', 'no_email_question'); end if;
  select s.payload into v_values from custom.anon_submission s
   where s.organization_id = p_organization_id and s.id = p_submission_id;
  v_to := nullif(btrim(coalesce(v_values ->> v_key, '')), '');
  if v_to is null then return jsonb_build_object('skipped', 'no_address_given'); end if;

  v_route := custom._form_route(p_organization_id,
                                coalesce(v_f.presentation -> 'questions', '[]'::jsonb),
                                coalesce(v_f.presentation -> 'endings', '[]'::jsonb),
                                coalesce(v_values, '{}'::jsonb));
  select e into v_end from jsonb_array_elements(coalesce(v_f.presentation -> 'endings', '[]'::jsonb)) e
   where e ->> 'id' = v_route ->> 'ending' limit 1;
  v_subject := coalesce(nullif(btrim(v_end ->> 'title'), ''), nullif(btrim(v_f.presentation #>> '{thank_you,title}'), ''),
                        format('Thanks for answering %s', coalesce(v_f.title, 'the form')));
  v_body := coalesce(nullif(btrim(v_end ->> 'body'), ''), nullif(btrim(v_f.presentation #>> '{thank_you,body}'), ''),
                     format('Your answers to %s were received.', coalesce(v_f.title, 'the form')));

  return communication.notify_from_sql(
    p_organization_id, 'custom.form.respondent_copy', null, v_to, null,
    jsonb_build_object('notice', jsonb_build_object('subject', v_subject, 'body', v_body),
                       'form', jsonb_build_object('id', v_f.id, 'title', coalesce(v_f.title, 'a form')),
                       'submission_id', p_submission_id, 'source', 'form'),
    null, 'custom.record', p_record_id, format('form-respondent:%s', p_submission_id), '{}'::jsonb);
end;
$fn$;
grant execute on function custom.form_respondent_copy(uuid, uuid, uuid, uuid) to service_role;
comment on function custom.form_respondent_copy(uuid, uuid, uuid, uuid) is
  'TYPEFORM-2: one email to the person who answered (presentation.notify.email_respondent + respondent_field), worded from the ending reached, through communication.notify_from_sql. Called by custom.form_notify.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'form_respondent_copy', 'p_organization_id uuid, p_form_id uuid, p_record_id uuid, p_submission_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_form_id is matched with p_organization_id and the submission with the organization, so another tenant''s ids read as absent. It reads the submission''s own email answer and queues one notice to it.',
        'typeform2_c_a_form_can_email_the_person_who_answered.sql',
        'server_only: an internal step of the form submission path, called by custom.form_notify after the submission is accepted.',
        false, false)
on conflict do nothing;

create or replace function custom.form_notify(p_organization_id uuid, p_form_id uuid, p_record_id uuid, p_submission_id uuid)
 returns uuid
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_f custom.anon_form;
  s   record;
begin
  select * into v_f from custom.anon_form
   where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found then
    return null;
  end if;

  -- TYPEFORM-2: THE PERSON WHO ANSWERED, when the owner switched it on. Never undoes the answer.
  begin
    perform custom.form_respondent_copy(p_organization_id, p_form_id, p_record_id, p_submission_id);
  exception when others then
    raise warning 'custom.form_respondent_copy did not queue for submission %: %', p_submission_id, sqlerrm;
  end;

  if v_f.notify_rule_id is null then
    return null;
  end if;

  -- THE SAME READER custom.agg_subscription_fire uses, so a form's notify Rule is an
  -- ordinary subscription and an organization editing it in the notify editor is editing
  -- the same object. What is NOT asked is custom.agg_view_admits: it answers under the
  -- CURRENT principal, and the principal of a stranger's submission is nobody, so it
  -- would return false for every form on earth. The form is the membership test — an
  -- answer that arrived through THIS form is in scope for THIS form's subscription by
  -- construction.
  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where rule_id = v_f.notify_rule_id loop
    if s.recipient_user_id is null then
      continue;                        -- a subscription naming nobody tells nobody
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

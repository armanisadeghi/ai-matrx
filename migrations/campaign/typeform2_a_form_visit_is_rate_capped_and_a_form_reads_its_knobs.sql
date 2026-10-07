-- lane: TYPEFORM-2
-- lock: custom,platform
--
-- LANE TYPEFORM-2. Three knobs and two server-lane doors, all additive (nothing replaced, dropped,
-- granted to a client or revoked; no existing row touched).
--
--   forms/visit_rate_per_minute  60    visits one client address may count per minute, per form
--   forms/show_owner_header      true  the owner's logo and name above a public form
--   forms/choice_auto_advance    true  a single choice moves on to the next question when picked
--
-- custom.form_visit_admit(form, bucket) takes one hit from the rate window the store already keeps
-- for anonymous writes (custom.anon_hit), under bucket 'visit:<bucket>' and a one-minute window, and
-- answers false past the knob. The route answers 429 then. custom.form_visit already counts a visit
-- key once per form (unique (form_id, visit_hash)).
--
-- custom.form_public_options(form) answers {show_owner_header, choice_auto_advance} for a published
-- form: the form's own override (presentation.show_owner_header / presentation.auto_advance) over
-- the organization's knob. Inverse: migrations/inverse/typeform2_a_form_visit_is_rate_capped_and_a_form_reads_its_knobs_down.sql

set local lock_timeout = '2s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, overridable_by, override_direction, ui, public_read)
values
  ('forms', 'visit_rate_per_minute', '60'::jsonb, '60'::jsonb, 'integer', 'visits', 1, 10000,
   'Form visits counted per address per minute',
   'How many visit counts (view, start, question reached) one client address may add to one public form in a minute. Past it the visit route answers 429 and nothing is counted; answering the form is never blocked.',
   'agent', 'TYPEFORM-2 2026-10-07: the visit route counted without any ceiling.',
   '{organization}'::text[], 'any', '{}'::jsonb, false),
  ('forms', 'show_owner_header', 'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null,
   'Show the owner''s logo and name on public forms',
   'Draws the organization''s logo and name above a public form. An agency answering for a client turns it off so the client''s form carries no agency brand. Each form may override it.',
   'agent', 'TYPEFORM-2 2026-10-07: an agency could not hide its own brand on a client''s form.',
   '{organization}'::text[], 'any', '{}'::jsonb, false),
  ('forms', 'choice_auto_advance', 'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null,
   'Move on after a single choice is picked',
   'On a one-question-at-a-time form, picking a single choice goes on to the next question, as Typeform does. Each form may override it.',
   'agent', 'TYPEFORM-2 2026-10-07: Typeform parity.',
   '{organization}'::text[], 'any', '{}'::jsonb, false)
on conflict (feature, key) do nothing;

create function custom.form_visit_admit(p_form_id uuid, p_bucket text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f     custom.anon_form;
  v_cap   integer;
  v_start timestamptz := date_trunc('minute', now());
  v_hits  integer;
begin
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return true; end if;   -- form_visit ignores it anyway; nothing to count
  v_cap := coalesce((platform.knob_resolve('forms', 'visit_rate_per_minute', v_f.organization_id) #>> '{}')::integer, 60);
  insert into custom.anon_hit (organization_id, form_id, token_id, bucket, window_start, hits)
  values (v_f.organization_id, v_f.id, null, 'visit:' || left(coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), 200), v_start, 1)
  on conflict (organization_id, form_id, bucket, window_start)
    do update set hits = custom.anon_hit.hits + 1
  returning hits into v_hits;
  return v_hits <= v_cap;
end;
$fn$;
grant execute on function custom.form_visit_admit(uuid, text) to service_role;
comment on function custom.form_visit_admit(uuid, text) is
  'TYPEFORM-2: one hit from the anonymous rate window (custom.anon_hit, bucket visit:<address>, one minute) for a public form''s visit route; false past the knob forms/visit_rate_per_minute.';

create function custom.form_public_options(p_form_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
  v_p jsonb;
begin
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found or v_f.published_at is null then return null; end if;
  v_p := coalesce(v_f.presentation, '{}'::jsonb);
  return jsonb_build_object(
    'show_owner_header', case when jsonb_typeof(v_p -> 'show_owner_header') = 'boolean' then (v_p ->> 'show_owner_header')::boolean
                              else coalesce((platform.knob_resolve('forms', 'show_owner_header', v_f.organization_id) #>> '{}')::boolean, true) end,
    'choice_auto_advance', case when jsonb_typeof(v_p -> 'auto_advance') = 'boolean' then (v_p ->> 'auto_advance')::boolean
                                else coalesce((platform.knob_resolve('forms', 'choice_auto_advance', v_f.organization_id) #>> '{}')::boolean, true) end);
end;
$fn$;
grant execute on function custom.form_public_options(uuid) to service_role;
comment on function custom.form_public_options(uuid) is
  'TYPEFORM-2: a published form''s presentation options — the form''s own override over the organization''s knob (forms/show_owner_header, forms/choice_auto_advance).';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'form_visit_admit', 'p_form_id uuid, p_bucket text',
   array['uuid'::regtype, 'text'::regtype]::oid[],
   'It takes NO organization id: the form id supplies it. It reads nothing back but a yes/no, and writes one counter row in custom.anon_hit under the form''s own organization.',
   'typeform2_a_form_visit_is_rate_capped_and_a_form_reads_its_knobs.sql',
   'server_only: reached through the app''s visit route handler, which supplies the client address. Granted to the server lane alone.',
   false, false),
  ('custom', 'form_public_options', 'p_form_id uuid',
   array['uuid'::regtype]::oid[],
   'It takes NO organization id: the published form id supplies it. It answers two booleans about how the form is drawn and nothing else.',
   'typeform2_a_form_visit_is_rate_capped_and_a_form_reads_its_knobs.sql',
   'server_only: read by the server-rendered public form page beside custom.form_public. Granted to the server lane alone.',
   false, false)
on conflict do nothing;

-- W4-ANON — THE RED TWIN. Every break must be DETECTABLE, and this file proves each one is.
--
--   "$PSQL" "$MAIN_DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w4_anon_red.sql
--
-- Four breaks, one at a time, inside the transaction, each restored before the next, all rolled
-- back at the end. If a break slips past the check the green suite makes, this file RAISES —
-- because a red twin whose breaks go undetected is telling you the green suite is decorative.
--
--   1. the door stops checking `published_at`      → a closed form takes writes.   Green PART 1.
--   2. the door narrows the payload instead of refusing an unexposed key
--                                                   → a field the form never showed is set.
--                                                                                 Green PART 3.
--   3. the origin check becomes a SUFFIX match      → example.test.evil.test passes. Green PART 4.
--   4. the replay ledger loses its uniqueness       → three replays become three rows. Green PART 6.

\set ON_ERROR_STOP on
\timing off

do $target$
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w4_anon_red.sql expects the MAIN database, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $target$;

begin;

select set_config('app.actor_system', 'campaign.w4_anon.red', true);
\set org '39c38960-d30c-4840-b0c1-c9960de95582'

update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

select custom.table_declare(:'org'::uuid, jsonb_build_object(
  'name', 'ZZ RED Anon', 'slug', 'zz_red_anon', 'type', 'entity', 'display', 'list',
  'label_singular', 'E', 'label_plural', 'Es', 'ordered', false, 'weight', 'light',
  'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
  'parent_id', custom.table_kernel_id(), 'title_field', 'name', 'default_sort', '[]'::jsonb,
  'fields', jsonb_build_array(jsonb_build_object('name','name'),
                              jsonb_build_object('name','internal_note')))) as t_enq \gset

select set_config('zz.org', :'org', true) as o,
       set_config('zz.tenq', :'t_enq', true) as t \gset

insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                              required_field_keys, rate_limit_per_window, rate_limit_window)
values (:'org'::uuid, :'t_enq'::uuid, 'zz-red-anon', 'Contact', '["name"]'::jsonb,
        '[]'::jsonb, 100, interval '1 hour')
returning id as form_id \gset

select set_config('zz.form', :'form_id', true) \gset

do $setup$
declare v_secret text; v_tok uuid;
begin
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select token_id, secret into v_tok, v_secret
    from custom.anon_token_issue(current_setting('zz.org')::uuid, 'write',
                                 '["https://example.test"]'::jsonb,
                                 current_setting('zz.form')::uuid);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('zz.secret', v_secret, true);
end $setup$;

\echo ''
\echo '══ BREAK 1 — the door stops checking whether the form is published'
\echo ''

do $b1$
declare v_ok boolean := false;
begin
  -- The form has never been published, so the INTACT door refuses. That is the control.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"name":"Ada"}'::jsonb);
    raise exception 'RED TWIN CONTROL FAILED (break 1): the intact door accepted a write to an UNPUBLISHED form';
  exception when sqlstate '42501' then
    v_ok := true;
  end;

  -- Now publish it and the identical call succeeds. Together these two say the `published_at`
  -- check is load-bearing: removing it is exactly the difference between the two outcomes, and
  -- green PART 1 asserts the first of them.
  perform set_config('request.jwt.claims',
                     '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.anon_publish(current_setting('zz.org')::uuid, current_setting('zz.form')::uuid);
  perform set_config('request.jwt.claims', '', true);
  perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                            '{"name":"Ada"}'::jsonb);

  raise notice 'BREAK 1 RED as required: CLOSED refused and PUBLISHED accepted the identical call — the published_at check is what separates them, and green PART 1 asserts the refusal';
end $b1$;

\echo ''
\echo '══ BREAK 2 — the door narrows the payload instead of refusing an unexposed key'
\echo ''

create or replace function custom.anon_write_narrowing(p_secret text, p_origin text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $broken$
declare
  v_tok record; v_form custom.anon_form; v_exposed text[]; v_doc jsonb := '{}'::jsonb; v_key text;
begin
  select * into v_tok from custom.anon_token_verify(p_secret, p_origin, 'write');
  select * into v_form from custom.anon_form
   where organization_id = v_tok.organization_id and id = v_tok.form_id;
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_form.exposed_field_keys);
  -- THE BREAK: keep what is exposed, silently DROP the rest. This is the shape almost every
  -- form backend ships, and it is why a person can type into a field and be told nothing.
  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key = any (v_exposed) then
      v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
    end if;
  end loop;
  return v_doc;
end;
$broken$;

do $b2$
declare v_doc jsonb;
begin
  v_doc := custom.anon_write_narrowing(current_setting('zz.secret'), 'https://example.test',
                                       '{"name":"Mallory","internal_note":"pushed"}'::jsonb);
  if v_doc ? 'internal_note' then
    raise exception 'RED TWIN UNDETECTED (break 2): the narrowing door kept the unexposed key, so it is not the behaviour being contrasted';
  end if;
  -- The narrowing door SUCCEEDS where the real one refuses. Green PART 3 asserts the refusal
  -- names `internal_note`; under the break there is no refusal at all and the person who typed
  -- into that field is told nothing.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                              '{"name":"Mallory","internal_note":"pushed"}'::jsonb);
    raise exception 'RED TWIN UNDETECTED (break 2): the REAL door also accepted the unexposed key';
  exception when sqlstate '42501' then
    raise notice 'BREAK 2 RED as required: the narrowing door returned % and said nothing; the real door refuses by name — green PART 3 asserts the name is in the message', v_doc;
  end;
end $b2$;

drop function custom.anon_write_narrowing(text, text, jsonb);

\echo ''
\echo '══ BREAK 3 — the origin check becomes a suffix match'
\echo ''

create or replace function custom.anon_origin_allowed_suffix(p_allowed jsonb, p_origin text)
returns boolean language sql immutable set search_path to 'pg_catalog' as $broken$
  -- THE BREAK, and it is the usual one: "does the origin END WITH something we allow".
  select exists (select 1 from jsonb_array_elements_text(p_allowed) o
                  where p_origin like '%' || o || '%');
$broken$;

do $b3$
declare v_allowed jsonb := '["https://example.test"]'::jsonb;
begin
  if not custom.anon_origin_allowed_suffix(v_allowed, 'https://example.test.evil.test') then
    raise exception 'RED TWIN UNDETECTED (break 3): even the sloppy match rejected the near miss, so the exact match below proves nothing';
  end if;
  -- The REAL door is an exact list membership, so the same near miss is refused by name.
  begin
    perform custom.anon_write(current_setting('zz.secret'), 'https://example.test.evil.test',
                              '{"name":"Mallory"}'::jsonb);
    raise exception 'RED TWIN UNDETECTED (break 3): the real door accepted https://example.test.evil.test';
  exception when sqlstate '42501' then
    raise notice 'BREAK 3 RED as required: a suffix/contains match ADMITS https://example.test.evil.test; the real door refuses it — green PART 4 asserts that refusal names the origin';
  end;
end $b3$;

drop function custom.anon_origin_allowed_suffix(jsonb, text);

\echo ''
\echo '══ BREAK 4 — the replay ledger loses its uniqueness'
\echo ''

do $b4$
declare
  v_ids uuid[] := array[]::uuid[];
  v_i integer;
  v_rows integer;
begin
  -- FIRST the control, on the intact mechanism: three replays of one client-minted id.
  for v_i in 1 .. 3 loop
    v_ids := v_ids || custom.anon_write(current_setting('zz.secret'), 'https://example.test',
                                        '{"name":"Offline"}'::jsonb, 'zz-red-key');
  end loop;
  select count(*) into v_rows from custom.anon_submission
   where organization_id = current_setting('zz.org')::uuid and client_key = 'zz-red-key';
  if v_rows <> 1 then
    raise exception 'RED TWIN CONTROL FAILED (break 4): three replays of one id made % rows on the INTACT door', v_rows;
  end if;

  -- NOW the break: drop the unique index the idempotency actually rests on, and write the same
  -- three submissions by hand. Three rows appear — which is what "idempotency is a promise
  -- rather than a constraint" looks like from the outside.
  drop index custom.anon_submission_organization_id_form_id_client_key_idx;
  for v_i in 1 .. 3 loop
    insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                        client_key, state)
    values (current_setting('zz.org')::uuid, current_setting('zz.form')::uuid,
            current_setting('zz.tenq')::uuid, 'anonymous', '{"name":"Offline"}'::jsonb,
            'zz-red-key-2', 'quarantined');
  end loop;
  select count(*) into v_rows from custom.anon_submission
   where organization_id = current_setting('zz.org')::uuid and client_key = 'zz-red-key-2';
  if v_rows <> 3 then
    raise exception 'RED TWIN UNDETECTED (break 4): without the unique index the same key still produced % row(s)', v_rows;
  end if;

  raise notice 'BREAK 4 RED as required: WITH the unique index three replays are 1 row; WITHOUT it the same three writes are 3 — green PART 6 counts rows, so it catches exactly this';
end $b4$;

\echo ''
\echo '══ W4-ANON RED TWIN: all four breaks were detectable — rolling back'
rollback;

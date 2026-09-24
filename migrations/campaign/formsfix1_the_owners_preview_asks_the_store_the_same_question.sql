-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.form_public_asks(uuid, jsonb, text, text) 73017f51fb435c9cc1694c9c25f05cabec8b3a760a31402669ee98a02ede7315
--
-- LANE FORMS-FIX-1, PART 2 — THE OWNER'S PREVIEW ASKS THE STORE THE SAME QUESTION A STRANGER DOES.
--
-- WHAT WAS WRONG (walked on the dev clone 2026-09-24). The form builder's live preview is the
-- signed-in arm of `FormRunner`, and it answered each condition by calling `custom.rule_eval`
-- straight from the browser. That function is an internal evaluator with no
-- `platform.client_callable_door` row and no client grant, so on every real database the preview
-- printed "You do not have access to this" above the form and never branched — a screen that
-- lies to the one person who wrote the conditions.
--
-- WHAT THIS ADDS. Apply AFTER formsfix1_a_public_form_asks_the_store_which_questions_come_next.sql
-- (its `-- based-on:` line is the body that file creates).
--   1. `custom._form_questions_asked(org, questions, values)` — the ONE loop: each question's own
--      `showIf` handed to `custom.rule_eval` over the answers narrowed to the questions' own keys,
--      with an EMPTY context. Undecided and unworkable conditions SHOW the question. Internal: no
--      door row, no grant — it is called only by the two doors below.
--   2. `custom.form_public_asks` re-stated to call it — same answer, same silence rules, the loop
--      no longer written twice.
--   3. `custom.form_preview_asks(org, table, questions, values)` — the OWNER's door. It takes the
--      signed-in person's session, not a token: the organization wall
--      (`custom.assert_client_may_reach`, `custom.assert_store_door`) and then the person's own
--      rung on the Table (`custom.assert_client_may_open`, viewer) before anything is evaluated.
--      It evaluates the DRAFT the builder holds (the questions are an argument), because a preview
--      of the saved form while the owner is editing a condition would be a preview of the wrong form.
--   The grant is a separate chair step
--   (`formsfix1_a_signed_in_person_may_preview_which_questions_come_next.sql`).
-- Inverse: `migrations/inverse/formsfix1_the_owners_preview_asks_the_store_the_same_question_down.sql`.

create function custom._form_questions_asked(p_organization_id uuid,
                                             p_questions jsonb,
                                             p_values jsonb)
returns table(field_key text, asked boolean, decided boolean, said text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_keys    text[] := array[]::text[];
  v_values  jsonb := '{}'::jsonb;
  v_q       jsonb;
  v_key     text;
  v_expr    jsonb;
  v_answer  jsonb;
begin
  if jsonb_typeof(p_questions) is distinct from 'array' then return; end if;

  select coalesce(array_agg(nullif(btrim(coalesce(q ->> 'field', q ->> 'key', '')), '')), array[]::text[])
    into v_keys from jsonb_array_elements(p_questions) q;

  -- The answers, narrowed to the keys these questions ask for. Nothing else reaches a Rule.
  if jsonb_typeof(p_values) = 'object' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_values
      from jsonb_each(p_values) e
     where e.key = any (v_keys);
  end if;

  for v_q in select q.value from jsonb_array_elements(p_questions) with ordinality q(value, ord)
              order by q.ord loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    continue when v_key is null;
    v_expr := coalesce(v_q -> 'showIf', v_q -> 'show_if');
    field_key := v_key;
    said := null;
    if v_expr is null or jsonb_typeof(v_expr) = 'null' then
      asked := true; decided := true;
      return next;
      continue;
    end if;
    begin
      -- THE ONE EVALUATOR, with an empty context: the nodes that read other records refuse and
      -- the question is shown with that sentence.
      v_answer := custom.rule_eval(p_organization_id, v_expr, v_values, '{}'::jsonb);
      if v_answer = 'true'::jsonb then
        asked := true; decided := true;
      elsif v_answer = 'false'::jsonb then
        asked := false; decided := true;
      else
        asked := true; decided := false;   -- UNDECIDED IS NOT FALSE
      end if;
    exception when others then
      asked := true; decided := false; said := sqlerrm;
    end;
    return next;
  end loop;
end;
$fn$;

comment on function custom._form_questions_asked(uuid, jsonb, jsonb) is
  'FORMS-FIX-1: the one loop behind custom.form_public_asks and custom.form_preview_asks — each question''s showIf answered by custom.rule_eval over the answers narrowed to the questions'' own keys, empty context. Undecided and unworkable conditions SHOW the question. Internal; no client door.';

create or replace function custom.form_public_asks(p_form_id uuid,
                                                   p_values jsonb,
                                                   p_secret text default null,
                                                   p_origin text default null)
returns table(field_key text, asked boolean, decided boolean, said text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f   custom.anon_form;
  v_tok record;
begin
  if p_form_id is null then return; end if;

  if p_secret is not null then
    select * into v_tok from custom.anon_token_verify(p_secret, p_origin, 'write');
    if v_tok.form_id is distinct from p_form_id then
      raise exception 'This embed is for a different form.'
        using errcode = '42501',
              hint = 'The token names the one form it was issued for. Use the embed that was issued for this form.';
    end if;
  end if;

  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found or v_f.published_at is null or v_f.closed_at is not null then return; end if;
  if not custom.store_is_open(v_f.organization_id) then return; end if;

  -- The stored questions, and the answers narrowed to the keys this form EXPOSES before the loop
  -- narrows them again to the questions' own keys.
  return query
    select a.field_key, a.asked, a.decided, a.said
      from custom._form_questions_asked(
             v_f.organization_id,
             coalesce(v_f.presentation -> 'questions', '[]'::jsonb),
             case when jsonb_typeof(p_values) = 'object' then
               (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                  from jsonb_each(p_values) e where v_f.exposed_field_keys ? e.key)
             else '{}'::jsonb end) a;
end;
$fn$;

create function custom.form_preview_asks(p_organization_id uuid,
                                         p_table_id uuid,
                                         p_questions jsonb,
                                         p_values jsonb)
returns table(field_key text, asked boolean, decided boolean, said text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  -- The organization wall first, then the person's own rung on THIS Table — before anything is
  -- read or evaluated. A table they may not open answers exactly as an invented one does.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_preview_asks');
  perform custom.assert_store_door(p_organization_id, 'custom.form_preview_asks');
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.form_preview_asks',
                                        'viewer'::public.permission_level, 'table');

  return query
    select a.field_key, a.asked, a.decided, a.said
      from custom._form_questions_asked(p_organization_id, p_questions, p_values) a;
end;
$fn$;

comment on function custom.form_preview_asks(uuid, uuid, jsonb, jsonb) is
  'FORMS-FIX-1: which questions of a form the OWNER is previewing are asked, given the answers so far — the same custom._form_questions_asked the public door uses, over the draft questions the builder holds. The organization wall and the caller''s own viewer rung on the Table are decided before anything is evaluated.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'form_preview_asks', 'p_organization_id uuid, p_table_id uuid, p_questions jsonb, p_values jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach and custom.assert_store_door before anything is read. p_table_id is then asked custom.assert_client_may_open at viewer, the caller''s own rung on that Table. The questions and answers are the caller''s own draft; each question''s Rule is answered by custom.rule_eval with an empty context, so no record of any Table is read. It writes nothing.',
   'formsfix1_the_owners_preview_asks_the_store_the_same_question.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'formsfix1_the_owners_preview_asks_the_store_the_same_question.sql',
     'declared_at', '2026-09-24 lane FORMS-FIX-1',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_store_door(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane FORMS-FIX-1 — written with this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_table',
         'check', 'asked custom.assert_client_may_open(arg1, arg2, viewer, table) after arg1 is decided; a Table the caller may not open raises exactly as an invented id does.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane FORMS-FIX-1 — written with this body'),
       'p_questions', jsonb_build_object('type', 'jsonb', 'position', 3, 'not_an_id', true,
         'check', 'the caller''s own draft questions; each showIf is evaluated by custom.rule_eval with an empty context.'),
       'p_values', jsonb_build_object('type', 'jsonb', 'position', 4, 'not_an_id', true,
         'check', 'the caller''s own answers so far, narrowed to the questions'' own keys.'))))
on conflict do nothing;

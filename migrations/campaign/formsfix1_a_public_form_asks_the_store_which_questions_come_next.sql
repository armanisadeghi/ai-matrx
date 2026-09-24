-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE FORMS-FIX-1 — A PUBLIC FORM BRANCHES THE WAY ITS OWNER SET IT TO.
--
-- WHAT WAS WRONG (UI-BENCH-FORMS gap 1, measured in code 2026-09-23). The builder lets an owner
-- write "ask this only when …" on any question, and the store keeps it as a Rule expression in
-- `custom.anon_form.presentation -> 'questions' -> n -> 'showIf'`. The signed-in runner asks the
-- store (`custom.rule_eval`) whether each one is asked. The PUBLIC page — `/f/<id>`, where every
-- real respondent is — had no evaluator at all: `PublicFormRunner` dropped `showIf` on the way
-- in, so a stranger was shown every conditional question, and the owner was never told her
-- branching did not apply. Typeform's headline feature, silently inert on the one surface that
-- matters.
--
-- WHAT THIS ADDS. ONE function and its door row. It REPLACES nothing, DROPS nothing, REVOKES
-- nothing, writes no row anywhere except a token's `last_used_at` when an embed token is given
-- (that is `custom.anon_token_verify`'s own write, unchanged), and reads no record of the
-- subject Table. The grant to the server lane is a separate chair step
-- (`formsfix1_the_server_lane_can_ask_which_questions_come_next.sql`), because a GRANT is
-- refused by the additive allow-list by name. Inverse:
-- `migrations/inverse/formsfix1_a_public_form_asks_the_store_which_questions_come_next_down.sql`.
--
-- FOUR DECISIONS, EACH WITH ITS REASON
-- ------------------------------------
-- 1. THE SAME RULE, THE SAME EVALUATOR. Each question's `showIf` is handed to
--    `custom.rule_eval` — the one evaluator the signed-in runner, stage gates and the accept
--    Rule already use. No predicate is re-implemented here and none on the client. Undecided
--    (`null`, which is what a question nobody has answered yet gives) SHOWS the question, the
--    rule the signed-in arm already follows: a person is never silently skipped past something.
--
-- 2. THE CONTEXT IS EMPTY, ON PURPOSE. `rule_eval` reads other records only through nodes that
--    need `p_context.table_id` (the duplicate test and the stage count). This door passes `{}`,
--    so those nodes refuse by their own sentence and the question is SHOWN with that sentence —
--    a stranger's answers can never be used to probe whether some record exists in the Table.
--    The only values a Rule sees are the stranger's own answers, narrowed to the keys the form
--    exposes.
--
-- 3. THE LINK IS THE CAPABILITY, AND AN EMBED TOKEN IS CHECKED WHEN ONE IS GIVEN. Exactly as
--    `custom.form_public`: a form that is missing, unpublished, closed, or in an organization
--    whose store is switched off answers ZERO ROWS, so this door cannot be used to learn more
--    than the public page already shows. When an embed calls it with its write token, the token
--    is verified by `custom.anon_token_verify` (origin exact, mode `write`) and must name THIS
--    form — a token for another form is refused by name.
--
-- 4. A CONDITION THE STORE CANNOT WORK OUT IS SHOWN, WITH ITS SENTENCE. A Rule that raises (a
--    field deleted since the form was written, a node the public side cannot answer) never
--    hides a question: `asked` is true, `decided` is false and `said` carries the store's own
--    words, so the runner can say it rather than branch on a guess.

create function custom.form_public_asks(p_form_id uuid,
                                                   p_values jsonb,
                                                   p_secret text default null,
                                                   p_origin text default null)
returns table(field_key text, asked boolean, decided boolean, said text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f       custom.anon_form;
  v_tok     record;
  v_values  jsonb := '{}'::jsonb;
  v_q       jsonb;
  v_key     text;
  v_expr    jsonb;
  v_answer  jsonb;
begin
  if p_form_id is null then return; end if;

  -- An embed names itself with its token; the token has to be THIS form's.
  if p_secret is not null then
    select * into v_tok from custom.anon_token_verify(p_secret, p_origin, 'write');
    if v_tok.form_id is distinct from p_form_id then
      raise exception 'This embed is for a different form.'
        using errcode = '42501',
              hint = 'The token names the one form it was issued for. Use the embed that was issued for this form.';
    end if;
  end if;

  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  -- Silence for everything the public page is silent or closed about: missing, unpublished,
  -- closed, and a store that is switched off. Nothing to branch on a page that asks nothing.
  if not found or v_f.published_at is null or v_f.closed_at is not null then return; end if;
  if not custom.store_is_open(v_f.organization_id) then return; end if;

  -- The stranger's answers, narrowed to the keys this form asks for. Anything else is dropped
  -- here rather than refused: this is a question about the NEXT step, and the submit door is
  -- the one that refuses an unknown key by name.
  if jsonb_typeof(p_values) = 'object' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_values
      from jsonb_each(p_values) e
     where v_f.exposed_field_keys ? e.key;
  end if;

  for v_q in select q.value
               from jsonb_array_elements(coalesce(v_f.presentation -> 'questions', '[]'::jsonb))
                    with ordinality q(value, ord)
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
      v_answer := custom.rule_eval(v_f.organization_id, v_expr, v_values, '{}'::jsonb);
      if v_answer = 'true'::jsonb then
        asked := true; decided := true;
      elsif v_answer = 'false'::jsonb then
        asked := false; decided := true;
      else
        -- UNDECIDED IS NOT FALSE. Nobody has answered what this condition is about yet.
        asked := true; decided := false;
      end if;
    exception when others then
      asked := true; decided := false; said := sqlerrm;
    end;
    return next;
  end loop;
end;
$fn$;

comment on function custom.form_public_asks(uuid, jsonb, text, text) is
  'FORMS-FIX-1 / DOOR-17: which of a published form''s questions are asked, given the answers so far. Each question''s showIf is answered by custom.rule_eval — the one evaluator — over the stranger''s own answers narrowed to the exposed keys, with an empty context so no record of the subject Table is read. Undecided and unworkable conditions SHOW the question. Missing, unpublished, closed and store-off forms answer zero rows, like custom.form_public. An embed token, when given, is verified and must name this form.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'form_public_asks',
        'p_form_id uuid, p_values jsonb, p_secret text, p_origin text',
        array['uuid'::regtype, 'jsonb'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'It takes NO organization id: the form id supplies the organization, so a caller cannot name a tenant. The form id IS the capability, exactly as custom.form_public; an embed token, when given, is verified by custom.anon_token_verify and must name this form. It reads custom.anon_form and hands each question''s own Rule to custom.rule_eval with the caller''s answers narrowed to the exposed keys and an EMPTY context, so no record of the subject table is ever read. Missing, unpublished, closed and store-switched-off answer zero rows.',
        'formsfix1_a_public_form_asks_the_store_which_questions_come_next.sql',
        'server_only: the public form page is server-rendered and its answers reach this door through the app''s own route handler, which is the only thing that knows the request''s real origin. Schema custom stays revoked from anon; this door is granted to the server lane alone, the same posture as custom.form_public.',
        false, false)
on conflict do nothing;

-- target: branch,production
-- requires: typeform_a_form_visit_is_counted_by_the_store.sql (the table custom.anon_form_visit)
-- additive: yes
--   It ADDS eight functions (`custom._form_route`, `custom._form_flow_judge`,
--   `custom._form_always_asked`, `custom.form_theme_options`, `custom.form_public_route`,
--   `custom.form_preview_route`, `custom.form_visit`, `custom.form_results`) and four
--   `platform.client_callable_door` rows. It REPLACES four live bodies: `custom._form_questions_asked`
--   answers from the route (showIf + logic jumps, same rows); `custom.form_declare` judges the new
--   presentation parts and builds its own accept Rule only from always-asked questions;
--   `custom.form_submit` checks required answers against the route, keeps hidden fields, ending
--   and score on the submission and completes the visit; `custom.form_public` turns the welcome,
--   ending and background pictures into addresses. Nothing is dropped, granted or revoked; no
--   existing row is rewritten. A form saved before this file answers exactly as before (no jumps,
--   no endings, no hidden fields). The grants are the chair step
--   `typeform_a_signed_in_person_may_preview_a_route_and_read_results.sql`. The inverse is
--   `migrations/inverse/typeform_a_form_routes_scores_and_counts_itself_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- lane: TYPEFORM-DUP
-- based-on: custom.form_submit(uuid, text, jsonb, text, text, text) c45c4f1d0e9258f6ab0f8f03ec7442fbcfae82eb899a4130553c42bd0d410f58
-- based-on: custom.form_declare(uuid, uuid, text, jsonb, jsonb, integer, uuid, uuid, uuid, text) 0dd8a5f734343c3f6d3982e7c31fff543072335513fed8c149372a53f87122c0
-- based-on: custom.form_public(uuid) 8f1eb2b0833444d7b2737b571ff5cbf3a2de1cbb8e81c21fc241ae14307ad619
-- based-on: custom._form_questions_asked(uuid, jsonb, jsonb) 305afb5180c1829429cbe9463e1a9069df3fa10340e4d48a1902127d5d2e1456
--
-- LANE TYPEFORM-DUP (Arman, 2026-10-07: "when it comes to forms, it's not even close to the best
-- so we need to create a TypeForm dup"). Typeform's bar, on the store's own doors:
--
--   1. LOGIC JUMPS. presentation.questions[].jumps = [{"when": <Rule>, "to": {"question": "<key>"}
--      | {"ending": "<id>"}}]. The STORE judges the route (custom._form_route), the same way it
--      answers showIf: the first jump whose Rule is TRUE is taken, undecided falls through.
--   2. ENDINGS AND A WELCOME SCREEN. presentation.endings = [{id, title, body, picture_file_id,
--      button_label, redirect_url, when, score_min, score_max}], presentation.welcome = {title,
--      body, picture_file_id, button_label}. Pictures are the organization's public pictures,
--      redirects its own sites — the same two rules the look and the thank-you already keep.
--   3. HIDDEN FIELDS. presentation.hidden_fields = ["utm_source", "ref", …]: read from the link by
--      the page, sent beside the answers as `_hidden`, kept on the submission (metadata.hidden).
--   4. RESULTS. custom.anon_form_visit + custom.form_visit count views, starts and the questions
--      reached through the app's own route — no cookie, no third party; custom.form_results reads
--      them with the submissions.
--   6. SCORING. presentation.questions[].points = {"<answer>": <number>}; an ending may ask for
--      score_min / score_max.
--   7. THEMES. presentation.theme.font / button / background (+ background_file_id), each one of
--      the design system's named options (custom.form_theme_options).
--
-- SPACES' FORM VIEW (shipped 499dd3cf17) declares and answers forms through these same doors.
-- Its forms carry none of the new parts, so every replaced body answers them exactly as before;
-- the one change it sees is the class fix below.
--
-- THE CLASS FIX. A required question behind a condition used to be demanded even when its
-- condition hid it (custom.form_submit), and the accept Rule a form made for itself demanded it
-- too (so the record was held). Required now means required WHEN ASKED, judged by the route.
--
-- LOCKS. create table / index / function, four CREATE OR REPLACE, inserts into one registry.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE ROUTE. One walk over the questions, judged here and nowhere else.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Given the questions (each with its own `showIf`, `jumps` and `points`), the endings and the
-- answers so far, it answers:
--   asks    one row per question, in order: {field_key, asked, decided, said} — exactly the
--           shape custom._form_questions_asked always answered, so every reader of that shape
--           (the public asks door, the owner's preview, Spaces' form view) branches by jumps too.
--   ending  the id of the ending this person reaches, or null for the form's thank-you screen.
--   score   the sum of the points of the answers given, or null when no question carries points.
--
-- THE WALK. Start at question one. A question whose `showIf` is false is skipped. Otherwise it is
-- on the path; its answer adds its points; its `jumps` are read in order and the FIRST whose
-- `when` the store answers `true` is taken (a jump with no `when` is "always"). A jump to a later
-- question skips everything between; a jump to an ending ends the path. UNDECIDED FALLS THROUGH:
-- a `when` that is false, null (an unanswered question) or unworkable goes on to the next question,
-- so nobody is ever jumped past something on a guess. Jumps only go FORWARD (form_declare refuses
-- a backward one), so the walk always ends.
--
-- THE ENDING, WHEN NO JUMP CHOSE ONE. The endings that carry a condition (`when`, `score_min`,
-- `score_max`) are read in order and the first whose every condition holds wins; when none does,
-- the first ending with no condition is the default; with none of those, the thank-you screen.
create function custom._form_route(p_organization_id uuid, p_questions jsonb, p_endings jsonb, p_values jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_qs      jsonb := case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end;
  v_ends    jsonb := case when jsonb_typeof(p_endings) = 'array' then p_endings else '[]'::jsonb end;
  v_n       integer;
  v_keys    text[];
  v_values  jsonb := '{}'::jsonb;
  v_asked   boolean[];
  v_decided boolean[];
  v_said    text[];
  i         integer := 1;
  j         integer;
  k         integer;
  v_q       jsonb;
  v_expr    jsonb;
  v_ans     jsonb;
  v_v       jsonb;
  v_pts     jsonb;
  v_el      jsonb;
  v_jump    jsonb;
  v_to      jsonb;
  v_ending  text;
  v_score   numeric := 0;
  v_scored  boolean := false;
  v_end     jsonb;
  v_match   boolean;
  v_out     jsonb := '[]'::jsonb;
begin
  v_n := jsonb_array_length(v_qs);
  if v_n = 0 then
    return jsonb_build_object('asks', '[]'::jsonb, 'ending', null, 'score', null);
  end if;

  select array_agg(nullif(btrim(coalesce(q.value ->> 'field', q.value ->> 'key', '')), '') order by q.ord)
    into v_keys from jsonb_array_elements(v_qs) with ordinality q(value, ord);

  -- The answers, narrowed to the keys these questions ask for. Nothing else reaches a Rule.
  if jsonb_typeof(p_values) = 'object' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_values
      from jsonb_each(p_values) e where e.key = any (v_keys);
  end if;

  v_asked   := array_fill(false, array[v_n]);
  v_decided := array_fill(true, array[v_n]);
  v_said    := array_fill(null::text, array[v_n]);
  v_scored  := exists (select 1 from jsonb_array_elements(v_qs) q where jsonb_typeof(q -> 'points') = 'object');

  while i <= v_n loop
    v_q := v_qs -> (i - 1);
    if v_keys[i] is null then i := i + 1; continue; end if;

    v_expr := coalesce(v_q -> 'showIf', v_q -> 'show_if');
    if v_expr is not null and jsonb_typeof(v_expr) <> 'null' then
      begin
        v_ans := custom.rule_eval(p_organization_id, v_expr, v_values, '{}'::jsonb);
        if v_ans = 'false'::jsonb then
          v_asked[i] := false; v_decided[i] := true; i := i + 1; continue;
        elsif v_ans is distinct from 'true'::jsonb then
          v_decided[i] := false;                       -- UNDECIDED IS NOT FALSE
        end if;
      exception when others then
        v_decided[i] := false; v_said[i] := sqlerrm;
      end;
    end if;
    v_asked[i] := true;

    -- POINTS: {"<answer>": <number>}; a list answer adds the points of each of its parts.
    v_v := v_values -> v_keys[i];
    v_pts := v_q -> 'points';
    if jsonb_typeof(v_pts) = 'object' and v_v is not null and jsonb_typeof(v_v) <> 'null' then
      if jsonb_typeof(v_v) = 'array' then
        for v_el in select value from jsonb_array_elements(v_v) loop
          if jsonb_typeof(v_pts -> (v_el #>> '{}')) = 'number' then
            v_score := v_score + (v_pts ->> (v_el #>> '{}'))::numeric;
          end if;
        end loop;
      elsif jsonb_typeof(v_pts -> (v_v #>> '{}')) = 'number' then
        v_score := v_score + (v_pts ->> (v_v #>> '{}'))::numeric;
      end if;
    end if;

    -- JUMPS: the first whose `when` is TRUE. Undecided falls through.
    v_to := null;
    if jsonb_typeof(v_q -> 'jumps') = 'array' then
      for v_jump in select value from jsonb_array_elements(v_q -> 'jumps') loop
        begin
          if v_jump -> 'when' is null or jsonb_typeof(v_jump -> 'when') = 'null' then
            v_ans := 'true'::jsonb;
          else
            v_ans := custom.rule_eval(p_organization_id, v_jump -> 'when', v_values, '{}'::jsonb);
          end if;
        exception when others then
          v_ans := null;
        end;
        if v_ans = 'true'::jsonb then v_to := v_jump -> 'to'; exit; end if;
      end loop;
    end if;

    if jsonb_typeof(v_to) = 'object' and nullif(v_to ->> 'ending', '') is not null then
      v_ending := v_to ->> 'ending';
      for k in i + 1 .. v_n loop v_asked[k] := false; v_decided[k] := true; end loop;
      exit;
    elsif jsonb_typeof(v_to) = 'object' and nullif(v_to ->> 'question', '') is not null then
      j := array_position(v_keys, v_to ->> 'question');
      if j is not null and j > i then
        for k in i + 1 .. j - 1 loop v_asked[k] := false; v_decided[k] := true; end loop;
        i := j;
        continue;
      end if;
    end if;
    i := i + 1;
  end loop;

  -- THE ENDING NO JUMP CHOSE: the first conditional ending that holds, else the first plain one.
  if v_ending is null and jsonb_array_length(v_ends) > 0 then
    for v_end in select value from jsonb_array_elements(v_ends) loop
      continue when not (v_end ? 'when' or v_end ? 'score_min' or v_end ? 'score_max');
      v_match := true;
      if jsonb_typeof(v_end -> 'score_min') = 'number' then
        v_match := v_match and v_score >= (v_end ->> 'score_min')::numeric;
      end if;
      if jsonb_typeof(v_end -> 'score_max') = 'number' then
        v_match := v_match and v_score <= (v_end ->> 'score_max')::numeric;
      end if;
      if v_match and jsonb_typeof(v_end -> 'when') = 'object' then
        begin
          v_match := custom.rule_eval(p_organization_id, v_end -> 'when', v_values, '{}'::jsonb) = 'true'::jsonb;
        exception when others then
          v_match := false;
        end;
      end if;
      if v_match then v_ending := v_end ->> 'id'; exit; end if;
    end loop;
    if v_ending is null then
      select e ->> 'id' into v_ending from jsonb_array_elements(v_ends) e
       where not (e ? 'when' or e ? 'score_min' or e ? 'score_max') limit 1;
    end if;
  end if;

  for k in 1 .. v_n loop
    continue when v_keys[k] is null;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'field_key', v_keys[k], 'asked', v_asked[k], 'decided', v_decided[k], 'said', v_said[k]));
  end loop;
  return jsonb_build_object('asks', v_out, 'ending', v_ending,
                            'score', case when v_scored then to_jsonb(v_score) else null end);
end;
$fn$;

comment on function custom._form_route(uuid, jsonb, jsonb, jsonb) is
  'TYPEFORM-DUP (2026-10-07): the ONE route walk of a form — showIf, logic jumps (forward only, first true wins, undecided falls through), points and the ending chosen by a jump, by condition or by score. custom._form_questions_asked, custom.form_public_route, custom.form_preview_route and custom.form_submit all read it.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE FLOW, JUDGED WHEN THE FORM IS SAVED. Refused by name, never trimmed in silence.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The named options a form's theme may carry. They are the design system's own words
-- (@ai-matrx/design-system FORM_FONTS / FORM_BUTTON_STYLES / FORM_BACKGROUNDS): a host draws them,
-- it never takes CSS from a form.
create function custom.form_theme_options()
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select jsonb_build_object(
    'font',       jsonb_build_array('system', 'serif', 'rounded', 'mono'),
    'button',     jsonb_build_array('solid', 'outline', 'pill', 'square'),
    'background', jsonb_build_array('plain', 'tinted', 'muted', 'picture'));
$fn$;

create function custom._form_flow_judge(p_organization_id uuid, p_presentation jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_p       jsonb := coalesce(p_presentation, '{}'::jsonb);
  v_qs      jsonb := coalesce(p_presentation -> 'questions', '[]'::jsonb);
  v_keys    text[];
  v_ends    jsonb := '[]'::jsonb;
  v_end_ids text[] := array[]::text[];
  v_e       jsonb;
  v_q       jsonb;
  v_jump    jsonb;
  v_i       integer;
  v_j       integer;
  v_id      text;
  v_txt     text;
  v_said    text;
  v_hidden  text[] := array[]::text[];
  v_theme   jsonb;
  v_opts    jsonb := custom.form_theme_options();
  v_part    text;
  v_w       jsonb;
begin
  select coalesce(array_agg(nullif(btrim(coalesce(q.value ->> 'field', q.value ->> 'key', '')), '') order by q.ord), array[]::text[])
    into v_keys from jsonb_array_elements(v_qs) with ordinality q(value, ord);

  -- ENDINGS: [{id, title, body, picture_file_id, button_label, redirect_url, when, score_min, score_max}]
  if v_p ? 'endings' and jsonb_typeof(v_p -> 'endings') not in ('array', 'null') then
    raise exception 'A form''s endings are a list of screens, not %.', jsonb_typeof(v_p -> 'endings')
      using errcode = '22023', hint = 'presentation.endings is [{"id": "booked", "title": "…", "body": "…"}]. Nothing was written.';
  end if;
  if jsonb_typeof(v_p -> 'endings') = 'array' then
    for v_e in select value from jsonb_array_elements(v_p -> 'endings') loop
      if jsonb_typeof(v_e) <> 'object' then
        raise exception 'Each ending is a screen with an id, a title and a message.' using errcode = '22023';
      end if;
      v_id := btrim(coalesce(v_e ->> 'id', ''));
      if v_id !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then
        raise exception 'An ending''s id is a short name in lower-case letters, digits, - and _, and "%" is not one.', v_id
          using errcode = '22023', hint = 'For example "booked" or "not-a-fit". Nothing was written.';
      end if;
      if v_id = any (v_end_ids) then
        raise exception 'Two endings are both called "%".', v_id using errcode = '22023', hint = 'Each ending has its own id. Nothing was written.';
      end if;
      v_end_ids := v_end_ids || v_id;
      v_txt := nullif(btrim(coalesce(v_e ->> 'redirect_url', '')), '');
      if v_txt is not null then
        v_said := custom.form_redirect_refusal(p_organization_id, v_txt);
        if v_said is not null then
          raise exception 'Ending "%": %', v_id, v_said using errcode = '22023';
        end if;
      end if;
      v_txt := nullif(btrim(coalesce(v_e ->> 'picture_file_id', '')), '');
      if v_txt is not null and (v_txt !~ '^[0-9a-fA-F-]{36}$'
          or custom._portal_picture_url(p_organization_id, v_txt::uuid, true) is null) then
        raise exception 'The picture on ending "%" is not one of this organization''s public pictures, so the people answering could not see it.', v_id
          using errcode = '22023', hint = 'Share the picture publicly in Files, or pick another one. Nothing was written.';
      end if;
      foreach v_part in array array['score_min', 'score_max'] loop
        if v_e ? v_part and jsonb_typeof(v_e -> v_part) not in ('number', 'null') then
          raise exception 'Ending "%" has a % that is not a number.', v_id, replace(v_part, '_', ' ') using errcode = '22023';
        end if;
      end loop;
      if v_e ? 'when' and jsonb_typeof(v_e -> 'when') not in ('object', 'null') then
        raise exception 'Ending "%" has a condition that is not a Rule.', v_id using errcode = '22023';
      end if;
      v_ends := v_ends || jsonb_build_array(jsonb_strip_nulls(v_e) || jsonb_build_object('id', v_id));
    end loop;
    v_p := jsonb_set(v_p, '{endings}', v_ends);
  end if;

  -- JUMPS AND POINTS, per question.
  v_i := 0;
  for v_q in select value from jsonb_array_elements(v_qs) loop
    v_i := v_i + 1;
    if v_q ? 'jumps' and jsonb_typeof(v_q -> 'jumps') not in ('array', 'null') then
      raise exception 'The jumps on "%" are a list, not %.', v_keys[v_i], jsonb_typeof(v_q -> 'jumps') using errcode = '22023';
    end if;
    if jsonb_typeof(v_q -> 'jumps') = 'array' then
      for v_jump in select value from jsonb_array_elements(v_q -> 'jumps') loop
        if jsonb_typeof(v_jump -> 'to') <> 'object' then
          raise exception 'A jump on "%" does not say where it goes.', v_keys[v_i]
            using errcode = '22023', hint = 'Each jump is {"when": <Rule>, "to": {"question": "<key>"}} or {"to": {"ending": "<ending id>"}}. Nothing was written.';
        end if;
        if v_jump ? 'when' and jsonb_typeof(v_jump -> 'when') not in ('object', 'null') then
          raise exception 'A jump on "%" has a condition that is not a Rule.', v_keys[v_i] using errcode = '22023';
        end if;
        if nullif(v_jump #>> '{to,ending}', '') is not null then
          if not ((v_jump #>> '{to,ending}') = any (v_end_ids)) then
            raise exception 'A jump on "%" goes to the ending "%", and this form has no such ending.', v_keys[v_i], v_jump #>> '{to,ending}'
              using errcode = '23503', hint = format('Its endings are: %s. Nothing was written.', coalesce(nullif(array_to_string(v_end_ids, ', '), ''), '(none)'));
          end if;
        elsif nullif(v_jump #>> '{to,question}', '') is not null then
          v_j := array_position(v_keys, v_jump #>> '{to,question}');
          if v_j is null then
            raise exception 'A jump on "%" goes to "%", and this form asks no such question.', v_keys[v_i], v_jump #>> '{to,question}'
              using errcode = '23503';
          end if;
          if v_j <= v_i then
            raise exception 'A jump on "%" goes back to "%". Jumps only go forward, so nobody is sent round in a circle.', v_keys[v_i], v_jump #>> '{to,question}'
              using errcode = '22023', hint = 'Move the question later, or jump to a later one. Nothing was written.';
          end if;
        else
          raise exception 'A jump on "%" goes nowhere.', v_keys[v_i]
            using errcode = '22023', hint = '"to" names a question ({"question": "<key>"}) or an ending ({"ending": "<id>"}). Nothing was written.';
        end if;
      end loop;
    end if;
    if v_q ? 'points' and jsonb_typeof(v_q -> 'points') not in ('object', 'null') then
      raise exception 'The points on "%" are a list of answers and what each is worth.', v_keys[v_i]
        using errcode = '22023', hint = 'presentation.questions[].points is {"<answer>": <number>}. Nothing was written.';
    end if;
    if jsonb_typeof(v_q -> 'points') = 'object'
       and exists (select 1 from jsonb_each(v_q -> 'points') e where jsonb_typeof(e.value) <> 'number') then
      raise exception 'Every answer''s points on "%" is a number.', v_keys[v_i] using errcode = '22023';
    end if;
  end loop;

  -- WELCOME: {title, body, picture_file_id, button_label}.
  if v_p ? 'welcome' and jsonb_typeof(v_p -> 'welcome') not in ('object', 'null') then
    raise exception 'A form''s welcome screen is a title, a message, a picture and a button.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_p -> 'welcome') = 'object' then
    v_w := jsonb_strip_nulls(v_p -> 'welcome');
    v_txt := nullif(btrim(coalesce(v_w ->> 'picture_file_id', '')), '');
    if v_txt is not null and (v_txt !~ '^[0-9a-fA-F-]{36}$'
        or custom._portal_picture_url(p_organization_id, v_txt::uuid, true) is null) then
      raise exception 'The welcome picture is not one of this organization''s public pictures, so the people answering could not see it.'
        using errcode = '22023', hint = 'Share the picture publicly in Files, or pick another one. Nothing was written.';
    end if;
    v_p := case when v_w = '{}'::jsonb then v_p - 'welcome' else jsonb_set(v_p, '{welcome}', v_w) end;
  end if;

  -- HIDDEN FIELDS: names read from the link, kept on the submission, never shown.
  if v_p ? 'hidden_fields' and jsonb_typeof(v_p -> 'hidden_fields') not in ('array', 'null') then
    raise exception 'A form''s hidden fields are a list of names.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_p -> 'hidden_fields') = 'array' then
    for v_txt in select btrim(value #>> '{}') from jsonb_array_elements(v_p -> 'hidden_fields') loop
      if v_txt !~ '^[A-Za-z_][A-Za-z0-9_]{0,63}$' or v_txt in ('resume', 'embed') then
        raise exception 'A hidden field is named in letters, digits and _, and "%" cannot be one.', v_txt
          using errcode = '22023', hint = 'For example utm_source or ref. resume and embed are the link''s own words. Nothing was written.';
      end if;
      if v_txt = any (v_keys) then
        raise exception '"%" is already a question on this form, so it cannot also be a hidden field.', v_txt
          using errcode = '22023', hint = 'A question with that key is already filled from the link (prefill). Nothing was written.';
      end if;
      if not (v_txt = any (v_hidden)) then v_hidden := v_hidden || v_txt; end if;
    end loop;
    if array_length(v_hidden, 1) > 20 then
      raise exception 'A form keeps at most 20 hidden fields.' using errcode = '22023';
    end if;
    v_p := jsonb_set(v_p, '{hidden_fields}', to_jsonb(v_hidden));
  end if;

  -- THEME: the named options only.
  v_theme := v_p -> 'theme';
  if jsonb_typeof(v_theme) = 'object' then
    foreach v_part in array array['font', 'button', 'background'] loop
      v_txt := nullif(btrim(coalesce(v_theme ->> v_part, '')), '');
      continue when v_txt is null;
      if not ((v_opts -> v_part) ? v_txt) then
        raise exception 'A form''s % is one of %, and "%" is not one of them.', v_part,
          (select string_agg(x, ', ') from jsonb_array_elements_text(v_opts -> v_part) x), v_txt
          using errcode = '22023', hint = 'These are the design system''s own options. Nothing was written.';
      end if;
    end loop;
    v_txt := nullif(btrim(coalesce(v_theme ->> 'background_file_id', '')), '');
    if v_txt is not null and (v_txt !~ '^[0-9a-fA-F-]{36}$'
        or custom._portal_picture_url(p_organization_id, v_txt::uuid, true) is null) then
      raise exception 'The background picture is not one of this organization''s public pictures, so the people answering could not see it.'
        using errcode = '22023', hint = 'Share the picture publicly in Files, or pick another one. Nothing was written.';
    end if;
    if v_theme ->> 'background' = 'picture' and v_txt is null then
      raise exception 'A picture background needs a picture.' using errcode = '22023', hint = 'Pick one from Files, or choose another background. Nothing was written.';
    end if;
  end if;
  return v_p;
end;
$fn$;

-- The keys a form ALWAYS asks: no showIf, and no jump can carry anybody past it. Only these may
-- go into the accept Rule a form makes for itself — a required question a jump can skip is
-- required WHEN ASKED, which is custom.form_submit's own route-aware check.
create function custom._form_always_asked(p_questions jsonb)
returns text[]
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_qs    jsonb := case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end;
  v_n     integer := jsonb_array_length(case when jsonb_typeof(p_questions) = 'array' then p_questions else '[]'::jsonb end);
  v_keys  text[];
  v_skip  boolean[];
  v_q     jsonb;
  v_jump  jsonb;
  v_i     integer := 0;
  v_j     integer;
  k       integer;
  v_out   text[] := array[]::text[];
begin
  if v_n = 0 then return v_out; end if;
  select array_agg(nullif(btrim(coalesce(q.value ->> 'field', q.value ->> 'key', '')), '') order by q.ord)
    into v_keys from jsonb_array_elements(v_qs) with ordinality q(value, ord);
  v_skip := array_fill(false, array[v_n]);
  for v_q in select value from jsonb_array_elements(v_qs) loop
    v_i := v_i + 1;
    if coalesce(v_q -> 'showIf', v_q -> 'show_if') is not null
       and jsonb_typeof(coalesce(v_q -> 'showIf', v_q -> 'show_if')) <> 'null' then
      v_skip[v_i] := true;
    end if;
    if jsonb_typeof(v_q -> 'jumps') = 'array' then
      for v_jump in select value from jsonb_array_elements(v_q -> 'jumps') loop
        if nullif(v_jump #>> '{to,ending}', '') is not null then
          for k in v_i + 1 .. v_n loop v_skip[k] := true; end loop;
        else
          v_j := array_position(v_keys, v_jump #>> '{to,question}');
          if v_j is not null then
            for k in v_i + 1 .. v_j - 1 loop v_skip[k] := true; end loop;
          end if;
        end if;
      end loop;
    end if;
  end loop;
  for k in 1 .. v_n loop
    if v_keys[k] is not null and not v_skip[k] then v_out := v_out || v_keys[k]; end if;
  end loop;
  return v_out;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE TWO ROUTE DOORS: the stranger's (server lane) and the owner's preview (signed in).
-- ─────────────────────────────────────────────────────────────────────────────────────────
create function custom.form_public_route(p_form_id uuid, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f custom.anon_form;
begin
  if p_form_id is null then return null; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found or v_f.published_at is null or v_f.closed_at is not null then return null; end if;
  if not custom.store_is_open(v_f.organization_id) then return null; end if;
  return custom._form_route(
    v_f.organization_id,
    coalesce(v_f.presentation -> 'questions', '[]'::jsonb),
    coalesce(v_f.presentation -> 'endings', '[]'::jsonb),
    case when jsonb_typeof(p_values) = 'object' then
      (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
         from jsonb_each(p_values) e where v_f.exposed_field_keys ? e.key)
    else '{}'::jsonb end);
end;
$fn$;

create function custom.form_preview_route(p_organization_id uuid, p_table_id uuid, p_questions jsonb, p_endings jsonb, p_values jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_preview_route');
  perform custom.assert_store_door(p_organization_id, 'custom.form_preview_route');
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.form_preview_route',
                                        'viewer'::public.permission_level, 'table');
  return custom._form_route(p_organization_id, p_questions, p_endings, p_values);
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. VIEWS AND STARTS, COUNTED HONESTLY. One row per visit to a public form, keyed by the hash
-- of a random key the page makes for that visit and keeps in memory (no cookie, no third
-- party, nothing that follows a person between visits). `view` when the page opens, `start`
-- at the first answer, `reach` as each question is shown; custom.form_submit marks it done.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The table itself is born in the chair step typeform_a_form_visit_is_counted_by_the_store.sql
-- (a new table registers its entity token in the same transaction, which is a chair step).


create function custom.form_visit(p_form_id uuid, p_visit text, p_event text, p_field text default null)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f    custom.anon_form;
  v_hash text;
begin
  if p_form_id is null or p_visit is null or p_visit !~ '^[A-Za-z0-9_-]{16,128}$' then return 'ignored'; end if;
  if p_event not in ('view', 'start', 'reach') then
    raise exception 'A visit is a view, a start or a question reached, not "%".', p_event using errcode = '22023';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found or v_f.published_at is null or v_f.closed_at is not null then return 'ignored'; end if;
  if not custom.store_is_open(v_f.organization_id) then return 'ignored'; end if;
  v_hash := encode(extensions.digest(p_visit, 'sha256'), 'hex');

  insert into custom.anon_form_visit (organization_id, form_id, visit_hash)
  values (v_f.organization_id, v_f.id, v_hash)
  on conflict (form_id, visit_hash) do nothing;

  if p_event = 'start' then
    update custom.anon_form_visit set started_at = coalesce(started_at, now()), updated_at = now()
     where form_id = v_f.id and visit_hash = v_hash and completed_at is null;
  elsif p_event = 'reach' and p_field is not null and v_f.exposed_field_keys ? p_field then
    update custom.anon_form_visit
       set last_field_key = p_field,
           reached = case when reached ? p_field then reached else reached || to_jsonb(p_field) end,
           updated_at = now()
     where form_id = v_f.id and visit_hash = v_hash and completed_at is null;
  end if;
  return 'counted';
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. RESULTS: views, starts, completions, completion rate, drop-off by question, the answers
-- per question, the endings reached, the score and the hidden fields. The owner's door.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create function custom.form_results(p_organization_id uuid, p_form_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_f       custom.anon_form;
  v_views   bigint;
  v_starts  bigint;
  v_done    bigint;
  v_qs      jsonb;
  v_ends    jsonb;
  v_hidden  jsonb;
  v_score   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_results');
  perform custom.assert_store_door(p_organization_id, 'custom.form_results');
  select * into v_f from custom.anon_form where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'There is no such form in this organization.' using errcode = '23503',
          detail = jsonb_build_object('form_id', p_form_id)::text;
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_f.table_id, 'custom.form_results',
                                        'viewer'::public.permission_level, 'table');

  select count(*), count(started_at) into v_views, v_starts
    from custom.anon_form_visit v where v.organization_id = p_organization_id and v.form_id = v_f.id and v.deleted_at is null;
  select count(*) into v_done from custom.anon_submission s
   where s.organization_id = p_organization_id and s.form_id = v_f.id and s.state <> 'rejected' and s.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'field_key', q.key,
           'reached', (select count(*) from custom.anon_form_visit v
                        where v.organization_id = p_organization_id and v.form_id = v_f.id and v.reached ? q.key),
           'left', (select count(*) from custom.anon_form_visit v
                     where v.organization_id = p_organization_id and v.form_id = v_f.id
                       and v.completed_at is null and v.last_field_key = q.key),
           'answered', (select count(*) from custom.anon_submission s
                         where s.organization_id = p_organization_id and s.form_id = v_f.id and s.state <> 'rejected'
                           and s.deleted_at is null and coalesce(s.payload -> q.key, 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb)),
           'answers', (select coalesce(jsonb_agg(jsonb_build_object('value', a.value, 'count', a.n) order by a.n desc, a.value), '[]'::jsonb)
                         from (select x.value, count(*) n
                                 from custom.anon_submission s,
                                      lateral (select case when jsonb_typeof(s.payload -> q.key) = 'array'
                                                           then (select array_agg(e #>> '{}') from jsonb_array_elements(s.payload -> q.key) e)
                                                           else array[s.payload ->> q.key] end as vals) vv,
                                      lateral unnest(vv.vals) x(value)
                                where s.organization_id = p_organization_id and s.form_id = v_f.id and s.state <> 'rejected'
                                  and s.deleted_at is null and x.value is not null and x.value <> ''
                                group by x.value order by count(*) desc limit 12) a)
         ) order by q.ord), '[]'::jsonb)
    into v_qs
    from (select nullif(btrim(coalesce(e.value ->> 'field', e.value ->> 'key', '')), '') as key, e.ord
            from jsonb_array_elements(coalesce(v_f.presentation -> 'questions', '[]'::jsonb)) with ordinality e(value, ord)) q
   where q.key is not null;

  select coalesce(jsonb_agg(jsonb_build_object('ending', t.ending, 'count', t.n) order by t.n desc), '[]'::jsonb) into v_ends
    from (select s.metadata ->> 'ending' as ending, count(*) n from custom.anon_submission s
           where s.organization_id = p_organization_id and s.form_id = v_f.id and s.state <> 'rejected' and s.deleted_at is null
           group by 1) t;

  select coalesce(jsonb_agg(jsonb_build_object('key', t.k, 'value', t.v, 'count', t.n) order by t.k, t.n desc), '[]'::jsonb) into v_hidden
    from (select h.key k, h.value #>> '{}' v, count(*) n
            from custom.anon_submission s, jsonb_each(coalesce(s.metadata -> 'hidden', '{}'::jsonb)) h
           where s.organization_id = p_organization_id and s.form_id = v_f.id and s.state <> 'rejected' and s.deleted_at is null
           group by 1, 2) t;

  select case when count(*) = 0 then null else jsonb_build_object(
           'count', count(*), 'average', round(avg((s.metadata ->> 'score')::numeric), 2),
           'min', min((s.metadata ->> 'score')::numeric), 'max', max((s.metadata ->> 'score')::numeric)) end
    into v_score
    from custom.anon_submission s
   where s.organization_id = p_organization_id and s.form_id = v_f.id and s.state <> 'rejected' and s.deleted_at is null
     and jsonb_typeof(s.metadata -> 'score') = 'number';

  return jsonb_build_object(
    'form_id', v_f.id,
    'views', v_views,
    'starts', v_starts,
    'completions', v_done,
    'completion_rate', case when v_starts > 0 then round(100.0 * least(v_done, v_starts) / v_starts, 1) else null end,
    'questions', v_qs,
    'endings', v_ends,
    'hidden', v_hidden,
    'score', v_score);
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE FOUR DOOR ROWS. Two server-lane (the stranger's page holds the request), two signed-in.
-- ─────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'form_public_route', 'p_form_id uuid, p_values jsonb',
   array['uuid'::regtype, 'jsonb'::regtype]::oid[],
   'It takes NO organization id: the form id supplies the organization, so a caller cannot name a tenant. The published form id IS the capability, exactly as custom.form_public_asks. It reads custom.anon_form and hands the stored questions and endings to custom._form_route with the caller''s answers narrowed to the exposed keys and an EMPTY context, so no record of the subject table is ever read. Missing, unpublished, closed and store-off answer null.',
   'typeform_a_form_routes_scores_and_counts_itself.sql',
   'server_only: the public form page is server-rendered and its answers reach this door through the app''s own route handler. Schema custom stays revoked from anon; granted to the server lane alone, the same posture as custom.form_public_asks.',
   false, false),
  ('custom', 'form_visit', 'p_form_id uuid, p_visit text, p_event text, p_field text',
   array['uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'It takes NO organization id: the published form id supplies it. p_visit is a random per-visit key the page holds in memory; only its sha256 is stored. p_event is view, start or reach; p_field is counted only when the form exposes it. It writes only custom.anon_form_visit, and answers ignored for a missing, unpublished, closed or store-off form.',
   'typeform_a_form_routes_scores_and_counts_itself.sql',
   'server_only: reached through the app''s own route handler beside custom.form_public. Schema custom stays revoked from anon; granted to the server lane alone.',
   false, false),
  ('custom', 'form_preview_route', 'p_organization_id uuid, p_table_id uuid, p_questions jsonb, p_endings jsonb, p_values jsonb',
   array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'The owner''s preview of a draft form''s route, behind the organization wall and the caller''s own viewer rung on the Table (custom.assert_client_may_open) — the same gate as custom.form_preview_asks. It evaluates the given questions and endings through custom._form_route with an EMPTY context; no record is read.',
   'typeform_a_form_routes_scores_and_counts_itself.sql',
   'opened to signed-in callers by typeform_a_signed_in_person_may_preview_a_route_and_read_results.sql',
   false, false),
  ('custom', 'form_results', 'p_organization_id uuid, p_form_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'A form''s results for its owner: counts of visits, starts and submissions, drop-off by question, answer counts per question, endings, score and hidden fields. Behind the organization wall and the caller''s viewer rung on the form''s Table (custom.assert_client_may_open), the rung that already reads every record those submissions became.',
   'typeform_a_form_routes_scores_and_counts_itself.sql',
   'opened to signed-in callers by typeform_a_signed_in_person_may_preview_a_route_and_read_results.sql',
   false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE FOUR REPLACED BODIES (each marked TYPEFORM-DUP).
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom._form_questions_asked(p_organization_id uuid, p_questions jsonb, p_values jsonb)
 RETURNS TABLE(field_key text, asked boolean, decided boolean, said text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- TYPEFORM-DUP: THE ONE ROUTE. Which questions are asked is now the route's answer
  -- (custom._form_route): showIf as before, and logic jumps on top. Same rows, same shape, so the
  -- public asks door, the owner's preview and every embedder of this shape branch by jumps too.
  return query
    select a ->> 'field_key', (a ->> 'asked')::boolean, (a ->> 'decided')::boolean, a ->> 'said'
      from jsonb_array_elements(custom._form_route(p_organization_id, p_questions, '[]'::jsonb, p_values) -> 'asks') a;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.form_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_submission_cap integer DEFAULT NULL::integer, p_quarantine_rule_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid, p_form_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user     uuid := custom.query_principal();
  v_keys     text[];
  v_q        jsonb;
  v_key      text;
  v_exposed  text[] := array[]::text[];
  v_required text[] := array[]::text[];
  v_slug     text;
  v_id       uuid;
  v_hp       text;
  v_present  jsonb;
  -- The accept Rule this door makes when the caller brought none.
  v_accept   uuid := p_quarantine_rule_id;
  v_ids      uuid[] := array[]::uuid[];
  v_fid      uuid;
  v_expr     jsonb;
  v_args     jsonb := '[]'::jsonb;
  v_aname    text;
  v_redirect text;
  v_said     text;
  v_always   text[];
  v_own_rule uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.form_declare');

  -- A FORM DECIDES WHAT STRANGERS MAY WRITE INTO A TABLE, so declaring one is an admin
  -- act on that Table — the same rung custom.anon_publish already asks for. Asking less
  -- here and more at publish would let anyone assemble the loaded gun and only check who
  -- pulls the trigger.
  if v_user is null then
    raise exception 'Nobody is signed in, so no form can be made.'
      using errcode = '42501',
            hint = 'custom.form_declare is the owner''s side of a form. The public side — custom.form_public and custom.form_submit — is the one that has no principal.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.form_declare',
                                          'admin'::public.permission_level, 'table');

  -- The subject has to be a TABLE of this organization, and the fields it declares are
  -- the only things a question may ask for.
  select array_agg(f ->> 'name') into v_keys
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) f
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
  if v_keys is null then
    raise exception 'There is no such table in this organization to make a form for.' using errcode = '23503',
            hint = 'A form is a view on a real Table (SCR-13). Make the Table first — every question is one of its Fields and every answer is one of its records.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A form has to ask something.'
      using errcode = '22004',
            hint = 'questions is a list of {"field": "<the field''s key on this table>", "ask": "…", "help": "…", "required": true|false}. The field key is the address; ask and help are this form''s own words for it.';
  end if;

  for v_q in select value from jsonb_array_elements(p_questions) loop
    v_key := nullif(btrim(coalesce(v_q ->> 'field', v_q ->> 'key', '')), '');
    if v_key is null then
      raise exception 'One of this form''s questions does not say which field it asks for.'
        using errcode = '22004',
              hint = 'Every question names a Field of the subject table by key. The table''s fields are: ' || array_to_string(v_keys, ', ') || '.';
    end if;
    if not (v_key = any (v_keys)) then
      raise exception 'This table has no field called "%", so the form cannot ask for it.', v_key
        using errcode = '23503',
              hint = format('Its fields are: %s. Add the Field first, or ask for one that is there — a question with nowhere to land is an answer nobody can read.',
                            array_to_string(v_keys, ', '));
    end if;
    if not (v_key = any (v_exposed)) then
      v_exposed := v_exposed || v_key;
    end if;
    if coalesce((v_q ->> 'required')::boolean, false) and not (v_key = any (v_required)) then
      v_required := v_required || v_key;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────────────────
  -- THE ACCEPT RULE, WHEN NOBODY BROUGHT ONE.
  --
  -- Without it `custom.form_submit` holds every answer for a person and the
  -- form is a drawer. The Rule is REC-15's own shape, referencing Fields BY ID
  -- (REC-17) — a Rule naming a field by its KEY is refused, and it is right to.
  -- With nothing required the test is honestly a constant, and it says so in
  -- its own name rather than pretending to check something.
  -- ─────────────────────────────────────────────────────────────────────────
  -- TYPEFORM-DUP: A RULE THIS DOOR MADE ITSELF IS REMADE WITH THE FORM. A re-statement hands the
  -- accept Rule back; when it is the one this door wrote (its description starts DOOR-17), it is
  -- rewritten in place so it follows the questions, jumps and conditions as they are now.
  if p_quarantine_rule_id is not null then
    select r.id into v_own_rule from custom.record r
     where r.organization_id = p_organization_id and r.id = p_quarantine_rule_id
       and r.table_id = custom.rule_kernel_id() and r.deleted_at is null
       and r.data ->> 'description' like 'DOOR-17:%'
       and r.data ->> 'scope_table_id' = p_table_id::text;
    if v_own_rule is not null then v_accept := null; end if;
  end if;
  -- ONLY WHAT IS ALWAYS ASKED. A required question a condition hides or a jump skips is required
  -- WHEN ASKED — custom.form_submit checks that against the route. In this Rule it would hold
  -- back every answer that was rightly routed past it.
  v_always := custom._form_always_asked(p_questions);

  if v_accept is null then
    foreach v_key in array v_required loop
      continue when not (v_key = any (v_always));
      select r.id into v_fid
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.deleted_at is null
         and r.data ->> 'key' = v_key
         -- A FIELD NAMES ITS TABLE AS entity_definition_id (lane HANDOVER, 2026-09-29): read as
         -- data.table_id this found no Field, so every form's accept Rule took every answer.
         and coalesce(nullif(r.data ->> 'entity_definition_id', ''), nullif(r.data ->> 'table_id', ''))::uuid = p_table_id
       limit 1;
      if v_fid is not null then
        v_ids := v_ids || v_fid;
      end if;
    end loop;

    if array_length(v_ids, 1) is null then
      v_expr := jsonb_build_object('const', true);
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form') || ': take every answer';
    else
      foreach v_fid in array v_ids loop
        v_args := v_args || jsonb_build_array(
          jsonb_build_object('op', 'present',
                             'args', jsonb_build_array(jsonb_build_object('field', v_fid))));
      end loop;
      if jsonb_array_length(v_args) = 1 then
        v_expr := v_args -> 0;
      else
        v_expr := jsonb_build_object('op', 'and', 'args', v_args);
      end if;
      v_aname := coalesce(nullif(btrim(p_title), ''), 'This form')
                 || ': every answer it asks for is there';
    end if;

    v_accept := custom.rule_declare(p_organization_id, jsonb_build_object(
      'name', v_aname,
      'kind', 'predicate',
      -- V11-C (2026-09-22): `membership`, NOT `validate`. See this file's header.
      'uses', jsonb_build_array('membership'),
      'scope_table_id', p_table_id,
      'applies_to_types', '[]'::jsonb,
      'expr', v_expr,
      'description',
        'DOOR-17: an anonymous answer lands quarantined and becomes a record only when '
        || 'this Rule admits it. It is the form''s validation and its release in one '
        || 'object, so the two cannot disagree. Made by custom.form_declare because the '
        || 'caller brought none — without it every answer is held for a person forever. '
        || 'V11-C: its use is `membership` — it says which SUBMISSIONS this form admits, '
        || 'which is what custom.anon_clear asks it through custom.rule_run. A `validate` '
        || 'use would enlist it in the table''s write-time checks and make the form''s '
        || 'questions compulsory for every record anybody writes by any route.'
    ), v_own_rule);
  end if;

  -- The presentation carries the questions as the form WORDS them; the answerable key
  -- list is what the door enforces. One object, two readers, no third place to drift.
  v_present := coalesce(p_presentation, '{}'::jsonb) || jsonb_build_object('questions', p_questions);

  -- ─────────────────────────────────────────────────────────────────────────
  -- S7': WHAT THE STRANGER SEES AFTER SENDING, JUDGED HERE, ONCE.
  --
  -- `thank_you` is {title, body, redirect_url}. The message is the form's own words. The
  -- redirect is optional and it is an ADDRESS a stranger's browser is sent to, so it is held
  -- to one rule: a secure page on one of this organization's own sites — its website, and the
  -- list it keeps in `custom/form_redirect_domains`. Anything else is refused by name with the
  -- list it may use, never quietly dropped: the owner typed it and expects it to work.
  -- ─────────────────────────────────────────────────────────────────────────
  if jsonb_typeof(v_present -> 'thank_you') is not null
     and jsonb_typeof(v_present -> 'thank_you') not in ('object', 'null') then
    raise exception 'The thank-you screen has to be a title, a message and an optional address, not %.',
                    jsonb_typeof(v_present -> 'thank_you')
      using errcode = '22023',
            hint = 'presentation.thank_you is {"title": "…", "body": "…", "redirect_url": "https://…"}; every part may be left out.';
  end if;
  if jsonb_typeof(v_present -> 'thank_you') = 'object' then
    v_redirect := nullif(btrim(coalesce(v_present #>> '{thank_you,redirect_url}', '')), '');
    if v_redirect is null then
      v_present := v_present #- '{thank_you,redirect_url}';
    else
      v_said := custom.form_redirect_refusal(p_organization_id, v_redirect);
      if v_said is not null then
        raise exception '%', v_said
          using errcode = '22023',
                hint = 'Leave the address empty and the thank-you message is shown instead. An organization''s own sites are its website and the list in its forms settings (custom/form_redirect_domains).';
      end if;
      v_present := jsonb_set(v_present, '{thank_you,redirect_url}', to_jsonb(v_redirect));
    end if;
  end if;

  -- MAKE-HOME W5: THE FORM'S OWN LOOK, JUDGED HERE, ONCE (custom._form_look_judge).
  v_present := custom._form_look_judge(p_organization_id, v_present);
  -- TYPEFORM-DUP: logic jumps, endings, welcome, hidden fields, points and the theme's named options.
  v_present := custom._form_flow_judge(p_organization_id, v_present);

  if p_form_id is not null then
    select honeypot_key into v_hp from custom.anon_form
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null;
    if v_hp is null and not found then
      raise exception 'There is no such form in this organization.' using errcode = '23503',
            detail = jsonb_build_object('form_id', p_form_id)::text;
    end if;
  end if;
  -- ONE decoy per form, minted once and kept, so a bot cannot learn the name by watching
  -- two forms. `extensions.` is written out because search_path is pg_catalog here.
  v_hp := coalesce(v_hp, 'confirm_' || encode(extensions.gen_random_bytes(5), 'hex'));
  v_slug := coalesce(nullif(btrim(p_slug), ''), custom.form_slug(p_organization_id, p_title, p_form_id));

  if p_form_id is null then
    insert into custom.anon_form (organization_id, table_id, slug, title, exposed_field_keys,
                                  required_field_keys, presentation, submission_cap,
                                  quarantine_rule_id, notify_rule_id, honeypot_key)
    values (p_organization_id, p_table_id, v_slug, nullif(btrim(p_title), ''),
            to_jsonb(v_exposed), to_jsonb(v_required), v_present, p_submission_cap,
            v_accept, p_notify_rule_id, v_hp)
    returning id into v_id;
  else
    update custom.anon_form
       set table_id = p_table_id,
           slug = v_slug,
           title = nullif(btrim(p_title), ''),
           exposed_field_keys = to_jsonb(v_exposed),
           required_field_keys = to_jsonb(v_required),
           presentation = v_present,
           submission_cap = p_submission_cap,
           quarantine_rule_id = v_accept,
           notify_rule_id = p_notify_rule_id,
           honeypot_key = v_hp
     where organization_id = p_organization_id and id = p_form_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'There is no such form in this organization.' using errcode = '23503',
            detail = jsonb_build_object('form_id', p_form_id)::text;
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.form_submit(p_form_id uuid, p_origin text, p_payload jsonb, p_bucket text, p_honeypot text DEFAULT NULL::text, p_client_key text DEFAULT NULL::text)
 RETURNS TABLE(submission_id uuid, record_id uuid, state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f        custom.anon_form;
  v_count    bigint;
  v_exposed  text[];
  v_required text[];
  v_missing  text[];
  v_key      text;
  v_doc      jsonb := '{}'::jsonb;
  v_existing uuid;
  v_id       uuid;
  v_rec      uuid;
  v_file     uuid;
  v_sigs     jsonb := '{}'::jsonb;
  v_held     text;
  v_stood    boolean := false;
  v_hidden   jsonb := '{}'::jsonb;
  v_visit    text;
  v_route    jsonb;
  v_hk       text;
begin
  perform custom._write_via_mark('form', true);  -- CHAIR-DOORS-4: the change event says it came through a form door (a booking confirming through here keeps its word)
  if p_form_id is null then
    raise exception 'This form is not available.' using errcode = '23503';
  end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then
    raise exception 'This form is not available.'
      using errcode = '23503',
            hint = 'The link names no form. It may have been mistyped, or the form may have been taken down.';
  end if;
  perform custom.assert_store_door(v_f.organization_id, 'custom.form_submit');

  -- TYPEFORM-DUP: TWO RESERVED KEYS RIDE BESIDE THE ANSWERS and are lifted out before anything
  -- judges the answers. `_hidden` is the form's hidden fields as the link carried them (utm_source,
  -- ref, …): narrowed to the names the form declares (presentation.hidden_fields), each a short
  -- string, kept on the submission and never a question. `_visit` is the page's per-visit key, so
  -- the visit that sent this is counted complete.
  if jsonb_typeof(p_payload -> '_hidden') = 'object' then
    for v_hk in select jsonb_array_elements_text(coalesce(v_f.presentation -> 'hidden_fields', '[]'::jsonb)) loop
      if jsonb_typeof(p_payload #> array['_hidden', v_hk]) in ('string', 'number', 'boolean')
         and btrim(p_payload #>> array['_hidden', v_hk]) <> '' then
        v_hidden := v_hidden || jsonb_build_object(v_hk, left(p_payload #>> array['_hidden', v_hk], 500));
      end if;
    end loop;
  end if;
  v_visit := nullif(btrim(coalesce(p_payload ->> '_visit', '')), '');
  p_payload := coalesce(p_payload, '{}'::jsonb) - '_hidden' - '_visit';

  -- CLOSED BY DEFAULT, the same three words custom.anon_write says.
  if v_f.published_at is null then
    raise exception 'This form is not accepting responses.'
      using errcode = '42501',
            hint = 'It exists but has never been published. Whoever owns it publishes it; until then nothing can be submitted, which is the point of the default.';
  end if;
  if v_f.closed_at is not null then
    submission_id := null; record_id := null; state := 'closed';
    message := 'This form is closed, so it is not taking any more answers.';
    return next; return;
  end if;

  -- THE DECOY, ANSWERED FIRST AND ANSWERED CHEERFULLY. See this file's header, decision 5.
  if v_f.honeypot_key is not null and coalesce(btrim(p_honeypot), '') <> '' then
    insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                        raw_payload, client_key, state, remote_origin,
                                        rejection_reason)
    values (v_f.organization_id, v_f.id, v_f.table_id, 'form', '{}'::jsonb,
            jsonb_build_object('form_id', v_f.id, 'at', now(), 'origin', p_origin,
                               'honeypot', true),
            p_client_key, 'rejected', p_origin,
            format('The decoy field "%s" was filled in, which a person answering this form never does. Nothing was written and the sender was shown the thank-you screen.',
                   v_f.honeypot_key))
    returning id into v_id;
    submission_id := v_id; record_id := null; state := 'accepted';
    message := null; return next; return;
  end if;

  -- IDEMPOTENCY BEFORE RATE, so a replay costs no budget and makes no second row.
  if p_client_key is not null then
    select s.id, s.record_id into v_existing, v_rec from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.form_id = v_f.id
       and s.client_key = p_client_key;
    if v_existing is not null then
      submission_id := v_existing; record_id := v_rec; state := 'accepted';
      message := 'This answer had already arrived, so it was not written twice.';
      return next; return;
    end if;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';
  if v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    submission_id := null; record_id := null; state := 'full';
    message := 'This form has all the answers it was set up to take.';
    return next; return;
  end if;

  -- THE RATE LIMIT, on the bucket the SERVER chose (a coarse client identifier). A
  -- browser choosing its own bucket would be counting itself.
  begin
    perform custom.anon_rate_take(v_f.organization_id, v_f.id,
                                  coalesce(nullif(btrim(p_bucket), ''), 'anonymous'), null);
  exception when sqlstate '53400' then
    submission_id := null; record_id := null; state := 'too_many';
    message := 'That is more answers than this form takes in one go. Try again in a little while.';
    return next; return;
  end;

  -- SCOPE. A key the form does not ask for is refused BY NAME, never trimmed in silence.
  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_exposed
    from jsonb_array_elements(v_f.exposed_field_keys);
  for v_key in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
    if not (v_key = any (v_exposed)) then
      raise exception 'This form does not have a field called "%".', v_key
        using errcode = '42501',
              hint = format('It accepts: %s.', coalesce(array_to_string(v_exposed, ', '), '(nothing)'));
    end if;
    v_doc := v_doc || jsonb_build_object(v_key, p_payload -> v_key);
  end loop;

  select coalesce(array_agg(value #>> '{}'), array[]::text[]) into v_required
    from jsonb_array_elements(v_f.required_field_keys);
  -- TYPEFORM-DUP: REQUIRED MEANS REQUIRED WHEN ASKED. The route (custom._form_route — showIf and
  -- logic jumps) says which questions this person was asked; a required question their answers
  -- jumped past, or hid, is not missing. The route also names the ending and the score.
  v_route := custom._form_route(v_f.organization_id,
                                coalesce(v_f.presentation -> 'questions', '[]'::jsonb),
                                coalesce(v_f.presentation -> 'endings', '[]'::jsonb),
                                p_payload);
  select coalesce(array_agg(k), array[]::text[]) into v_missing
    from unnest(v_required) k
   where coalesce(p_payload -> k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb)
     and not exists (select 1 from jsonb_array_elements(v_route -> 'asks') a
                      where a ->> 'field_key' = k and (a ->> 'asked')::boolean = false);
  if array_length(v_missing, 1) > 0 then
    raise exception 'This form needs %.', array_to_string(v_missing, ', ')
      using errcode = '22004',
            hint = 'Each missing field is named so the screen can point at it, rather than showing one error beside a form with twenty questions.';
  end if;

  -- A DRAWN SIGNATURE IS A FILE (lane VIEWS-AND-FIELDS; CHAIR-DOORS-1, 2026-10-02), exactly as
  -- custom.sign_request_sign keeps one: a File record (REC-27) holding the drawing, in the form's
  -- organization, and the Value's envelope naming it as `signature_file_id`. The Value itself is the
  -- word "Signed" — a drawn form signature carries no typed name, and the drawing is not copied into
  -- the record. Only an answer to a Signature column (custom.doc_signature_field_ok) that is a drawing
  -- (the same data: URL shape sign_request_sign accepts) is turned into a File; every other answer
  -- passes unchanged. The File is written on behalf of the form's publisher when nobody is signed in
  -- (a stranger on the public form), the same stand-in custom.anon_clear takes, put back on every path.
  for v_key in select k from jsonb_object_keys(v_doc) k loop
    continue when jsonb_typeof(v_doc -> v_key) <> 'string'
               or (v_doc ->> v_key) !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]{64,}$';
    continue when not exists (
      select 1 from custom.record fd
       where fd.organization_id = v_f.organization_id
         and fd.table_id = custom.field_kernel_id()
         and fd.deleted_at is null
         and (fd.data ->> 'entity_definition_id')::uuid = v_f.table_id
         and fd.data ->> 'key' = v_key
         and custom.doc_signature_field_ok(fd.data));
    if not v_stood and custom.query_principal() is null and v_f.published_by is not null then
      v_held := current_setting('request.jwt.claims', true);
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_f.published_by, 'role', 'authenticated')::text, true);
      v_stood := true;
    end if;
    begin
      insert into custom.record (organization_id, table_id, data_class, data)
      values (v_f.organization_id, custom.file_kernel_id(), 'record', jsonb_build_object(
        'name',      format('Signature on %s', coalesce(nullif(btrim(v_f.title), ''), 'a form')),
        'mime_type', split_part(split_part(v_doc ->> v_key, ';', 1), ':', 2),
        'content',   v_doc ->> v_key,
        'byte_size', length(v_doc ->> v_key),
        'kind',      'signature'))
      returning id into v_file;
    exception when others then
      if v_stood then
        perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
      end if;
      raise;
    end;
    v_sigs := v_sigs || jsonb_build_object(v_key, jsonb_build_object('src', jsonb_build_object(
      'kind', 'signature', 'mark', 'drawn', 'signature_file_id', v_file,
      'signed_at', now(), 'via', 'form', 'form_id', v_f.id)));
    v_doc := v_doc || jsonb_build_object(v_key, 'Signed');
  end loop;
  if v_stood then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  end if;
  if v_sigs <> '{}'::jsonb then
    v_doc := v_doc || jsonb_build_object('_values', v_sigs);
  end if;

  -- QUARANTINE. `custom.record` is not touched here, and the provenance travels with the
  -- submission so the record made from it can always say where it came from.
  insert into custom.anon_submission (organization_id, form_id, table_id, source, payload,
                                      raw_payload, client_key, state, remote_origin, metadata)
  values (v_f.organization_id, v_f.id, v_f.table_id, 'form', v_doc,
          jsonb_build_object('form_id', v_f.id, 'form_slug', v_f.slug,
                             'form_version', v_f.version, 'at', now(),
                             'origin', p_origin, 'via', 'form'),
          p_client_key, 'quarantined', p_origin,
          -- TYPEFORM-DUP: the hidden fields, the ending reached and the score, on the submission.
          jsonb_strip_nulls(jsonb_build_object(
            'hidden', case when v_hidden = '{}'::jsonb then null else v_hidden end,
            'ending', v_route ->> 'ending',
            'score', v_route -> 'score')))
  returning id into v_id;

  -- TYPEFORM-DUP: the visit that sent this is complete (custom.form_results counts it).
  if v_visit is not null then
    update custom.anon_form_visit
       set completed_at = now(), submission_id = v_id, started_at = coalesce(started_at, now()), updated_at = now()
     where form_id = v_f.id and organization_id = v_f.organization_id
       and visit_hash = encode(extensions.digest(v_visit, 'sha256'), 'hex')
       and completed_at is null;
  end if;

  if p_client_key is not null then
    insert into custom.anon_replay (organization_id, client_key, table_id, submission_id, captured_at)
    values (v_f.organization_id, p_client_key, v_f.table_id, v_id, now())
    on conflict (organization_id, client_key) where deleted_at is null do nothing;
  end if;

  -- S7': THE STRANGER'S SAVED PLACE IS USED UP BY THE ANSWER IT BECAME. When the page saved
  -- progress for this person it sends that saved place's key as the client key, so the one
  -- send that turns the answers into a submission also marks the saved place sent, in this
  -- same transaction. Its answers are emptied — they live in the submission now, and a second
  -- copy of somebody's intake answers kept for a month would be a copy nobody asked for.
  if p_client_key is not null then
    update custom.anon_form_draft d
       set submitted_at = now(), submission_id = v_id, answers = '{}'::jsonb
     where d.organization_id = v_f.organization_id
       and d.form_id = v_f.id
       and d.secret_hash = encode(extensions.digest(p_client_key, 'sha256'), 'hex')
       and d.submitted_at is null
       and d.deleted_at is null;
  end if;

  -- THE ACCEPT RULE. With one, the answer becomes a record now; with none, it waits for a
  -- person and this function SAYS SO instead of implying it landed.
  if v_f.quarantine_rule_id is not null then
    v_rec := custom.anon_clear(v_f.organization_id, v_id);
  end if;

  if v_rec is not null then
    perform custom.form_notify(v_f.organization_id, v_f.id, v_rec, v_id);
    submission_id := v_id; record_id := v_rec; state := 'accepted'; message := null;
  elsif v_f.quarantine_rule_id is null then
    submission_id := v_id; record_id := null; state := 'held';
    message := 'Your answer arrived and is waiting for someone to look at it.';
  else
    select s.rejection_reason into message from custom.anon_submission s
     where s.organization_id = v_f.organization_id and s.id = v_id;
    submission_id := v_id; record_id := null; state := 'held';
    message := coalesce(message, 'Your answer arrived and is waiting for someone to look at it.');
  end if;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.form_public(p_form_id uuid)
 RETURNS TABLE(form_id uuid, organization_id uuid, table_id uuid, title text, presentation jsonb, fields jsonb, honeypot_key text, state text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.anon_form;
  v_count  bigint;
  v_state  text;
  v_msg    text;
  v_fields jsonb;
begin
  if p_form_id is null then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return; end if;
  -- A form that was never published is still silence: nobody was handed this address.
  if v_f.published_at is null then return; end if;

  -- ── STORE-OFF: PUBLISHED, AND THE SWITCH IS DOWN. ───────────────────────────────────────
  -- The holder of this link was given it by this organization. Answering nothing told them
  -- our product had lost their page. Their questions are NOT returned with it: `presentation`
  -- and `fields` are emptied, so the link says only that it is switched off and by whom.
  if not custom.store_is_open(v_f.organization_id) then
    form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
    title := coalesce(v_f.title, 'Form'); presentation := '{}'::jsonb;
    fields := '[]'::jsonb; honeypot_key := null;
    state := 'unavailable'; message := custom.store_off_sentence(v_f.organization_id);
    return next;
    return;
  end if;

  select count(*) into v_count from custom.anon_submission s
   where s.organization_id = v_f.organization_id and s.form_id = v_f.id and s.state <> 'rejected';

  if v_f.closed_at is not null then
    v_state := 'closed';
    v_msg := 'This form is closed, so it is not taking any more answers.';
  elsif v_f.submission_cap is not null and v_count >= v_f.submission_cap then
    v_state := 'full';
    v_msg := 'This form has all the answers it was set up to take.';
  else
    v_state := 'open';
    v_msg := null;
  end if;

  -- EXACTLY the exposed Fields, as the store holds them, each carrying its own id —
  -- the same `{id, ...data}` shape every other reader of a Field builds.
  -- A CHOICE QUESTION CARRIES ITS CHOICES (lane HANDOVER, 2026-09-28). A stranger could not
  -- pick a Visit type: the choices live in the organization's own choice list, which a page
  -- answered without an account may not read, so the question fell back to a free-text box.
  -- The organization published this page to ask this question, so the labels of the choices it
  -- asks for travel with the question — the labels only, never the list's own rows.
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id) || f.data
           || custom._public_choices_of(v_f.organization_id, f.data) order by ord), '[]'::jsonb)
    into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id
     and f.data ->> 'key' = k.key;

  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Form'); presentation := v_f.presentation;
  -- MAKE-HOME W5: THE LOOK A STRANGER SEES, RESOLVED HERE — the organization's look (its portal
  -- look, then its own name and logo) under the form's own colour, logo and cover. Addresses
  -- only, never the file ids: `look` is the answer of custom._portal_style, the one look primitive.
  presentation := coalesce(presentation, '{}'::jsonb)
                  || jsonb_build_object('look', custom._form_look(v_f.organization_id, v_f.presentation));
  -- S7': A REDIRECT IS ONLY HANDED OUT WHILE IT IS STILL ONE OF THE ORGANIZATION'S OWN SITES.
  -- custom.form_declare refuses a foreign address when the form is saved; this is the other
  -- half, for a site the organization has since taken off its list. The stranger is then shown
  -- the thank-you message instead of being sent somewhere the organization no longer vouches for.
  if nullif(btrim(coalesce(presentation #>> '{thank_you,redirect_url}', '')), '') is not null
     and custom.form_redirect_refusal(v_f.organization_id, presentation #>> '{thank_you,redirect_url}') is not null then
    presentation := presentation #- '{thank_you,redirect_url}';
  end if;
  -- TYPEFORM-DUP: PICTURES BECOME ADDRESSES HERE, as the look's do — the welcome screen's, each
  -- ending's and the background's. An ending's redirect follows the thank-you's rule above.
  if jsonb_typeof(presentation -> 'welcome') = 'object' and presentation #>> '{welcome,picture_file_id}' is not null then
    presentation := jsonb_set(presentation, '{welcome}', (presentation -> 'welcome') - 'picture_file_id'
      || jsonb_strip_nulls(jsonb_build_object('picture_url',
           custom._portal_picture_url(v_f.organization_id, (presentation #>> '{welcome,picture_file_id}')::uuid, true))));
  end if;
  if jsonb_typeof(presentation -> 'endings') = 'array' then
    presentation := jsonb_set(presentation, '{endings}', (
      select coalesce(jsonb_agg(
               (e - 'picture_file_id' - 'redirect_url')
               || jsonb_strip_nulls(jsonb_build_object(
                    'picture_url', case when e ->> 'picture_file_id' is not null
                                        then custom._portal_picture_url(v_f.organization_id, (e ->> 'picture_file_id')::uuid, true) end,
                    'redirect_url', case when nullif(btrim(coalesce(e ->> 'redirect_url', '')), '') is not null
                                          and custom.form_redirect_refusal(v_f.organization_id, e ->> 'redirect_url') is null
                                         then e ->> 'redirect_url' end))
               order by o), '[]'::jsonb)
        from jsonb_array_elements(presentation -> 'endings') with ordinality x(e, o)));
  end if;
  if jsonb_typeof(presentation -> 'theme') = 'object' and presentation #>> '{theme,background_file_id}' is not null then
    presentation := jsonb_set(presentation, '{theme}', (presentation -> 'theme') - 'background_file_id'
      || jsonb_strip_nulls(jsonb_build_object('background_url',
           custom._portal_picture_url(v_f.organization_id, (presentation #>> '{theme,background_file_id}')::uuid, true))));
  end if;
  fields := v_fields; honeypot_key := v_f.honeypot_key; state := v_state; message := v_msg;
  return next;
end;
$function$;

-- chair-step: this CREATES three small functions in schema platform — platform.refuse_not_found(text, text, text), platform.refusal_message(text, text) and platform.refusal_code(text, text) — and GRANTs EXECUTE on them to anon, authenticated and service_role, because every door that says "not found" calls them as its caller. A GRANT is refused by the additive allow-list by name, so it comes through this route. They read nothing and write nothing: refuse_not_found only raises, the other two only read the error text they are handed. No table, column, policy, trigger or existing function is touched. Inverse: migrations/inverse/errorshonest_s1_one_way_to_say_not_found_down.sql drops the three (after the six files that call them are undone).
-- lane: ERRORS-HONEST
--
-- LANE ERRORS-HONEST — ONE WAY TO SAY "NOT FOUND", AND IT IS HONEST IN EVERY TRANSPORT.
--
-- THE USE CASE. Alex Hart (test@test.com) opens a link a teammate sent her to a table, a topic, a
-- mandate or a folder she was never given, or that was archived since. The door is right to refuse
-- and says so with SQLSTATE P0002 (no_data_found). PostgREST answers P0002 with HTTP 500 — a server
-- FAULT — so her page shows "something went wrong on our side" instead of the not-found / no-access
-- screen, and every monitor counts a person's ordinary miss as an outage. Census on production
-- 2026-09-24: 204 functions, 241 raise sites.
--
-- WHY NOT JUST `RAISE SQLSTATE 'PGRST'` INLINE (the shape activeorgpages_… used on five doors).
-- That is PostgREST's documented way to choose the HTTP status, and it is what this function does
-- inside a PostgREST request. But the same doors are called DIRECTLY too: the server (matrx-orm
-- maps P0002 to RecordNotAvailableError; the topical-map tool maps it to not_found), every campaign
-- suite that asserts P0002, and other functions that catch it. Raised as PGRST there, all of them
-- would see a JSON blob under an unknown code. So:
--
--   platform.refuse_not_found(message, hint, detail)
--     inside a PostgREST request (PostgREST sets `request.method` for the request's transaction):
--       SQLSTATE PGRST, message = {"code":"P0002","message":…,"details":…,"hint":…},
--       detail = {"status":404,"headers":{}}  →  HTTP 404, error.code still "P0002", same words.
--     anywhere else: exactly the P0002 it replaces — same code, message, hint and detail.
--
--   platform.refusal_message(sqlstate, sqlerrm) / platform.refusal_code(sqlstate, sqlerrm)
--     for a function that CATCHES an error and reports its sentence or code: a not-found caught
--     inside a PostgREST request arrives in PostgREST's shape; these read the sentence and code out
--     of it, and hand anything else back untouched.
--
-- The guard `pnpm check:not-found-is-honest` fails on any function in the database that raises
-- P0002 itself, or raises SQLSTATE 'PGRST' outside refuse_not_found.

create or replace function platform.refuse_not_found(p_message text, p_hint text default null, p_detail text default null)
 returns void
 language plpgsql
 set search_path = ''
as $function$
begin
  if coalesce(current_setting('request.method', true), '') <> '' then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'P0002', 'message', p_message, 'details', p_detail, 'hint', p_hint)::text,
      detail = json_build_object('status', 404, 'headers', json_build_object())::text;
  end if;
  if p_hint is not null and p_detail is not null then
    raise exception using errcode = 'P0002', message = p_message, hint = p_hint, detail = p_detail;
  elsif p_hint is not null then
    raise exception using errcode = 'P0002', message = p_message, hint = p_hint;
  elsif p_detail is not null then
    raise exception using errcode = 'P0002', message = p_message, detail = p_detail;
  end if;
  raise exception using errcode = 'P0002', message = p_message;
end;
$function$;

comment on function platform.refuse_not_found(text, text, text) is
  'ERRORS-HONEST: the ONE way a function says "not found / not yours". Through PostgREST: HTTP 404 with error code P0002 and the same message, hint and detail. Called directly: SQLSTATE P0002, unchanged. Never raise P0002 yourself — pnpm check:not-found-is-honest fails on it.';

create or replace function platform.refusal_message(p_sqlstate text, p_message text)
 returns text
 language sql
 immutable
 set search_path = ''
as $function$
  select case
           when p_sqlstate = 'PGRST' and left(ltrim(coalesce(p_message, '')), 1) = '{'
             then coalesce((p_message::jsonb) ->> 'message', p_message)
           else p_message
         end;
$function$;

comment on function platform.refusal_message(text, text) is
  'ERRORS-HONEST: the sentence of a caught error (sqlstate, sqlerrm), whether it was raised plainly or in PostgREST''s own shape by platform.refuse_not_found.';

create or replace function platform.refusal_code(p_sqlstate text, p_message text)
 returns text
 language sql
 immutable
 set search_path = ''
as $function$
  select case
           when p_sqlstate = 'PGRST' and left(ltrim(coalesce(p_message, '')), 1) = '{'
             then coalesce((p_message::jsonb) ->> 'code', p_sqlstate)
           else p_sqlstate
         end;
$function$;

comment on function platform.refusal_code(text, text) is
  'ERRORS-HONEST: the SQLSTATE of a caught error (sqlstate, sqlerrm), reading the code out of PostgREST''s own shape when platform.refuse_not_found raised it that way.';

grant execute on function platform.refuse_not_found(text, text, text) to anon, authenticated, service_role;
grant execute on function platform.refusal_message(text, text) to anon, authenticated, service_role;
grant execute on function platform.refusal_code(text, text) to anon, authenticated, service_role;

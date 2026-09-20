-- inverse of writeperf_the_memo_reader_plans_once_too.sql
-- WHAT IT DOES NOT UNDO: nothing. It puts both memo readers back to LANGUAGE sql, which is to say
-- back to being re-planned on every one of the thirty-five calls a record write makes.
create or replace function platform.memo_seat()
returns text language sql stable set search_path to ''
as $$
  select md5(coalesce(current_setting('role', true), '') || '|' ||
             coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
             current_user);
$$;
create or replace function platform.memo_get(p_key text)
returns text language sql stable set search_path to ''
as $$ select platform.memo_all() ->> p_key; $$;

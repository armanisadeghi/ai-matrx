-- additive: yes
-- based-on: platform.memo_seat() 195104b7bb27acf8906bf21bbb16c8b40c86d2e4054cec582b139c85574e55d3
-- based-on: platform.memo_get(text) 531b90303baffb85769eb2812e4b6a1ba2fb7606570fea185fcaa25b3d360488
--
-- chair-step: it REPLACES the live bodies of the two memo readers this lane created an hour ago,
--   moving each from LANGUAGE sql to LANGUAGE plpgsql with the body character for character
--   unchanged. Nothing is created, dropped, granted or revoked and no data is touched.
--
-- WRITE-PERF — THE MEMO READER PLANS ONCE TOO. (A DEFECT OF MINE, NAMED BY SOMEBODY ELSE'S GUARD.)
--
-- `writeperf_the_same_question_is_asked_once.sql` landed at 21:03:45Z and `custom.ladder_replanners()`
-- — LADDER-PERF's census, which walks the one ladder's call graph and names any function it reaches
-- that is LANGUAGE sql and cannot be inlined — went from empty to naming TWO functions, and both of
-- them were mine:
--
--     platform.memo_get   LANGUAGE sql and not inlinable (SET)
--     platform.memo_seat  LANGUAGE sql and not inlinable (SET)
--
-- That is the exact class this lane had just spent a migration closing on seven other functions, and
-- I reintroduced it in the fix for it. `platform.memo_get` is called once for every memoised
-- question — thirty-five times per record written — so a memo whose READER is re-planned on every
-- call gives back a good part of what the memo saves.
--
-- Both move to plpgsql, bodies unchanged. `platform.memo_ceiling` and `platform.memo_clear` are
-- LANGUAGE sql too and are deliberately left alone: `memo_ceiling` is IMMUTABLE and returns a
-- constant, which LADDER-PERF's rule excuses because there is no query to plan, and `memo_clear` is
-- one `set_config` call with no query either. The census agrees — it names neither.

create or replace function platform.memo_seat()
returns text language plpgsql stable set search_path to ''
as $function$
begin
  return (
    select md5(coalesce(current_setting('role', true), '') || '|' ||
               coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
               current_user)
  );
end
$function$;
comment on function platform.memo_seat() is
  'MEMO-1. Who the memo was filled for. An answer that depends on the person must not survive the seat changing under a pooled connection. plpgsql, not sql: it is read on every memoised question and a non-inlinable SQL function is re-planned every time (LADDER-PERF''s class).';

create or replace function platform.memo_get(p_key text)
returns text language plpgsql stable set search_path to ''
as $function$
begin
  return (select platform.memo_all() ->> p_key);
end
$function$;
comment on function platform.memo_get(text) is
  'MEMO-1. An answer this transaction has already worked out for this seat, or NULL. NULL is always safe: it means ask again. plpgsql, not sql, for the same reason as platform.memo_seat.';

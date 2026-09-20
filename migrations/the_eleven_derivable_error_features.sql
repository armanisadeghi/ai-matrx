-- chair-step: an UPDATE, and the ONLY error rows whose feature is derivable.
--
-- Backfilling ops.system_error.source_feature is NOT on the table in general:
-- roughly 46,000 rows predate the column and their feature is unknowable. A
-- server row's `route` is an API path, not a product surface; a client row's
-- route would have to be read through matrx-frontend's route map, which lives in
-- TypeScript, and copying that map into SQL would create a second copy of the
-- same taste that immediately drifts. A null there is honest: it says nobody
-- recorded the feature, which is true.
--
-- Eleven rows are different. They were written by
-- platform._report_undeclared_confirmation_write — the DD-131 reporter — and
-- they identify themselves completely: source_app = 'database' AND
-- kind = 'provenance'. Nothing is inferred, nothing is guessed, and the function
-- that wrote them now stamps exactly this value
-- (db_maintenance_errors_name_their_feature.sql). Anything outside that pair is
-- left alone.
update ops.system_error e
   set source_feature = 'provenance'
 where e.source_feature is null
   and e.source_app = 'database'
   and e.kind = 'provenance';

do $$
declare
  v_left bigint;
begin
  select count(*) into v_left
    from ops.system_error
   where source_feature is null and source_app = 'database' and kind = 'provenance';
  if v_left > 0 then
    raise exception
      'the_eleven_derivable_error_features: % DD-131 provenance row(s) still carry no feature', v_left;
  end if;

  -- And nothing outside that exact pair was touched: every other app-labelled
  -- row that had no feature before this file still has none, because its feature
  -- is genuinely unknown and a guess would be worse than a null.
  select count(*) into v_left
    from ops.system_error
   where source_feature = 'provenance' and (source_app is distinct from 'database' or kind <> 'provenance');
  if v_left > 0 then
    raise exception
      'the_eleven_derivable_error_features: % row(s) outside the DD-131 pair were stamped provenance', v_left;
  end if;
end $$;

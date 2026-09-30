-- chair-step: the inverse of migrations/campaign/drilladopt_the_auto_grain_lines_are_settings.sql (lane DRILL-ADOPT) — removes the three drill.auto_grain settings it seeded, only while nobody has reviewed them (set_by is still 'agent') and no organization or person override hangs off them; a kept one is said. The explorer then says the settings cannot be read and uses the design system's own lines.


do $$
declare
  k record;
  v_n int;
begin
  for k in select * from (values ('drill.auto_grain', 'hour_max_days'), ('drill.auto_grain', 'day_max_days'), ('drill.auto_grain', 'week_max_days')) v(feature, key) loop
    select count(*) into v_n from platform.knob_override o where o.feature = k.feature and o.key = k.key;
    if v_n > 0 then
      raise notice 'drilladopt inverse: kept the setting %.% — % organization or person override(s) hang off it.', k.feature, k.key, v_n;
    elsif exists (select 1 from platform.feature_knob f where f.feature = k.feature and f.key = k.key and f.set_by <> 'agent') then
      raise notice 'drilladopt inverse: kept the setting %.% — a person has reviewed it.', k.feature, k.key;
    else
      delete from platform.feature_knob f where f.feature = k.feature and f.key = k.key and f.set_by = 'agent';
    end if;
  end loop;
end $$;

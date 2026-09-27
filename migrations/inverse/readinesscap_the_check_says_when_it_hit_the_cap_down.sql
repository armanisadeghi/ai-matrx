-- chair-step: INVERSE of migrations/campaign/readinesscap_the_check_says_when_it_hit_the_cap.sql (lane READINESS-CAP). Puts back platform.cutover_difference_sentence as MOVER-DELETIONS left it (the 'checks' met sentence says only how many were judged, with a bare ", the newest first" note when capped, and never names the total).
-- based-on: platform.cutover_difference_sentence(text, jsonb) — restores the READINESS-CAP predecessor body
-- lane: READINESS-CAP

CREATE OR REPLACE FUNCTION platform.cutover_difference_sentence(p_kind text, p_part jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- MOVER-CARRY-TAILS: the one sentence a Data tables switch check says about one kind of difference
-- (colours, checks, formats, shares) — what differs, and for each difference whether copying again
-- clears it or what to do instead. Read by platform._cutover_seam_readiness.
declare
  v_n      integer := coalesce((p_part ->> 'count')::int, 0);
  v_clears integer := least(coalesce((p_part ->> 'clears')::int, 0), coalesce((p_part ->> 'count')::int, 0));
  v_ex     text := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p_part -> 'examples', '[]'::jsonb)) x);
  v_left   text := (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(p_part -> 'leaves', '[]'::jsonb)) x);
  v_head   text;
  v_all    text;
  v_rest   text;
begin
  if v_n = 0 then
    return case p_kind
      when 'colours' then 'Every row, column and cell colour, colour-by and colour rule matches its older table.'
      when 'checks' then format('The older tables'' writes of the last 30 days and every row edited since its copy (%s judged%s) would all be taken by the copies.',
                                coalesce(p_part ->> 'judged', '0'),
                                case when coalesce((p_part ->> 'capped')::boolean, false) then ', the newest first' else '' end)
      when 'formats' then 'Every column keeps its format (currency, percent, email, choice, date and the rest).'
      else 'Everyone who holds an older table holds its copy at the same level, and nobody else does.' end;
  end if;

  v_head := case p_kind
    when 'colours' then format('%s %s, in %s %s', v_n, case when v_n = 1 then 'colour differs' else 'colours differ' end,
                               coalesce(p_part ->> 'tables', '1'), case when coalesce(p_part ->> 'tables', '1') = '1' then 'table' else 'tables' end)
    when 'checks' then format('%s %s the older tables took would be refused by the copies', v_n, case when v_n = 1 then 'kind of write' else 'kinds of write' end)
    when 'formats' then format('%s %s', v_n, case when v_n = 1 then 'column differs' else 'columns differ' end)
    else format('%s %s', v_n, case when v_n = 1 then 'share differs' else 'shares differ' end) end;

  v_all := case p_kind
    when 'colours' then 'Copying again brings the older table''s colours.'
    when 'checks' then 'Copying again brings the older tables'' newer choices and takes off a check the older table never enforced.'
    when 'formats' then 'Copying again brings the older table''s format.'
    else 'Copying again makes the copy''s shares match the older table''s: it carries a share the copy is missing and takes back one the older table no longer gives.' end;

  if v_clears >= v_n then
    v_rest := v_all;
  elsif v_clears = 0 and v_left is not null then
    -- Nothing here clears: each difference is named once, with what to do instead.
    return v_head || '. ' || case when v_n = 1 then 'Copying again does not change it: ' else 'Copying again does not change these: ' end
           || v_left || '.';
  elsif v_clears = 0 then
    v_rest := 'Copying again does not change these.';
  else
    v_rest := format('Copying again clears %s of them; for the other %s: %s.', v_clears, v_n - v_clears, coalesce(v_left, 'see each one above'));
  end if;
  return v_head || coalesce(': ' || v_ex, '') || '. ' || v_rest;
end;
$function$;

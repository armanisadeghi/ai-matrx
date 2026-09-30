-- based-on: platform._t13_transitional_dual_write() 754d614b511876bcab20087eeb54b48d065555c575ba319612bd629144260e06
-- t13_dual_write_never_reads_a_missing_shown_to.sql  (lane B-BILLING, 2026-09-29)
--
-- LIVE BREAKAGE: every INSERT into a T-13 table WITHOUT a shown_to column failed with
-- `record "new" has no field "shown_to"` (reported in the access-ladder register by the OpenSEO
-- lane, 2026-09-29; reproduced here on billing.spend_approval -- approving a spend amount errored).
-- Cause: the INSERT branch wrote `if v_has_shown and ... and new.shown_to is null`; PL/pgSQL resolves
-- NEW.shown_to for the whole expression before AND can short-circuit. The UPDATE branch already
-- nested it. Fix: the same nesting on INSERT. No behaviour changes on tables that carry shown_to
-- (identical logic); tables without it stop raising. The proof block below fails the migration if
-- the error survives, on the table that surfaced it.

CREATE OR REPLACE FUNCTION platform._t13_transitional_dual_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
-- T-13 phase 3.2 + 3.2b (TRANSITIONAL, expires 2026-12-15). TG_ARGV[0] = 'shown_to' when the table carries it.
-- published_to_web_by = the operating person, the platform actor stamp (platform._stamp_actor): app.user_id, else auth.uid().
declare
  v_has_shown   boolean := tg_nargs > 0 and tg_argv[0] = 'shown_to';
  v_vis_changed boolean;
  v_ptw_changed boolean;
  v_vis_given   boolean;
  v_ptw_given   boolean;
  v_counted     boolean := false;
  v_key         text := 't13w.r' || tg_relid::text;
  v_mark_vis    text := 't13d.v' || tg_relid::text;
  v_mark_ptw    text := 't13d.p' || tg_relid::text;
  v_vis_default boolean := coalesce(current_setting(v_mark_vis, true), '') = '1';
  v_ptw_default boolean := coalesce(current_setting(v_mark_ptw, true), '') = '1';
  v_person      uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()));
begin
  -- The markers belong to this row only: cleared on every row, INSERT or UPDATE.
  if v_vis_default then perform set_config(v_mark_vis, '', true); end if;
  if v_ptw_default then perform set_config(v_mark_ptw, '', true); end if;
  if tg_op = 'INSERT' then
    v_vis_given := not v_vis_default and new.visibility is not null;
    v_ptw_given := not v_ptw_default and new.published_to_web is not null;
    if v_vis_given and v_ptw_given then
      if (new.visibility = 'public') is distinct from new.published_to_web then
        raise exception 't13_row_column_disagrees: % insert says published_to_web % and row column % at once',
            tg_table_schema || '.' || tg_table_name, new.published_to_web, new.visibility
          using errcode = 'check_violation',
                hint = 'Write published_to_web alone; "only me" is shown_to (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      new.published_to_web_at := coalesce(new.published_to_web_at, now());
      new.published_to_web_by := coalesce(new.published_to_web_by, v_person);
      v_counted := true;
    elsif v_vis_given then
      new.published_to_web := (new.visibility = 'public');
      new.published_to_web_at := null;
      new.published_to_web_by := null;
      v_counted := true;
    elsif v_ptw_given then
      if new.published_to_web then
        new.visibility := 'public';
      elsif new.visibility is null or new.visibility = 'public' then
        new.visibility := 'internal';
      end if;  -- else the table's default stands ('personal' keeps its lock until the switch)
      new.published_to_web_at := coalesce(new.published_to_web_at, now());
      new.published_to_web_by := coalesce(new.published_to_web_by, v_person);
    else
      if new.visibility is null then
        new.visibility := 'internal';
      end if;
      new.published_to_web := (new.visibility = 'public');
      new.published_to_web_at := null;
      new.published_to_web_by := null;
    end if;
    -- Nested on purpose: PL/pgSQL resolves every NEW field an expression names before it
    -- evaluates any of it, so `v_has_shown and ... new.shown_to` raised 42703 on every INSERT into
    -- a table with no shown_to column (billing.spend_approval, extend.wbx_guidance,
    -- users.user_analysis_preferences, web.voice_fingerprint, platform.dated_change). The UPDATE
    -- branch below already nests it.
    if v_has_shown and new.visibility = 'personal' then
      if new.shown_to is null then
        new.shown_to := 'only_me';
      end if;
    end if;
  else
    v_vis_changed := new.visibility is distinct from old.visibility;
    v_ptw_changed := new.published_to_web is distinct from old.published_to_web;
    if v_vis_changed and v_ptw_changed then
      if (new.visibility = 'public') is distinct from new.published_to_web then
        raise exception 't13_row_column_disagrees: % row % changes both web states and they disagree (% / published_to_web %)',
            tg_table_schema || '.' || tg_table_name, new.id, new.visibility, new.published_to_web
          using errcode = 'check_violation',
                hint = 'Write published_to_web alone; the retiring row column is derived from it (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      new.published_to_web_at := now();
      new.published_to_web_by := v_person;
      v_counted := true;
    elsif v_vis_changed then
      if new.visibility = 'public' and not new.published_to_web and old.published_to_web_at is not null then
        raise exception 't13_stale_row_column_write: % row % was taken off the web through published_to_web; a write through the retiring row column cannot put it back',
            tg_table_schema || '.' || tg_table_name, new.id
          using errcode = 'check_violation',
                hint = 'This is a stale full-row write. Re-read the row and set published_to_web = true to publish it (common-docs/projects/access-ladder/t13/PLAN.md §3.2).';
      end if;
      if new.published_to_web is distinct from (new.visibility = 'public') then
        new.published_to_web := (new.visibility = 'public');
        new.published_to_web_at := null;
        new.published_to_web_by := null;
      end if;
      v_counted := true;
    elsif v_ptw_changed then
      if new.published_to_web then
        new.visibility := 'public';
      elsif old.visibility = 'public' then
        new.visibility := 'internal';
      end if;
      new.published_to_web_at := now();
      new.published_to_web_by := v_person;
    elsif new.published_to_web is distinct from (new.visibility = 'public') then
      -- Not yet backfilled: heal the derived column from the source of truth (before the switch).
      new.published_to_web := (new.visibility = 'public');
    end if;
    if v_vis_changed and v_has_shown and new.visibility = 'personal' then
      if new.shown_to is null then
        new.shown_to := 'only_me';
      end if;
    end if;
  end if;
  if v_counted then
    perform set_config(v_key, (coalesce(nullif(current_setting(v_key, true), ''), '0')::bigint + 1)::text, true);
  end if;
  return new;
end
$function$
;

do $$
declare m text;
begin
  begin
    insert into billing.spend_approval default values;
    raise exception using errcode = 'P0001', message = 't13-probe-reached-end';
  exception when others then
    get stacked diagnostics m = message_text;
    if m like '%has no field "shown_to"%' then
      raise exception 'still broken: an insert into billing.spend_approval raised %', m;
    end if;
  end;
end $$;

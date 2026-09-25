-- LANE TRASH-COVERAGE — THE GREEN SUITE. Every kind a screen archives comes back from Trash.
--
-- For each kind below, as admin@admin.com in the `authenticated` seat: archive one of its rows the
-- way its screen does (`deleted_at = now()` under RLS), find it in Trash (`trash_list` for that
-- kind), restore it through the one generic door (`entity_undelete`), and read it back — the row is
-- the row it was: every column identical except the write stamps the platform puts on EVERY
-- write (`updated_at`, `updated_by`, `updated_by_system`, `updated_by_tier`, `version`, and content.document's `content_version` counter). One
-- transaction, ends in ROLLBACK; every failure is collected and named together.
--
-- THE REAL USE CASE (owner law 2026-09-21, no fake test data): the admin tidies up — archives a
-- podcast show, a canvas map, a research template, a code folder, a study goal — then changes
-- their mind and gets each one back from Trash. Where the admin owns no live row of a kind, the
-- suite makes one inside the transaction (a show "Harborview Garage Talk", a template "Competitor
-- pricing scan", a study goal "Pass the CompTIA A+ core 1 exam", a Search Console rule "Pages
-- losing clicks week over week", a deal "Harborview fleet service contract", a document "Brake job
-- estimate"); all synthesized, nobody real.
--
-- RUN IT (clone):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/trashcoverage_green.sql
-- ITS RED: with migrations/inverse/trashcoverage_every_archived_kind_is_restorable_from_trash_down.sql
-- applied, the 33 newly registered kinds fail at "not listed in Trash" (project and canvas_item,
-- registered before this lane, stay green).

\set ON_ERROR_STOP on
\timing off

\set suite 'trashcoverage_green.sql'
\set requires 'grant:authenticated:public.trash_list|grant:authenticated:public.entity_undelete'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_kinds   constant text[] := array[
    'pc_show','pc_episode','pc_studio_run','research_template','tool','assessment','study_goal',
    'study_media','study_plan','study_session','code_file','code_folder','user_markdown_sample',
    'agent_run','web_brand','web_site','commerce_certified_printer','comparison_set','crm_deal',
    'crm_outreach_list','party','document','seo_engine_schedule','seo_gsc_dig_rule',
    'seo_keyword_class_rule','plan_entity','plan_node','fc_card','content_ir_kind_instance',
    'skill_render_definition','interview_session','billing_spend_guardrail','studio_session',
    'project','canvas_item'];
  v_org     uuid;
  v_cat     uuid;
  v_pipe    uuid;
  v_stage   uuid;
  v_tok     text;
  v_e       platform.entity_types%rowtype;
  v_id      uuid;
  v_before  jsonb;
  v_after   jsonb;
  v_diff    text[];
  v_n       int;
  v_ok      boolean;
  v_fail    text[] := '{}';
  v_pass    int := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/trashcoverage_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select om.organization_id into v_org
    from iam.organization_member om join iam.organizations o on o.id = om.organization_id
   where om.user_id = c_admin and o.archived_at is null
   order by (om.role = 'owner') desc, om.organization_id limit 1;
  select c.id into v_cat from platform.categories c
   where c.dimension = 'document_type' and c.slug = 'note' and c.deleted_at is null
     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
     and not coalesce((c.metadata ->> 'group')::boolean, false)
   limit 1;
  select c.parent_id, c.id into v_pipe, v_stage
    from platform.categories c
   where c.dimension = 'deal_pipeline' and c.parent_id is not null and c.deleted_at is null
     and coalesce(c.metadata->>'outcome', '') = ''
   order by c.id limit 1;

  foreach v_tok in array c_kinds loop
    begin
      perform set_config('role', 'postgres', true);
      select * into v_e from platform.entity_types where token = v_tok;
      if v_e.user_artifact_kind is null or not v_e.is_active then
        raise exception 'not listed in Trash: platform.entity_types.user_artifact_kind is empty';
      end if;

      v_id := null;
      -- A brand that still owns live sites refuses its archive (a real rule), so the brand case
      -- always archives a fresh one.
      -- A SYSTEM-tier SEO engine schedule governs every organization and only a platform admin
      -- may write it (fn_engine_schedule_target_guard), so the schedule case uses the admin's own
      -- organization-tier schedule.
      if v_tok = 'seo_engine_schedule' then
        select id into v_id from seo.engine_schedule
         where created_by = c_admin and deleted_at is null and scope_tier <> 'system' order by id limit 1;
      elsif v_tok <> 'web_brand' then
        execute format('select id from %I.%I where created_by = $1 and deleted_at is null order by id limit 1',
                       v_e.schema_name, v_e.table_name) into v_id using c_admin;
      end if;
      if v_id is null then
        -- A realistic fixture row for the kinds the admin has none of (inside the rollback).
        case v_tok
          when 'pc_show' then
            insert into podcast.pc_shows (title, slug, organization_id, created_by)
            values ('Harborview Garage Talk', 'harborview-garage-talk-' || substr(gen_random_uuid()::text,1,8), v_org, c_admin)
            returning id into v_id;
          when 'research_template' then
            insert into research.rs_template (name, organization_id, created_by)
            values ('Competitor pricing scan', v_org, c_admin) returning id into v_id;
          when 'study_goal' then
            insert into education.study_goal (title, organization_id, created_by)
            values ('Pass the CompTIA A+ core 1 exam', v_org, c_admin) returning id into v_id;
          when 'seo_gsc_dig_rule' then
            insert into seo.gsc_dig_rule (name, organization_id, created_by)
            values ('Pages losing clicks week over week', v_org, c_admin) returning id into v_id;
          when 'seo_engine_schedule' then
            insert into seo.engine_schedule (engine_slug, scope_tier, scope_organization_id, cadence, organization_id, created_by)
            select s.engine_slug, 'organization', v_org, s.cadence, v_org, c_admin
              from seo.engine_schedule s order by s.id limit 1
            returning id into v_id;
          when 'web_brand' then
            insert into web.brand (name, organization_id, created_by)
            values ('Harborview Mobile Mechanic', v_org, c_admin) returning id into v_id;
          when 'crm_deal' then
            insert into crm.deal (name, pipeline_id, stage_id, organization_id, created_by)
            values ('Harborview fleet service contract', v_pipe, v_stage, v_org, c_admin) returning id into v_id;
          when 'document' then
            insert into content.document (title, document_type_id, content_hash, data_class, visibility, organization_id, created_by)
            values ('Brake job estimate', v_cat, md5('Brake job estimate'), 'private', 'personal', v_org, c_admin)
            returning id into v_id;
          else
            raise exception 'the admin owns no live row and the suite has no fixture for it';
        end case;
      end if;
      execute format('select to_jsonb(t) from %I.%I t where id = $1', v_e.schema_name, v_e.table_name)
        into v_before using v_id;

      -- The screen's archive, from the person's seat.
      perform set_config('role', 'authenticated', true);
      execute format('update %I.%I set deleted_at = now() where id = $1 and deleted_at is null',
                     v_e.schema_name, v_e.table_name) using v_id;
      get diagnostics v_n = row_count;
      if v_n <> 1 then
        raise exception 'the admin could not archive their own row % (RLS refused)', v_id;
      end if;

      select exists (select 1 from public.trash_list(array[v_e.user_artifact_kind], 1000, 0) x where x.id = v_id)
        into v_ok;
      if not v_ok then
        raise exception 'archived row % is not in Trash', v_id;
      end if;

      if not public.entity_undelete(v_tok, v_id) then
        raise exception 'Trash restore of % answered false', v_id;
      end if;

      select exists (select 1 from public.trash_list(array[v_e.user_artifact_kind], 1000, 0) x where x.id = v_id)
        into v_ok;
      if v_ok then
        raise exception 'restored row % is still in Trash', v_id;
      end if;

      perform set_config('role', 'postgres', true);
      execute format('select to_jsonb(t) from %I.%I t where id = $1', v_e.schema_name, v_e.table_name)
        into v_after using v_id;
      select coalesce(array_agg(k order by k), '{}') into v_diff
        from (select key k from jsonb_each(v_before) b
               where b.value is distinct from (v_after -> b.key)
                 and b.key not in ('updated_at', 'updated_by', 'updated_by_system', 'updated_by_tier', 'version', 'content_version')) d;
      if cardinality(v_diff) > 0 then
        raise exception 'restored row % differs from what was archived in: %', v_id, array_to_string(v_diff, ', ');
      end if;

      v_pass := v_pass + 1;
      raise notice 'ok  %', v_tok;
    exception when others then
      perform set_config('role', 'postgres', true);
      v_fail := v_fail || format('%s: %s', v_tok, sqlerrm);
      raise notice 'RED %: %', v_tok, sqlerrm;
    end;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception E'trashcoverage_green: % of % kinds are not restorable from Trash:\n  %',
      cardinality(v_fail), cardinality(c_kinds), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'ALL % KINDS PASSED (trashcoverage_green) — archive, find in Trash, restore, identical.', v_pass;
end
$t$;

rollback;

-- lane: access-ladder T-8
-- Access ladder T-8c part 12 of 27 (2026-09-26): 6 tables move to the level the independent
-- table review gave them (common-docs/projects/access-ladder/table-review.md) under the access
-- ladder law (common-docs/policies/access-ladder.md). Every one moves TOWARD Organization or
-- Public, which needs no approval.
--
--   organization -> data_class organization, default_visibility internal (never owner-only);
--                   the owner-only variants (personal, restricted) move to entity first.
--   platform     -> Organization, platform-owned machinery: data_class organization. Machinery
--                   tables keep their bespoke policies (iam.apply_rls refuses machinery; the
--                   class trigger says so); the rest regenerate under their existing variant.
--   public       -> data_class public (platform catalogues and public-web content).
--
-- Order per table (db-rules DD-219 ordering trap): the registry type is explained where it no
-- longer follows the variant, then rls_variant moves, then data_class is set — the class-change
-- trigger regenerates the policies against a table that already meets its variant's contract.
-- Each table was dry-run alone in a rolled-back transaction first: iam.verify_canonical showed no
-- new FAIL on any of them. Kept small (a few seconds of regeneration) so no table's lock is held
-- long on the live database; lock_timeout 3s refuses rather than queues.
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $$
declare r record; t0 timestamptz; v_hasvis boolean; v_newvar text; v_reason text;
begin
  for r in
    select t.fq, t.verdict, et.token, et.schema_name s, et.table_name tb, et.rls_variant, et.data_class, et.default_visibility
      from (values 
    ('admin.feature_docs','platform'),
    ('workflow.comparison','organization'),
    ('communication.notification_channel_preference','organization'),
    ('hr.checklist_template','organization'),
    ('hr.pay_group','organization'),
    ('commerce.print_order','organization')
  ) as t(fq, verdict) join platform.entity_types et on et.schema_name||'.'||et.table_name = t.fq and et.is_active and not et.is_component
     where t.verdict in ('organization','platform','public')
     order by t.fq
  loop
    t0 := clock_timestamp();
    begin
      select exists(select 1 from information_schema.columns c where c.table_schema=r.s and c.table_name=r.tb and c.column_name='visibility') into v_hasvis;
      v_newvar := case when r.rls_variant in ('personal','restricted') then 'entity' else r.rls_variant end;
      v_reason := format('Access ladder T-8 (2026-09-26): %s per the independent table review (common-docs/projects/access-ladder/table-review.md) under the access ladder law; no law or universal company rule keeps coworkers out.',
                    case r.verdict when 'organization' then 'Organization' when 'platform' then 'Organization, platform-owned machinery' else 'Public' end);
      if r.verdict='public' then
        v_reason := 'Access ladder T-8 (2026-09-26): Public per the independent table review (common-docs/projects/access-ladder/table-review.md) — meant to be seen outside the organization (a platform catalogue or public-web content).';
      end if;
      -- the registry's `type` follows the variant unless explained; a restricted table keeps its
      -- `restricted` type (and its custom-fields design) with the reason written down
      if v_newvar is distinct from r.rls_variant then
        update platform.entity_types
           set type_reason = format('Access ladder T-8 (2026-09-26): rls_variant moved %s -> %s (Organization); type kept as %s so the table''s custom-fields design is unchanged.', r.rls_variant, v_newvar, type)
         where token = r.token and type is not null and type_reason is null and type <> 'entity';
      end if;
      -- 1. move the variant (retrofit is the variant contract; the class trigger regenerates after step 2)
      update platform.entity_types
         set rls_variant = v_newvar,
             default_visibility = case
                when r.verdict='public' and v_hasvis then 'public'::platform.visibility
                when r.verdict<>'public' and v_hasvis and (r.default_visibility is null or r.default_visibility in ('personal','public')) and v_newvar not in ('system','ledger','reference') then 'internal'::platform.visibility
                when r.verdict<>'public' and r.default_visibility='personal' then 'internal'::platform.visibility
                else r.default_visibility end
       where token = r.token;
      -- 2. then the class
      update platform.entity_types
         set data_class = case when r.verdict='public' then 'public'::platform.data_class else 'organization'::platform.data_class end,
             data_class_reason = v_reason
       where token = r.token;
      -- a variant move with no class change still needs its policies regenerated
      if v_newvar is distinct from r.rls_variant and r.data_class = (case when r.verdict='public' then 'public' else 'organization' end)::platform.data_class then
        perform iam.apply_rls(r.s, r.tb, r.token, v_newvar);
      end if;
      raise notice 'T-8: % %/% -> % %', r.fq, r.data_class, r.rls_variant, v_newvar, r.verdict;
    end;
  end loop;
end $$;

do $$
declare n int;
begin
  select count(*) into n
    from (values 
    ('admin.feature_docs','platform'),
    ('workflow.comparison','organization'),
    ('communication.notification_channel_preference','organization'),
    ('hr.checklist_template','organization'),
    ('hr.pay_group','organization'),
    ('commerce.print_order','organization')
  ) as t(fq, verdict)
    join platform.entity_types et on et.schema_name||'.'||et.table_name = t.fq and et.is_active
   where et.data_class is distinct from (case when t.verdict = 'public' then 'public' else 'organization' end)::platform.data_class
      or et.rls_variant in ('personal','restricted')
      or et.default_visibility = 'personal';
  if n <> 0 then raise exception 'T-8c: % tables did not land on their level', n; end if;
end $$;

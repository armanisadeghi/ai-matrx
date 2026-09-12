-- iam_class_regeneration_dd137b6_catalog_correction — FIVE PLATFORM CATALOGS ARE NOT A PERSON'S
-- CONFIDENTIAL DATA.
--
-- The DD-137b1 rule cascade derived a class for the 39 `restricted`-variant tokens from the variant
-- itself: `restricted` builds an owner-only std_select with a platform-staff arm, so `confidential`
-- was the class that DESCRIBED it. For 34 of the 39 that is exactly right — HR compensation, I-9s,
-- EEO responses, emergency contacts, signing keys, actor tokens, the two access audits.
--
-- For five it is wrong, and the access delta is what showed it. Measured between the DD-137b4
-- baseline and the DD-137b5 confirmation, for a platform admin:
--     mandate_reference  573,671 -> 0
--     mandate_scan         9,560 -> 0
--     ai_offering            262 -> 56
--     ai_api                  31 -> 3
--     ai_endpoint             14 -> 0
-- Every other principal read 0 before and 0 after. These tables hold no person's data at all: they
-- are the AI model catalog and the mandate-declaration telemetry — platform machinery whose whole
-- readership IS our staff, through admin surfaces that read Supabase directly as the signed-in user.
-- Closing the lane there does not protect anybody; it turns off the AI catalog admin and the
-- mandate scan reporting for the only people who use them.
--
-- 🚨 AND THIS IS THE CLASS BEING USED CORRECTLY, NOT WAIVED. `organization` on a `restricted`-variant
-- table means owner plus platform staff and nothing else — the `restricted` generator emits no
-- organization lane at all — so this restores exactly the lane these five had and adds none. The
-- change is a CLASSIFICATION correction with its reason written into the registry, which is the
-- difference between a declaration and an exception. `iam.verify_canonical` re-derives it either way.
--
-- The same-commit regeneration trigger from DD-137b3 does the work: a data_class change re-runs
-- iam.apply_rls for that token inside this transaction.
do $$
declare v_n integer;
begin
  update platform.entity_types set
    suppress_platform_admin_lane = false,
    data_class = 'organization',
    default_list_scope = 'organization',
    data_class_reason =
      'DD-137b6 correction. The DD-137b1 cascade derived `confidential` from rls_variant=restricted, '
      'which describes the LANES correctly and the CONTENT wrongly: this table holds no person''s '
      'data at all — it is platform catalog/telemetry whose readership is our own staff through '
      'admin surfaces that read Supabase directly as the signed-in user. Measured live 2026-09-12: '
      'closing the platform-staff lane took a platform admin from hundreds of thousands of rows to '
      'zero and changed nothing for any other principal. `organization` on a restricted-variant '
      'table is owner + platform staff and nothing more — the restricted generator emits no '
      'organization lane — so this restores the lane it had and adds none.'
  where is_active and token in ('ai_api','ai_endpoint','ai_offering','mandate_reference','mandate_scan');
  get diagnostics v_n = row_count;
  if v_n <> 5 then
    raise exception 'dd137b6: expected to correct five catalog tokens, corrected %', v_n;
  end if;
end $$;

do $$
declare r record; v_q text; v_n integer;
begin
  -- the lane is back, in the POLICY and not only in the registry
  for r in select et.token, et.schema_name, et.table_name from platform.entity_types et
            where et.token in ('ai_api','ai_endpoint','ai_offering','mandate_reference','mandate_scan')
  loop
    select pg_get_expr(pol.polqual, pol.polrelid) into v_q from pg_policy pol
     where pol.polrelid = to_regclass(format('%I.%I', r.schema_name, r.table_name))
       and pol.polname = 'std_select';
    if v_q is null or v_q not like '%is_platform_admin%' then
      raise exception 'dd137b6: % did not get its platform-staff lane back (std_select = %)', r.token, v_q;
    end if;
    -- and it did NOT gain an organization lane it never had
    if v_q like '%om.role = ANY%' or v_q like '%my_orgs%' then
      raise exception 'dd137b6: % GAINED an organization lane — `organization` on a restricted '
        'variant must be owner + platform staff and nothing more', r.token;
    end if;
  end loop;

  -- nothing else moved: still at most the ten ungeneratable bespoke tokens with an open lane
  select count(*) into v_n from platform.entity_types
   where is_active and data_class in ('private','confidential')
     and rls_variant not in ('component','ledger') and not suppress_platform_admin_lane;
  if v_n > 10 then
    raise exception 'dd137b6: % private/confidential tokens now declare an open platform-admin lane', v_n;
  end if;

  raise notice 'dd137b6: the five catalogs read again, and gained nothing';
end $$;

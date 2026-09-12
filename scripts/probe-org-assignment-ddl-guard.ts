#!/usr/bin/env npx tsx
/**
 * Emits the post-apply transaction probe for DD154. It never connects to a DB:
 * the sanctioned migration applier owns execution; the emitted SQL must run only
 * after DD154 is applied, in an isolated review database or transaction rollback.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = resolve(process.cwd(), "migrations/dd154_org_assignment_ddl_prevention.sql");
const required = [
  "CREATE TRIGGER",
  "p_org_default=true is forbidden",
  "rls_generator_planner_trap",
  "organization-assignment trigger function",
  "validation-only trigger",
];

function selfTest(): void {
  const sql = readFileSync(migration, "utf8");
  const missing = required.filter((needle) => !sql.includes(needle));
  if (missing.length) throw new Error(`DD154 probe contract missing: ${missing.join(", ")}`);
  if (/\bBEGIN\s*;|\bCOMMIT\s*;/i.test(sql)) throw new Error("DD154 must not carry transaction wrappers");
  console.log("PASS: DD154 static probe contract contains all required guard paths.");
}

const probe = String.raw`BEGIN;
CREATE TABLE public._dd154_org_guard_probe (organization_id uuid NOT NULL);

-- Negative: known function, including a renamed trigger, cannot attach.
DO $$ BEGIN
  BEGIN EXECUTE 'CREATE TRIGGER renamed_assignment BEFORE INSERT ON public._dd154_org_guard_probe FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()';
    RAISE EXCEPTION 'probe failed: known assignment attachment was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Negative: a new direct assignment body and a direct helper call both refuse.
DO $$ BEGIN
  BEGIN EXECUTE 'CREATE FUNCTION public._dd154_direct_assign() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.organization_id := gen_random_uuid(); RETURN NEW; END $f$';
    RAISE EXCEPTION 'probe failed: direct assignment function was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN EXECUTE 'CREATE FUNCTION public._dd154_helper_assign() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.organization_id := public.current_personal_org_id(); RETURN NEW; END $f$';
    RAISE EXCEPTION 'probe failed: direct helper assignment function was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Negative: a direct organization default cannot be added or recreated.
DO $$ BEGIN
  BEGIN EXECUTE 'ALTER TABLE public._dd154_org_guard_probe ALTER COLUMN organization_id SET DEFAULT public.current_personal_org_id()';
    RAISE EXCEPTION 'probe failed: organization default was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Frozen default debt: an unrelated ALTER is allowed; removing a historical
-- default is allowed; recreating its identical SQL is rejected because attrdef
-- receives a new OID. The surrounding transaction makes this non-persistent.
ALTER TABLE platform.output_feedback ADD COLUMN _dd154_unrelated integer;
ALTER TABLE platform.output_feedback ALTER COLUMN organization_id DROP DEFAULT;
DO $$ BEGIN
  BEGIN EXECUTE 'ALTER TABLE platform.output_feedback ALTER COLUMN organization_id SET DEFAULT current_personal_org_id()';
    RAISE EXCEPTION 'probe failed: recreated historical default was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Positive: validation-only trigger/function remains legal.
CREATE FUNCTION public._dd154_validate_org() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER validate_explicit_org BEFORE INSERT ON public._dd154_org_guard_probe
  FOR EACH ROW EXECUTE FUNCTION public._dd154_validate_org();

-- Coverage limit: a function that changes NEW indirectly (for example NEW := helper(NEW))
-- is deliberately not asserted PASS or FAIL here. DD154 is known/direct prevention; P02b
-- owns helper dependency attestation and an executable indirect-mutation negative probe.
ROLLBACK;`;

if (process.argv.includes("--self-test")) selfTest();
else if (process.argv.includes("--emit")) process.stdout.write(`${probe}\n`);
else {
  console.error("Usage: pnpm tsx scripts/probe-org-assignment-ddl-guard.ts --self-test|--emit");
  process.exitCode = 2;
}

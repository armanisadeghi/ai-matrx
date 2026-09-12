-- dd155 — PREPARED ONLY. Apply only through `pnpm db:apply` after owner + Sol review.
--
-- DD154 is immutable. This narrow follow-up changes only two contradictory
-- guidance strings in the live ddl guard. It deliberately does not relax a
-- branch, detach a historical default, or change permissions.

SET LOCAL lock_timeout = '5s';

DO $dd155$
DECLARE
  v_definition text;
  v_repaired_definition text;
  v_before_owner oid;
  v_before_security_definer boolean;
  v_before_config text[];
  v_before_acl aclitem[];
  v_after_owner oid;
  v_after_security_definer boolean;
  v_after_config text[];
  v_after_acl aclitem[];
  v_old_hint constant text := $old_hint$NO NULL ORG (owner ruling 2026-08-21, db-rules §2/§6e). NULL is not a scope: system/global content belongs to the system org (matrx-system, 39c38960-d30c-4840-b0c1-c9960de95582, iam.system_orgs.global_readable), and user content falls back to the creator's personal org. Declare organization_id uuid NOT NULL REFERENCES iam.organizations(id) and attach the backstop (public._stamp_org_default or platform.inherit_org_from_parent) in this same migration.$old_hint$;
  v_new_hint constant text := $new_hint$Declare organization_id uuid NOT NULL REFERENCES iam.organizations(id). The initiating operation must provide its organization_id explicitly; no resolver, default, trigger, backstop, or assignment may choose it.$new_hint$;
  v_old_detail constant text := $old_detail$NO NULL ORG (owner ruling 2026-08-21): this entity-looking table still allows organization_id IS NULL. NULL is not a scope -- system/global content belongs to the system org (matrx-system 39c38960-d30c-4840-b0c1-c9960de95582), user content to the creator's personal org. Flip it NOT NULL and attach the backstop in ONE migration. (db-rules §2/§6e.)$old_detail$;
  v_new_detail constant text := $new_detail$NO NULL ORG (owner ruling 2026-08-21): this entity-looking table still allows organization_id IS NULL. Declare organization_id NOT NULL. The initiating operation must provide its organization_id explicitly; no resolver, default, trigger, backstop, or assignment may choose it. (db-rules §2/§6e.)$new_detail$;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proowner, p.prosecdef, p.proconfig, p.proacl
    INTO v_definition, v_before_owner, v_before_security_definer, v_before_config, v_before_acl
  FROM pg_proc p
  WHERE p.oid = 'platform._ddl_guard()'::regprocedure;

  IF encode(digest(convert_to(v_definition, 'UTF8'), 'sha256'), 'hex')
       <> 'd619ea4bd180b16a7a3ad7cf4f563552a783cc502040826fe328610661ac8a68' THEN
    RAISE EXCEPTION 'dd155: platform._ddl_guard() source hash changed; re-read the live definition before applying';
  END IF;
  IF pg_get_function_identity_arguments('platform._ddl_guard()'::regprocedure) <> '' THEN
    RAISE EXCEPTION 'dd155: platform._ddl_guard() signature changed; refusing to replace guidance';
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_old_hint, ''))) / length(v_old_hint) <> 1
     OR (length(v_definition) - length(replace(v_definition, v_old_detail, ''))) / length(v_old_detail) <> 1
     OR position(v_new_hint IN v_definition) <> 0
     OR position(v_new_detail IN v_definition) <> 0 THEN
    RAISE EXCEPTION 'dd155: reviewed guidance anchors are unrecognized; refusing to guess';
  END IF;

  v_repaired_definition := replace(replace(v_definition, v_old_hint, v_new_hint), v_old_detail, v_new_detail);
  IF (length(v_repaired_definition) - length(replace(v_repaired_definition, v_new_hint, ''))) / length(v_new_hint) <> 1
     OR (length(v_repaired_definition) - length(replace(v_repaired_definition, v_new_detail, ''))) / length(v_new_detail) <> 1
     OR position(v_old_hint IN v_repaired_definition) <> 0
     OR position(v_old_detail IN v_repaired_definition) <> 0 THEN
    RAISE EXCEPTION 'dd155: guidance transform was not limited to the two reviewed messages';
  END IF;

  EXECUTE v_repaired_definition;

  SELECT p.proowner, p.prosecdef, p.proconfig, p.proacl
    INTO v_after_owner, v_after_security_definer, v_after_config, v_after_acl
  FROM pg_proc p
  WHERE p.oid = 'platform._ddl_guard()'::regprocedure;
  IF v_after_owner IS DISTINCT FROM v_before_owner
     OR v_after_security_definer IS DISTINCT FROM v_before_security_definer
     OR v_after_config IS DISTINCT FROM v_before_config
     OR v_after_acl IS DISTINCT FROM v_before_acl THEN
    RAISE EXCEPTION 'dd155: platform._ddl_guard() owner, security, config, or ACL changed';
  END IF;

  v_definition := pg_get_functiondef('platform._ddl_guard()'::regprocedure);
  IF position(v_new_hint IN v_definition) = 0
     OR position(v_new_detail IN v_definition) = 0
     OR position(v_old_hint IN v_definition) > 0
     OR position(v_old_detail IN v_definition) > 0 THEN
    RAISE EXCEPTION 'dd155: repaired guidance did not persist exactly';
  END IF;
END
$dd155$;

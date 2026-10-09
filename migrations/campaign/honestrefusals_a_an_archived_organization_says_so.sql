-- additive: yes
-- lane: HONEST-REFUSALS
-- lock: custom
-- chair-step: its only REVOKE takes EXECUTE from PUBLIC, anon and authenticated on the one helper this file creates (internal, called only by custom.assert_client_may_reach, whose own grants are postgres-only); no existing function loses a grant.
-- based-on: custom.assert_client_may_reach(uuid, text) d82e01ca87b2f834672ef58d549828683e46a775977c6dec5539e1a3727ef07f
--
-- LANE HONEST-REFUSALS 1. Every custom door refused an ARCHIVED organization with "You are not a member of
-- that organization" — to a person who IS a member (1,665 membership rows sit on 1,651 archived organizations).
-- Now: custom._not_a_member_refusal(door, organization) answers a member of an archived organization with
-- "This organization is archived ..." (same SQLSTATE 42501, DETAIL organization_archived:<org id>, HINT naming the
-- restore door iam.organization_restore and who may use it). A non-member meets today's sentence, unchanged.
-- Who may reach what does NOT change: only the words of a refusal that was already given.
-- LOCKS: one new function (grants revoked), one function body replaced (CREATE OR REPLACE keeps grants).
-- Inverse: migrations/inverse/honestrefusals_a_an_archived_organization_says_so_down.sql.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._not_a_member_refusal(p_door text, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- HONEST-REFUSALS: a person who HAS a membership row on an organization that is ARCHIVED is not "not a
  -- member": the archive closed the organization (iam.has_org_access_for), the membership is kept so a
  -- restore gives everything back. She is told that, who can restore it, and the door that does.
  -- A non-member (or a null organization) meets the old sentence, word for word, below.
  if p_organization_id is not null and exists (
       select 1
         from iam.organization_member m
         join iam.organizations o on o.id = m.organization_id and o.archived_at is not null
        where m.organization_id = p_organization_id and m.user_id = (select auth.uid())) then
    raise exception 'This organization is archived, so % has nothing to do there until an owner restores it.',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '42501',
            detail = 'organization_archived:' || p_organization_id::text,
            hint = 'Restore door: iam.organization_restore(p_org, p_confirm_name). Only an owner of the organization, or a super admin, can restore it; then every door works there again.';
  end if;
  perform custom._not_a_member_refusal(p_door);
end
$function$;

REVOKE ALL ON FUNCTION custom._not_a_member_refusal(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- A PLATFORM CONTEXT READ IN PROGRESS (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (1)). custom.context_scopes
  -- sets this for the length of ONE read of ONE platform context Table (custom.table_is_platform_context — a context
  -- Table of a global-readable system organization) the one ladder already lets the caller see, and clears it after;
  -- no client can set it (set_config is no client door). It admits nothing else: no memo is written, and every other
  -- door, Table and organization meets this wall as before.
  if nullif(current_setting('mx.platform_context_org', true), '') = p_organization_id::text then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- 🌐 THE WORLD LANE, FOR READING ONLY (CHAIR-WORLD-LANE, chair ruling 2026-10-05; access ladder: a Public
  -- table opens to anyone without being shared). An organization that holds a Table at the ladder's Public
  -- level (its Table record published to the web — the ladder's word; T-13) is reachable by any signed-in person through a READ
  -- door (custom.door_reads_only) and through nothing else: every write door still meets the refusal below.
  -- IT ADMITS AND NOTHING MORE, and it is the narrowest admission in this function: no memo 'w:r' is written,
  -- so it never carries to another door in the statement, and it leaves the marker 'w:pub' that the table
  -- doors read (custom.assert_public_reader_names_a_public_table, asked by custom.assert_may_know_table,
  -- custom.assert_client_may_open, custom.views and custom.read_record right after this wall). Those turn a
  -- Table that is NOT Public back into this very refusal, word for word — so for every other Table of the
  -- organization (the Matrx System kernel Tables included) every door answers exactly as before. The ladder
  -- is the next line of every door and gives a Public Table's rows at viewer and never above.
  -- A door the read door calls on its way (custom.query_visible_ids, custom.table_type_field, …) names itself
  -- here too; it passes only once the read door it serves has, in this same statement, named a Public Table
  -- (memo 'w:pubt', written by custom.assert_public_reader_names_a_public_table). Called on its own, in a
  -- statement of its own, it meets the refusal below exactly as before.
  if (custom.door_reads_only(p_door)
      or platform.memo_k_get('w:pubt:' || coalesce(p_organization_id::text, '-')) = '1')
     and custom.organization_has_a_public_table(p_organization_id) then
    perform platform.memo_k_put('w:pub:' || p_organization_id::text, '1');
    return;
  end if;

  -- HONEST-REFUSALS: the refusal knows WHICH organization, so a member of an ARCHIVED one is told it is archived.
  perform custom._not_a_member_refusal(p_door, p_organization_id);
end $function$;

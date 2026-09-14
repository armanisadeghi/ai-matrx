-- DD-208 — A DOOR IS NEVER WIDER THAN ITS TABLE: the global dictionary is
-- platform content, so the reach belongs to the TABLE, not to the door.
--
-- ═══ THE FACT ════════════════════════════════════════════════════════════════
-- `public.dict_resolve(...)` is SECURITY DEFINER and granted to `authenticated`.
-- It delegates to `public.dict_resolve_for(auth.uid(), ...)`, whose first
-- selection level is `global`: entries with `user_id`, `organization_id`,
-- `scope_type_id` and `scope_id` all NULL. `dictionary.dict_entries.std_select`
-- admits a row on exactly five arms — platform admin, `created_by = auth.uid()`,
-- an organization the caller owns/administers, a super-admin reading a
-- global-readable system org, and the entity-grant kernel. A global entry has
-- NULL in every one of those columns and NULL `created_by`, so it matches none:
-- the table refuses it to everyone except a platform admin.
--
-- Measured live 2026-09-13 on db.matrxserver.com, as `role authenticated` with
-- each caller's real JWT claims inside rolled-back transactions: `dict_resolve()`
-- returned 3 entries to test@test.com and 3 to a caller who belongs to no
-- organization, and a direct `select ... from dictionary.dict_entries where id =
-- any(...)` under the same identities returned 0 of the 3. The three are
-- 535f19b6-e063-4907-a570-3c6945c557da "AI Matrx",
-- 087ee5de-01ed-4429-9955-923400c8524e "Matrx" and
-- e4edc5bc-d917-4748-89f5-3c06a9907b1a "Arman".
--
-- ═══ THE DECISION ════════════════════════════════════════════════════════════
-- Unlike DD-208's other two doors, this extra reach IS a real product need and
-- the product says so in its own words: the dictionary "follows the ONE global
-- active context ... personal + global (always, via the RPC)"
-- (`features/dictionary/activeContextBridge.ts`). A global entry is how the
-- platform teaches every read-aloud voice to say "AI Matrx" — it is platform
-- content, authored only by platform admins (`public.dict_assert_access` refuses
-- any non-`admin.admins` caller at the `global` level, for read AND write), and
-- it is meant for every signed-in person. aidream reads the same level through
-- `dict_resolve_for` for TTS injection.
--
-- So the answer is NOT to narrow `dict_resolve`, which would take the global
-- dictionary away from the feature it exists for. It is to stop the DOOR being
-- the place the reach is written down. The table says who may read an entry;
-- today it forgot to say anything about the owner-less ones.
--
-- ═══ THE FIX ═════════════════════════════════════════════════════════════════
-- One bespoke SELECT policy of record on `dictionary.dict_entries`, bounded to
-- exactly the rows the product means and nothing else:
--
--   * `is_active` — an entry a platform admin has switched off is not content.
--   * all four owner columns NULL — the definition of `global` used verbatim by
--     `dict_resolve_for`, `dict_list_entries_for` and `dict_rollup_for`. A row
--     with ANY owner column set is somebody's, and the generated policy already
--     rules on it; this policy cannot reach it.
--   * SELECT only, `authenticated` only. Writing a global entry stays platform-
--     admin-only through `platform_admin_all` and `dict_assert_access`; `anon`
--     gets nothing.
--
-- `iam.apply_rls` keeps what it did not author (DD-147), so a later regeneration
-- of this table leaves this policy standing; its name is not one of the seven the
-- generator emits. Its record is this file (DD-172's contract), and the reason is
-- the paragraph above.
--
-- REASON (for `iam.superseded_policy` should anyone ever remove it): the global
-- dictionary level is platform-authored pronunciation content that every signed-in
-- user's read-aloud voice depends on; removing this policy does not close a hole,
-- it moves the hole back into `public.dict_resolve` where nobody can audit it.
--
-- OWNER: the Dictionary feature (`matrx-frontend/features/dictionary/FEATURE.md`).

set local lock_timeout = '4s';

drop policy if exists dict_global_entries_read on dictionary.dict_entries;

create policy dict_global_entries_read
  on dictionary.dict_entries
  for select
  to authenticated
  using (
    is_active
    and user_id is null
    and organization_id is null
    and scope_type_id is null
    and scope_id is null
  );

comment on policy dict_global_entries_read on dictionary.dict_entries is
  'DD-208 policy of record. The global dictionary level (all four owner columns NULL) is platform-authored content every signed-in user reads for pronunciation; it is written only by platform admins via public.dict_assert_access. Recorded in migrations/dd208_global_dictionary_is_platform_content.sql. Owner: the Dictionary feature.';

-- Proof, in this transaction, that the policy admits the global level and NOTHING
-- else: an owned entry must stay invisible to a stranger through this policy.
do $$
declare
  v_global integer;
  v_owned  integer;
begin
  select count(*) into v_global
    from dictionary.dict_entries
   where is_active and user_id is null and organization_id is null
     and scope_type_id is null and scope_id is null;
  select count(*) into v_owned
    from dictionary.dict_entries
   where (user_id is not null or organization_id is not null
          or scope_type_id is not null or scope_id is not null)
     and (is_active and user_id is null and organization_id is null
          and scope_type_id is null and scope_id is null);
  if v_owned <> 0 then
    raise exception 'DD-208: the global-read policy would admit % owned entries. Refusing.', v_owned;
  end if;
  raise notice 'DD-208: dict_global_entries_read admits % global entries and 0 owned entries.', v_global;
end $$;

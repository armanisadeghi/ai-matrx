-- ============================================================================
-- Align the governance-column set to THE THREE SHARE LEVELS (Arman, 2026-08-14)
-- ============================================================================
-- Corrects two mistakes in `iam_governance_column_tier.sql`, both of them mine,
-- both from misreading what the three levels mean. The canonical statement of
-- the levels now lives in
-- common-docs/systems/access-architecture/SHARE_LEVELS.md — read that first.
--
-- THE RULE, in Arman's words: "I can give you view access, which means you can
-- see everything but not edit. I can give you edit access, which means you can
-- edit the basics, but you cannot delete things or do super destructive things
-- or edit some of the really core things — and those core things need to be
-- decided on an individual item basis. Admin access is where I'm giving you my
-- same privileges, so you can delete or do whatever else you want."
--
-- MISTAKE 1 — `visibility` should NOT be governed by default.
--   I made publishing owner-only. Wrong. Publishing something you did not
--   create IS how real systems work — in most companies the publisher is the
--   person at the END of the line who approves it, not the person who happened
--   to click "new" first. Edit access includes publishing. Removed from the
--   default set; still available per item type for the rare entity where
--   visibility genuinely IS a core field (that is what `governed_columns` is
--   for).
--
-- MISTAKE 2 — `deleted_at` MUST be governed. Edit has NEVER meant delete.
--   The platform already said so and I missed it: `entity_soft_delete` requires
--   admin and `entity_undelete` requires editor [live-verified]. The raw column
--   write was simply a door with no lock, so trashing another person's item had
--   two doors with different locks. This closes the second door to match the
--   first — it is not a new policy, it is the existing one enforced.
--   Asymmetric on purpose, exactly like the RPC pair: SETTING `deleted_at`
--   (trashing) is destructive and needs owner/admin; CLEARING it (restoring) is
--   not destructive and stays ordinary editing. The creator always passes, so
--   everyone still trashes their own things.
--
-- STILL REQUIRED, NOT YET BUILT — the companion to "edit cannot delete".
--   A rule that only refuses is half a system. An editor who is refused a
--   delete needs a "Request deletion" path that routes to whoever can decide,
--   the same shape as the existing access-request lane. Specified in
--   SHARE_LEVELS.md § "What still has to be built". The refusal message below
--   says so in words the user can act on, which is the floor, not the finish.
--
-- Idempotent. Source: matrx-frontend.
-- ============================================================================

create or replace function iam.governance_columns(p_token text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select et.governed_columns from platform.entity_types et where et.token = p_token),
    -- THE PLATFORM DEFAULT. Deliberately NOT `visibility` — publishing is an
    -- edit-level action. These three are "delete it, or change who owns it".
    array['created_by', 'organization_id', 'deleted_at']
  );
$$;

comment on function iam.governance_columns(text) is
  'Resolves the governance-column set for an entity token: the per-type override on platform.entity_types.governed_columns, else the platform default {created_by, organization_id, deleted_at} — the columns an EDIT-level sharee may not touch. NOT visibility: publishing is an edit-level action (Arman, 2026-08-14). See common-docs/systems/access-architecture/SHARE_LEVELS.md.';

create or replace function iam._guard_governance_columns()
returns trigger
language plpgsql
as $$
declare
  v_token   text := TG_ARGV[0];
  v_uid     uuid;
  v_old     jsonb := to_jsonb(OLD);
  v_new     jsonb := to_jsonb(NEW);
  v_cols    text[];
  v_col     text;
  v_is_owner boolean;
  v_is_admin boolean;
  v_row_id  uuid;
begin
  -- The privileged lane governs by design (aidream's pool, migrations, service
  -- role, and every SECURITY DEFINER RPC — those carry their own gates, e.g.
  -- entity_soft_delete requires admin). Only the RLS-enforced lane is tiered,
  -- and aidream's acting_as_user posture lands HERE, which is correct: an agent
  -- is exactly its user.
  if current_user <> 'authenticated' then
    return NEW;
  end if;

  v_uid := coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    (select auth.uid())
  );
  if v_uid is null then
    return NEW;
  end if;

  v_cols := iam.governance_columns(v_token);
  if v_cols is null or cardinality(v_cols) = 0 then
    return NEW;
  end if;

  v_is_owner := (v_old ->> 'created_by') is not null
                and (v_old ->> 'created_by')::uuid = v_uid;
  v_row_id   := nullif(v_old ->> 'id', '')::uuid;

  foreach v_col in array v_cols loop
    if not (v_old ? v_col) then
      continue;
    end if;
    if (v_new -> v_col) is not distinct from (v_old -> v_col) then
      continue;
    end if;

    -- created_by is the access key itself. Rewriting it through a row UPDATE is
    -- ownership TRANSFER, and it escalates: the new value satisfies std_delete's
    -- owner arm. No level buys it in this lane — not editor, not admin, not the
    -- owner. Ownership transfer, if we ever want it, is a deliberate audited
    -- operation, never a column write.
    if v_col = 'created_by' then
      raise exception using
        errcode = '42501',
        message = format('Ownership of this %s cannot be transferred by editing it.', v_token),
        detail  = 'created_by is the access key for this row; changing it through an UPDATE would silently hand over every owner privilege, including delete.',
        hint    = 'Ownership transfer is a deliberate, audited operation — it is not a column write.';
    end if;

    -- ADOPTION is not re-homing. A row with no organization yet may be adopted
    -- by anyone who can edit it; moving a row that ALREADY belongs to a tenant
    -- is a governance act.
    if v_col = 'organization_id' and (v_old ->> 'organization_id') is null then
      continue;
    end if;

    -- RESTORING is not deleting. Clearing deleted_at brings something back and
    -- is ordinary editing — mirrors entity_undelete (editor) vs
    -- entity_soft_delete (admin). Only SETTING it is the destructive direction.
    if v_col = 'deleted_at' and (v_new ->> 'deleted_at') is null then
      continue;
    end if;

    if v_is_owner then
      continue;
    end if;

    if v_is_admin is null then
      v_is_admin := coalesce(iam.has_access(v_token, v_row_id, 'admin'::public.permission_level), false);
    end if;
    if v_is_admin then
      continue;
    end if;

    if v_col = 'deleted_at' then
      raise exception using
        errcode = '42501',
        message = format('Edit access does not include deleting this %s.', v_token),
        detail  = 'Edit access lets you change the content. Deleting someone else''s work needs full access, or the person who created it.',
        hint    = 'Ask the owner to delete it, or ask them for full access to this item.';
    end if;

    raise exception using
      errcode = '42501',
      message = format('Changing "%s" on this %s needs full access — edit access is not enough.', v_col, v_token),
      detail  = format('"%s" decides who this row belongs to. Edit access changes the content; it does not change ownership.', v_col),
      hint    = 'Ask the owner to make this change, or ask them for full access to this item.';
  end loop;

  return NEW;
end
$$;

comment on function iam._guard_governance_columns() is
  'THE GOVERNANCE-COLUMN TIER. BEFORE UPDATE guard for entity-family tables enforcing the EDIT/FULL boundary of the three share levels: an edit-level sharee may not delete (set deleted_at), may not re-home an owned organization_id, and may never rewrite created_by (refused at every level). Publishing (visibility) is deliberately NOT governed — it is an edit-level action. Restoring (clearing deleted_at) and adopting an org-less row are deliberately allowed. Skips the privileged lane. See common-docs/systems/access-architecture/SHARE_LEVELS.md.';

-- chair-step: it replaces four live client doors and adds one non-client primitive under them.
--   It cannot be gated on custom/system_enabled and must not be: platform.associations is a
--   PRIMITIVE under every feature, and none of these four doors has anything to do with the
--   record store's switch. A knob read here would be a comment pretending to be a switch.
--   Additive in substance — one CREATE, four CREATE OR REPLACE, one registry row; no DROP, no
--   REVOKE, no schema change — and every body it overwrites is named by a `-- based-on:` line.
-- based-on: public.assoc_remove(text, uuid, text, uuid, text) a66c375ca0ec09d30b6647ef969ddf0ca11e8ff38b8c31b51710c4bf41144381
-- based-on: public.conversation_file_remove(uuid, uuid) c645e60819dfb885e8469dbff1deb2059d539d74c3b4ce0a5c5898c45085afa1
-- based-on: public.agent_resource_remove(uuid, text, uuid) 473d2e1c0c549e42628cc2e53e5a8cd79dbe6c7eded0a0f24d6c41af736fa14c
-- based-on: public.edu_class_unassign(uuid, text, uuid) 871660b17376dd88ab99d966c950acb3d93b50411490fcc427f7f3fe73f79c68
--
-- TAILS-5 (A) — A REMOVAL ARCHIVES THE EDGE. IT DOES NOT DESTROY IT.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT, MEASURED WHILE PROVING SOMETHING ELSE (2026-09-21)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Writing clause 7 of `scripts/campaign-tests/tails5_relink_green.sql` — the dispatcher takes
-- the photo of the corroded riser out of the job's chat and puts it back — the clause failed:
--
--     7: the photo came back as a DIFFERENT edge (47fb89b2-… then aa898323-…)
--
-- `public.conversation_file_remove` does not archive the link. It runs
-- `DELETE FROM platform.associations`, and so do `public.agent_resource_remove`,
-- `public.assoc_remove`, `public.dissociate_from_task`, `public.edu_class_unassign` and
-- `public.set_entity_scopes`. So taking a photo off a conversation, a resource off an agent,
-- an assignment off a class or a scope off a record **destroys the row**: its id, its
-- `created_by`, its `created_at`, its metadata and its whole history line are gone, and the
-- thing a person puts back is a different object that never went anywhere.
--
-- This platform ARCHIVES. `platform.associations` carries `deleted_at`, `deleted_via_type` and
-- `deleted_via_id`; there is a `platform.associations_live` view over the survivors;
-- `platform.relation_unset` — the relation door a person reaches through the same screens —
-- soft-deletes and says so in its own body (REL-13); `_gc_assoc_softdelete` exists precisely to
-- follow a soft delete; and TAILS-5's own revive trigger, landed hours earlier, brings a
-- tombstone back **as the same row**. Every part of the machinery assumed the tombstone. Six
-- doors never wrote one.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE CLASS, AND WHERE ITS EDGE IS — MEASURED, NOT ASSUMED
-- ════════════════════════════════════════════════════════════════════════════════════════
-- 26 functions carry `delete from platform.associations`. They are NOT one population, and
-- treating them as one would be the mistake:
--
-- ✔ THE REMOVAL DOORS — a person takes a link she made between two things she can name. These
--   archive from now on. Six of them: the four in this file, plus `public.dissociate_from_task`
--   and `public.set_entity_scopes`, which are in the companion file for the reason below.
--
-- ✘ THE MIRRORS AND SYNCS — `crm._affiliation_edge`, `plan._site_edge`, `seo._map_brand_edge`,
--   `platform._mirror_m2m_to_assoc`, `rag.sync_data_store_member_association`,
--   `docproc.sync_page_image_file_association`, `docproc.sync_processed_doc_file_association`.
--   These DERIVE an edge from a row that is itself the archive, and re-derive it wholesale. A
--   tombstone here would be worse than a delete, not better: the next re-derivation inserts the
--   same key, TAILS-5's revive trigger brings the stale edge back with its old payload, and the
--   mirror silently stops mirroring. **Left alone deliberately.**
--
-- ✘ THE COLLECTORS — `platform._gc_entity_associations`, `_gc_entity_associations_stmt_harddelete`,
--   `_gc_scope_associations`, `platform.sweep_orphaned_associations`, `public.crm_party_purge`.
--   A platform that archives still needs exactly ONE lane that destroys, and this is it: the gc
--   follows a parent's HARD delete, the sweep collects edges whose endpoints no longer exist,
--   and a purge is a purge by name. **Left alone deliberately.**
--
-- ⚠ THE SEO SET-DOORS — `seo.set_page_intents`, `set_page_map_topics`, `set_page_map_facet`,
--   `set_map_topic_facet`, `set_site_map`, `merge_map_topics`, `_tm_reject_topics`,
--   `_tm_remove_topics`. These re-compute a machine-derived topic map wholesale and carry the
--   same revive hazard as the mirrors, with per-door semantics this lane has not read. **NOT
--   converted, and named here rather than left to be discovered** — they are the remainder of
--   this class and they need somebody who knows that map.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE FIX: ONE PRIMITIVE, AND THE DOORS CALL IT
-- ════════════════════════════════════════════════════════════════════════════════════════
-- `platform.assoc_unset(source_type, source_id, target_type, target_id, role)` is the ONE
-- place that knows what removing an edge means, and it means the same thing everywhere:
-- `deleted_at = now()`, the withdrawal stamped with who did it, and the row still there. It is
-- the exact twin of `platform.relation_unset`'s own UPDATE, which is what a relation column has
-- done all along — the two were never supposed to disagree.
--
-- It judges the CALLER not at all, deliberately, and holds no grant to `authenticated`: each
-- door above it keeps its own authority decision, because that is the part that differs
-- (editor on the access-conveying container, editor on both endpoints, the class owner). The
-- same shape as `custom._share_write_person`, and its `platform.client_callable_door` row says
-- so in full.
--
-- 🚨 AND IT MAKES THE REVIVE MEAN SOMETHING. Until today, "put it back" could not work on these
-- doors even in principle: there was nothing to revive. The two changes are one change.
--
-- Inverse: migrations/inverse/tails5a_a_removal_archives_the_edge_down.sql
-- Companion (the two doors the rehearsal copy has drifted on):
--   migrations/campaign/tails5a_the_two_doors_the_copy_has_drifted_on.sql

set lock_timeout = '4s';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE PRIMITIVE
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function platform.assoc_unset(
  p_source_type text,
  p_source_id   uuid,
  p_target_type text,
  p_target_id   uuid,
  p_role        text default null,
  p_via_type    text default null,
  p_via_id      uuid default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_n integer;
begin
  -- THE WITHDRAWAL, NOT THE DESTRUCTION. The row keeps its id, its created_by, its created_at,
  -- its metadata and its history; what changes is that it is no longer in force. That is what
  -- every other unmaking on this platform means, and it is what `platform.associations_live`,
  -- `_gc_assoc_softdelete` and `platform.revive_tombstoned_association` were all built to read.
  update platform.associations a
     set deleted_at       = now(),
         deleted_via_type = coalesce(p_via_type, a.deleted_via_type),
         deleted_via_id   = coalesce(p_via_id,   a.deleted_via_id)
   where a.source_type = p_source_type
     and a.source_id   = p_source_id
     and a.target_type = p_target_type
     and a.target_id   = p_target_id
     and a.role is not distinct from p_role
     and a.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;

comment on function platform.assoc_unset(text, uuid, text, uuid, text, text, uuid) is
  'THE ONE WAY AN EDGE IS UNMADE. Tombstones the association (deleted_at, deleted_via_*) and '
  'returns how many it withdrew; it never destroys a row. It judges the CALLER not at all — '
  'every caller decides its own authority first — and holds no grant to authenticated. '
  'Destroying an edge is the collectors'' lane only (platform._gc_*, sweep_orphaned_associations, '
  'crm_party_purge). TAILS-5, 2026-09-21.';

-- DECLARE THE LANE BEFORE ANY GRANT EXISTS — and there is no grant, which is the point.
-- (PORTAL-BIND §5: declare the door, THEN grant, in that order, in the same file. Here the
-- declaration says out loud that no grant is coming.)
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane)
values
  ('platform', 'assoc_unset',
   'p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_role text, p_via_type text, p_via_id uuid',
   array['text','uuid','text','uuid','text','text','uuid']::regtype[]::oid[],
   'TAILS-5',
   'The ONE writer that unmakes an association. It tombstones and never destroys, so a link a '
   'person takes off can be put back as the SAME row — which is what TAILS-5''s revive trigger '
   'was built to do and what six removal doors made impossible by deleting instead.',
   false, false,
   'non_client_lane: every caller must have decided its authority BEFORE calling this. It asks '
   'nothing about the caller on purpose, because the authority question differs per door — '
   'editor on the access-conveying container for assoc_remove, editor on both endpoints for the '
   'non-conveying case, the class owner for edu_class_unassign. It holds no grant to '
   'authenticated and nothing client-side calls it.')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. public.assoc_remove — the generic door
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assoc_remove(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_container_side text;
    v_container_type text;
    v_container_id uuid;
    v_source_editor boolean;
    v_source_viewer boolean;
    v_target_editor boolean;
    v_target_viewer boolean;
begin
    if (select auth.uid()) is null then
        raise exception 'assoc_remove: authenticated user required'
            using errcode = '42501';
    end if;

    if p_source_type = 'file' and p_target_type = 'conversation' then
        if p_role is not null then
            raise exception 'file -> conversation supports only the canonical role-less attachment edge'
                using errcode = '42501';
        end if;
        perform public.conversation_file_remove(p_target_id, p_source_id);
        return;
    end if;

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;

    if v_container_side is distinct from 'none'
       and v_container_side is not null then
        if v_container_side = 'target' then
            v_container_type := p_target_type;
            v_container_id := p_target_id;
        elsif v_container_side = 'source' then
            v_container_type := p_source_type;
            v_container_id := p_source_id;
        else
            raise exception 'assoc_remove: unsupported container_side %', v_container_side
                using errcode = '23514';
        end if;

        if not iam.has_access(
            v_container_type,
            v_container_id,
            'editor'::public.permission_level
        ) then
            raise exception 'assoc_remove: editor access to the access-conveying container is required'
                using errcode = '42501';
        end if;
    else
        v_source_editor := iam.has_access(
            p_source_type, p_source_id, 'editor'::public.permission_level
        );
        v_source_viewer := iam.has_access(
            p_source_type, p_source_id, 'viewer'::public.permission_level
        );
        v_target_editor := iam.has_access(
            p_target_type, p_target_id, 'editor'::public.permission_level
        );
        v_target_viewer := iam.has_access(
            p_target_type, p_target_id, 'viewer'::public.permission_level
        );
        if coalesce((
            (v_source_editor and v_target_viewer)
            or (v_source_viewer and v_target_editor)
        ), false) is not true then
            raise exception 'assoc_remove: non-conveying edges require editor access to one endpoint and viewer access to the other'
                using errcode = '42501';
        end if;
    end if;

    -- TAILS-5: ARCHIVED, NOT DESTROYED. The authority decision above is unchanged, character
    -- for character; only what happens afterwards is different. The link keeps its id and its
    -- history, so putting it back puts back the SAME link.
    perform platform.assoc_unset(p_source_type, p_source_id, p_target_type, p_target_id, p_role);
end
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. public.conversation_file_remove — the photo off the job's chat
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.conversation_file_remove(p_conversation_id uuid, p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'conversation_file_remove: authenticated user required'
            USING ERRCODE = '42501';
    END IF;
    IF NOT iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level) THEN
        RAISE EXCEPTION 'conversation_file_remove: editor access to conversation required'
            USING ERRCODE = '42501';
    END IF;

    -- TAILS-5: ARCHIVED, NOT DESTROYED. Taking the photo off the chat and putting it back now
    -- puts back the same edge, with its label and the day it was first attached.
    PERFORM platform.assoc_unset('file', p_file_id, 'conversation', p_conversation_id, NULL,
                                 'conversation', p_conversation_id);
END
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. public.agent_resource_remove — a resource off an agent
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.agent_resource_remove(p_agent_id uuid, p_source_type text, p_source_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_remove: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_remove: editor access to agent required'
      using errcode = '42501';
  end if;

  -- TAILS-5: ARCHIVED, NOT DESTROYED.
  perform platform.assoc_unset(p_source_type, p_source_id, 'agent', p_agent_id, 'agent_resource',
                               'agent', p_agent_id);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 5. public.edu_class_unassign — an assignment off a class
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.edu_class_unassign(p_class uuid, p_token text, p_resource uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can remove assignments' using errcode = '42501';
  end if;
  -- TAILS-5: ARCHIVED, NOT DESTROYED. Un-assigning and re-assigning the same resource keeps
  -- ONE assignment with ONE history, which is what a teacher would expect of a class register.
  perform platform.assoc_unset(p_token, p_resource, 'scope', v_scope.id, 'assignment',
                               'scope', v_scope.id);
  return jsonb_build_object('status', 'unassigned', 'token', p_token, 'resource_id', p_resource);
end;
$function$;

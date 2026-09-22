-- chair-step: it replaces four live bodies — the BEFORE INSERT trigger function on
--   platform.associations and the three client doors that read an edge id off RETURNING.
--   It cannot be gated on custom/system_enabled and must not be: platform.associations is a
--   PRIMITIVE under every feature in the platform, and two of the three doors
--   (public.conversation_file_add, public.agent_resource_add) have nothing to do with the
--   record store's switch. A knob read here would be a comment pretending to be a switch.
--   Additive in substance — CREATE OR REPLACE only; no DROP, no REVOKE, no schema change —
--   and every body it overwrites is named by a `-- based-on:` line below.
-- based-on: platform.revive_tombstoned_association() d095c9e5cb1e2a48fd3dab702b2ec4ff62036beed8b255ec525145ec58c0e667
-- based-on: public.assoc_add(text, uuid, text, uuid, uuid, text, jsonb, text, integer, text, jsonb) 9a9f807ff4e77365d5707ef81a1fcd324508f5c93b08947d63812051ec93b60b
-- based-on: public.agent_resource_add(uuid, text, uuid, text, jsonb) e7f66b6c9eba33f735148de6f46199faa7b4308a818bcb6093bcca12b39bec4e
-- based-on: public.conversation_file_add(uuid, uuid, text, jsonb, boolean) 9b7d35f4c50ff811135021ae11d0355115ae1125a9e5528f2d396ffc462ea5aa
--
-- TAILS-5 — A REVIVE IS AN UPDATE OF THE TOMBSTONE, NEVER A SECOND ROW IN THE SAME STATEMENT.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT, MEASURED ON THE MAIN DATABASE FROM THE `authenticated` SEAT (2026-09-21)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Rincon Plumbing Co — Carpinteria Branch. The dispatcher puts Marisol Vega on job RPC-2214,
-- takes her off because she thinks she has the wrong duplex, and puts the SAME customer back
-- on when she realises the first entry was right:
--
--     linked:   1 live edge(s)
--     unlinked: 0 live edge(s)
--     RELINK FAILED — 21000 "ON CONFLICT DO UPDATE command cannot affect row a second time"
--
-- A person cannot put back a link she just took off. It is not a same-transaction artefact:
-- `platform.relation_unset` and `platform.relation_set` are separate statements with separate
-- command ids, and the failure is entirely inside `relation_set`'s single INSERT.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE ROOT CAUSE, AND WHY IT IS A CLASS AND NOT AN INSTANCE
-- ════════════════════════════════════════════════════════════════════════════════════════
-- `trg_associations_revive_tombstone` is a BEFORE INSERT ROW trigger that runs an OUT-OF-BAND
-- `UPDATE` clearing `deleted_at` on the very row the arriving INSERT is about to conflict
-- with. That UPDATE takes a LATER command id than the INSERT statement, so the revived tuple
-- version is invisible to the INSERT's own snapshot; `ON CONFLICT DO UPDATE` finds the arbiter
-- index entry, cannot lock a row it may not see, and raises `21000`.
--
-- A BEFORE INSERT trigger that pre-updates the conflicting row and an `ON CONFLICT DO UPDATE`
-- on the same statement are STRUCTURALLY INCOMPATIBLE. And `associations_unique` is a FULL
-- unique index — `(source_type, source_id, target_type, target_id, role) NULLS NOT DISTINCT`,
-- no `where deleted_at is null` — so the tombstone blocks a plain INSERT too. Which means the
-- trigger had NO working path at all: an upsert died `21000`, a plain insert died `23505`
-- after the revive, and in both cases the statement rolled the revive back with it. Its only
-- measurable effect was turning a clean `23505` into a confusing `21000`.
--
-- THE POPULATION — every function that upserts `platform.associations` on that arbiter, and
-- therefore every one of them that meets a tombstoned edge (censused from `pg_proc`, 16 of 16):
--
--   crm._affiliation_edge                          public.agent_resource_add      *
--   custom._containment_association                public.assoc_add               *
--   custom._containment_association_stmt_insert    public.conversation_file_add   *
--   custom._containment_association_stmt_update    public.edu_class_assign
--   custom._relation_associations                  public.set_entity_scopes
--   custom._relation_associations_stmt_insert      seo._map_brand_edge
--   custom._relation_associations_stmt_update      seo.set_page_map_topics
--   plan._site_edge                                platform.relation_set
--
-- So it is not only a job losing its customer. Remove a file from a conversation and add it
-- back, take a resource off an agent and put it back, un-tag and re-tag a brand — the same
-- statement, the same `21000`. Sixteen instance fixes would be sixteen copies of one
-- sentence, which is why this is fixed at the primitive and in ONE place.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE FIX — AND THE TWO DESIGNS REJECTED BY NAME, SO NOBODY RE-OPENS THEM
-- ════════════════════════════════════════════════════════════════════════════════════════
-- The trigger stops writing a second tuple. It revives the tombstone IN PLACE, carrying the
-- arriving row's values, and RETURNS NULL — so no insert happens, no conflict arises, and the
-- edge keeps its id, its `created_at`, its `created_by` and its whole history chain.
--
--   ✗ HARD-DELETE THE TOMBSTONE AND RE-INSERT UNDER ITS ID — rejected. `_gc_assoc_harddelete`
--     fires `platform._gc_entity_associations('agent_surface_binding')` on DELETE, which
--     hard-deletes every edge whose endpoint is this edge's id. A relink would silently take
--     surface bindings with it. A fix that cascades is not a fix.
--   ✗ A PARTIAL UNIQUE INDEX ON `deleted_at is null` — rejected. It makes a relink a SECOND
--     ROW, which loses the edge's identity and its history. That is the thing this file's own
--     title forbids.
--   ✗ ROUTE THE SIXTEEN THROUGH ONE CANONICAL `platform.assoc_set` — the right LONG answer,
--     and it is sixteen rewrites across `crm`, `plan`, `seo`, `public` and `custom`, all of it
--     code live features depend on. Not taken in passing; the primitive fix makes all sixteen
--     correct today and leaves that consolidation free to happen later.
--
-- 🚨 THE CONTRACT IS NOT SKIPPED, AND THIS IS THE PART THAT WOULD BE EASY TO GET WRONG.
-- Triggers fire in name order, so returning NULL skips every BEFORE INSERT trigger that sorts
-- AFTER `trg_associations_revive_tombstone` — which is the relation contract itself
-- (`trg_associations_zzz_relation_contract`), the payload validator, both surface-binding
-- guards and `zzzz_store_relation_edge_names_its_field`. Every one of them is also a BEFORE
-- **UPDATE** trigger, so the revive's own UPDATE fires them — PROVIDED the SET list covers the
-- columns each one keys on. That is why this UPDATE writes `source_type, source_id,
-- target_type, target_id, role, organization_id, metadata, payload_kind, payload` even where
-- the value is unchanged: `trg_surface_binding_scope_integrity` is `UPDATE OF source_type,
-- target_type, role, organization_id, metadata, payload_kind` and `trg_validate_edge_payload`
-- is `UPDATE OF payload, payload_kind`. Drop a column from the SET list and you silently
-- disarm a guard.
--
-- `platform.enforce_relation_edge` was BUILT for this: its gate zero says in its own words
-- that "an UNDELETE is a different thing entirely — that row becomes live and does state a
-- fact again — and it carries `deleted_at is null`, so it still goes through every gate
-- below." REL-5, REL-7, REL-8, REL-10 and REL-12 all run on the revive path.
--
-- WHAT THE REVIVE CARRIES, AND WHY IT IS A MERGE AND NOT A REPLACE. On the revive path the
-- caller's own `DO UPDATE` never runs, so this trigger's merge policy replaces sixteen
-- slightly different ones. It is deliberately the LEAST destructive shape: a column the
-- arriving row asserts (`not null`) wins; a column it does not assert keeps what the tombstone
-- held; and `metadata`, which carries a `'{}'` default and so can never be `null`, is MERGED
-- (`old || new`) rather than replaced, so no key is lost and every key the caller just named
-- is applied. `created_by`, `created_at` and `id` are never touched — a revive is not a
-- creation, and `iam._guard_governance_columns` calls rewriting `created_by` ownership
-- transfer for exactly that reason.
--
-- `origin` is the one column the revive deliberately leaves alone; the SET list says why.
--
-- ONE BEHAVIOUR THAT DOES NOT COME BACK, NAMED RATHER THAN DISCOVERED LATER:
-- `associations_propagate_plan_page_research_lineage` is AFTER **INSERT** only, so it does not
-- fire on a revive. It did not fire before this change either (the statement errored), so
-- nothing regresses — but a lineage that ought to be re-propagated on a relink is a separate,
-- named piece of work, not a silent gap.
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE HAZARD THIS FIX CARRIES, CLOSED IN THE SAME FILE (parts 2–4)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- A BEFORE INSERT trigger that returns NULL makes `INSERT … RETURNING` yield ZERO rows,
-- SILENTLY. Exactly three of the sixteen read the edge id straight off that statement —
-- `public.assoc_add`, `public.agent_resource_add`, `public.conversation_file_add` — and each
-- returns it to its caller. Left alone they would go from erroring to returning NULL, which is
-- the silent failure this platform forbids outright. The census is those three and no others:
-- it was taken by reading `prosrc` for all sixteen and looking for `returning` INSIDE the
-- associations INSERT statement itself, not anywhere in the body.
--
-- Each one now reads the edge back by its own key when the statement hands back nothing, and
-- RAISES if even that finds no row. Nothing returns NULL quietly.
--
-- Rehearsed on the branch (up → inverse → up, rule 27) before it was applied here.
-- Inverse: migrations/inverse/tails5_a_revive_is_an_update_of_the_tombstone_down.sql

set lock_timeout = '4s';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE PRIMITIVE
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function platform.revive_tombstoned_association()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
begin
  -- `platform.associations_unique` is a FULL unique index over the key, so there is at most
  -- ONE row per key in the whole table, live or tombstoned. This finds it or there is none.
  select a.id into v_id
    from platform.associations a
   where a.deleted_at is not null
     and a.source_type = new.source_type and a.source_id = new.source_id
     and a.target_type = new.target_type and a.target_id = new.target_id
     and a.role is not distinct from new.role
   limit 1;

  -- No tombstone: an ordinary insert, untouched. This is the overwhelming majority of the
  -- calls that reach this trigger and it must cost one indexed lookup and nothing else.
  if v_id is null then
    return new;
  end if;

  -- THE REVIVE IS THE UPDATE. The key columns are written although they are unchanged: the
  -- guards that key on `UPDATE OF source_type, target_type, role, organization_id, metadata,
  -- payload_kind` and on `UPDATE OF payload, payload_kind` fire only when their columns are
  -- in this SET list. See the header — dropping one from here disarms a guard silently.
  update platform.associations a
     set source_type       = new.source_type,
         source_id         = new.source_id,
         target_type       = new.target_type,
         target_id         = new.target_id,
         role              = new.role,
         organization_id   = coalesce(new.organization_id,   a.organization_id),
         label             = coalesce(new.label,             a.label),
         position          = coalesce(new.position,          a.position),
         payload_kind      = coalesce(new.payload_kind,      a.payload_kind),
         payload           = coalesce(new.payload,           a.payload),
         relation_field_id = coalesce(new.relation_field_id, a.relation_field_id),
         -- `origin` is DELIBERATELY not carried, and not read here at all. Where an edge CAME
         -- FROM is a fact about its creation, and a revive is not a creation — the office
         -- putting a customer back on a job did not make that link, it un-made its removal.
         -- Leaving it alone also keeps this body free of a column
         -- `migrations/inverse/w1_rel_the_relation_columns_down.sql` legitimately drops, which
         -- `pnpm check:inverses-leave-the-ground-standing` clause (d) exists to notice: an
         -- inverse must never have to choose between undoing its own lane and breaking a body
         -- somebody else adopted the column into.
         -- `metadata` is `not null default '{}'`, so `coalesce` can never choose the old row.
         -- Merged, so a caller that names nothing loses nothing and a caller that names a key
         -- gets it.
         metadata          = coalesce(a.metadata, '{}'::jsonb) || coalesce(new.metadata, '{}'::jsonb),
         -- THE ACT ITSELF.
         deleted_at        = null,
         deleted_via_type  = null,
         deleted_via_id    = null
   where a.id = v_id;

  -- NEVER A SECOND ROW IN THE SAME STATEMENT. The insert is skipped because the write it was
  -- going to make has already been made, in place, on the row that was always this edge.
  return null;
end
$function$;

comment on function platform.revive_tombstoned_association() is
  'BEFORE INSERT on platform.associations: when the edge already exists as a tombstone, revive '
  'that row IN PLACE with the arriving row''s values and skip the insert (return null). It '
  'never writes a second row, so an ON CONFLICT DO UPDATE upsert onto a tombstoned edge no '
  'longer dies 21000 "cannot affect row a second time" (TAILS-5, 2026-09-21). The revive''s '
  'UPDATE re-fires the relation contract, the payload validator and both surface-binding '
  'guards, which the skipped INSERT pass would otherwise have missed — which is why the key '
  'columns are in its SET list although they are unchanged.';

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. public.assoc_add — reads the edge back rather than returning NULL quietly
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assoc_add(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_org_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_role text DEFAULT NULL::text, p_position integer DEFAULT NULL::integer, p_payload_kind text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;
    v_id uuid;
    v_container_side text;
    v_container_type text;
    v_container_id uuid;
    v_org_from_fallback boolean := false;
    v_source_editor boolean;
    v_source_viewer boolean;
    v_target_editor boolean;
    v_target_viewer boolean;
begin
    if (select auth.uid()) is null then
        raise exception 'assoc_add: authenticated user required'
            using errcode = '42501';
    end if;

    if p_source_type = 'file' and p_target_type = 'conversation' then
        if p_role is not null or p_position is not null
           or p_payload_kind is not null or p_payload is not null then
            raise exception 'file -> conversation supports only the canonical role-less attachment edge'
                using errcode = '42501';
        end if;
        return public.conversation_file_add(
            p_target_id,
            p_source_id,
            p_label,
            coalesce(p_metadata, '{}'::jsonb),
            coalesce(p_metadata, '{}'::jsonb) ? 'resource_policy'
        );
    end if;

    select at.container_side
      into v_container_side
      from platform.association_types at
     where at.source_type = p_source_type
       and at.target_type = p_target_type
       and at.is_active;

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

    if v_container_side is distinct from 'none'
       and v_container_side is not null then
        if v_source_editor is not true or v_target_editor is not true then
            raise exception 'assoc_add: editor access to both endpoints is required for an access-conveying edge'
                using errcode = '42501';
        end if;

        if v_container_side = 'target' then
            v_container_type := p_target_type;
            v_container_id := p_target_id;
        elsif v_container_side = 'source' then
            v_container_type := p_source_type;
            v_container_id := p_source_id;
        else
            raise exception 'assoc_add: unsupported container_side %', v_container_side
                using errcode = '23514';
        end if;

        v_org := private.association_container_organization_id(
            v_container_type,
            v_container_id
        );
        if v_org is null then
            raise exception 'assoc_add: access-conveying container has no organization'
                using errcode = '23514';
        end if;
    else
        if coalesce((
            (v_source_editor and v_target_viewer)
            or (v_source_viewer and v_target_editor)
        ), false) is not true then
            raise exception 'assoc_add: non-conveying edges require editor access to one endpoint and viewer access to the other'
                using errcode = '42501';
        end if;

        -- Derive the edge org from a real endpoint. A caller-supplied org is
        -- only a fallback for registered endpoint types with no org column.
        v_org := private.association_container_organization_id(
            p_source_type,
            p_source_id
        );
        if v_org is null then
            v_org := private.association_container_organization_id(
                p_target_type,
                p_target_id
            );
        end if;
        if v_org is null then
            v_org := p_org_id;
            v_org_from_fallback := true;
        end if;
    end if;

    if v_org is null or (
        v_org_from_fallback and not iam.has_org_access(v_org)
    ) then
        raise exception
            'assoc_add: no org access (org=%, %/% -> %/% role=%)',
            v_org, p_source_type, p_source_id, p_target_type, p_target_id, p_role
            using errcode = '42501';
    end if;

    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, position, metadata, payload_kind, payload, created_by
    ) values (
        p_source_type, p_source_id, p_target_type, p_target_id, v_org,
        p_role, p_label, p_position, coalesce(p_metadata, '{}'::jsonb),
        p_payload_kind, p_payload, (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        position = coalesce(excluded.position, platform.associations.position),
        metadata = excluded.metadata,
        payload_kind = coalesce(
            excluded.payload_kind,
            platform.associations.payload_kind
        ),
        payload = case
            when excluded.payload_kind is not null then excluded.payload
            else platform.associations.payload
        end
    returning id into v_id;

    -- TAILS-5: RE-ADDING SOMETHING THAT WAS REMOVED HANDS BACK NO ROW, AND THAT IS NOT NULL.
    -- `trg_associations_revive_tombstone` revives the tombstoned edge IN PLACE and skips the
    -- insert, so this statement returns zero rows — correctly, because nothing was inserted.
    -- The edge exists and this reads it by the key it was just written under. Returning NULL
    -- here would be the silent failure the trigger fix was written to avoid.
    if v_id is null then
        select a.id into v_id
          from platform.associations a
         where a.source_type = p_source_type and a.source_id = p_source_id
           and a.target_type = p_target_type and a.target_id = p_target_id
           and a.role is not distinct from p_role
         limit 1;
    end if;
    if v_id is null then
        raise exception 'assoc_add: the edge %/% -> %/% (role %) was neither written nor found afterwards',
            p_source_type, p_source_id, p_target_type, p_target_id, coalesce(p_role, '<none>')
            using errcode = 'P0002',
                  hint = 'TAILS-5: this door never hands back a null id. If you are seeing this, the write was refused by something that did not raise.';
    end if;

    return v_id;
end
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. public.agent_resource_add — the same read-back
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.agent_resource_add(p_agent_id uuid, p_source_type text, p_source_id uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_add: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to agent required'
      using errcode = '42501';
  end if;

  if not iam.has_access(p_source_type, p_source_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to source resource required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from platform.association_types at
    where at.source_type = p_source_type
      and at.target_type = 'agent'
      and at.container_side = 'target'
      and at.is_active
  ) then
    raise exception 'agent_resource_add: unsupported resource type %', p_source_type
      using errcode = '23514';
  end if;

  select d.organization_id
    into v_org
    from agent.definition d
   where d.id = p_agent_id;

  if v_org is null then
    raise exception 'agent_resource_add: agent has no organization'
      using errcode = '23514';
  end if;

  insert into platform.associations (
    source_type,
    source_id,
    target_type,
    target_id,
    organization_id,
    role,
    label,
    metadata,
    created_by
  ) values (
    p_source_type,
    p_source_id,
    'agent',
    p_agent_id,
    v_org,
    'agent_resource',
    p_label,
    coalesce(p_metadata, '{}'::jsonb),
    (select auth.uid())
  )
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set
    label = coalesce(excluded.label, platform.associations.label),
    metadata = excluded.metadata
  returning id into v_id;

  -- TAILS-5: putting a resource back on an agent after it was taken off revives the
  -- tombstoned edge in place and inserts nothing, so this statement hands back no row. The
  -- edge exists; read it. See platform.revive_tombstoned_association().
  if v_id is null then
    select a.id into v_id
      from platform.associations a
     where a.source_type = p_source_type and a.source_id = p_source_id
       and a.target_type = 'agent' and a.target_id = p_agent_id
       and a.role = 'agent_resource'
     limit 1;
  end if;
  if v_id is null then
    raise exception 'agent_resource_add: the edge %/% -> agent/% was neither written nor found afterwards',
      p_source_type, p_source_id, p_agent_id
      using errcode = 'P0002',
            hint = 'TAILS-5: this door never hands back a null id.';
  end if;

  return v_id;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. public.conversation_file_add — the same read-back
-- ════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.conversation_file_add(p_conversation_id uuid, p_file_id uuid, p_label text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_replace_metadata boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_id uuid;
    v_org uuid;
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
    if (select auth.uid()) is null then
        raise exception 'conversation_file_add: authenticated user required'
            using errcode = '42501';
    end if;
    if jsonb_typeof(v_metadata) <> 'object' then
        raise exception 'conversation_file_add: metadata must be a JSON object'
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from files.files f
        where f.id = p_file_id and f.deleted_at is null
    ) then
        raise exception 'conversation_file_add: file is no longer available'
            using errcode = 'P0002';
    end if;
    if not iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level) then
        raise exception 'conversation_file_add: editor access to conversation required'
            using errcode = '42501';
    end if;
    if not iam.has_access('file', p_file_id, 'editor'::public.permission_level) then
        raise exception 'conversation_file_add: editor access to file required'
            using errcode = '42501';
    end if;
    select c.organization_id into v_org
    from chat.conversation c
    where c.id = p_conversation_id and c.deleted_at is null;
    if v_org is null then
        raise exception 'conversation_file_add: conversation has no organization'
            using errcode = '23514';
    end if;
    insert into platform.associations (
        source_type, source_id, target_type, target_id, organization_id,
        role, label, metadata, created_by
    ) values (
        'file', p_file_id, 'conversation', p_conversation_id, v_org,
        null, p_label, v_metadata || jsonb_build_object('file_id', p_file_id),
        (select auth.uid())
    )
    on conflict (source_type, source_id, target_type, target_id, role)
    do update set
        label = coalesce(excluded.label, platform.associations.label),
        metadata = case
            when p_replace_metadata then excluded.metadata
            else platform.associations.metadata
        end
    returning id into v_id;

    -- TAILS-5: re-attaching a file that was detached revives the tombstoned edge in place and
    -- inserts nothing, so this statement hands back no row. The edge exists; read it.
    -- On that path the trigger MERGES the metadata (old || new) rather than honouring
    -- p_replace_metadata, which is the least destructive of the two and is written down in
    -- platform.revive_tombstoned_association()'s own header.
    if v_id is null then
        select a.id into v_id
          from platform.associations a
         where a.source_type = 'file' and a.source_id = p_file_id
           and a.target_type = 'conversation' and a.target_id = p_conversation_id
           and a.role is null
         limit 1;
    end if;
    if v_id is null then
        raise exception 'conversation_file_add: the edge file/% -> conversation/% was neither written nor found afterwards',
            p_file_id, p_conversation_id
            using errcode = 'P0002',
                  hint = 'TAILS-5: this door never hands back a null id.';
    end if;

    return v_id;
end
$function$;

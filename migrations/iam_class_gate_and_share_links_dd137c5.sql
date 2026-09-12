-- iam_class_gate_and_share_links_dd137c5 — CHOKEPOINT 3's GATE, AND CHOKEPOINT 4 CLOSED
-- (DD-137c, step 5; VISIBILITY-BY-CLASS §3.4).
--
-- §3.4's whole point, in its own words: "a class that governs one RLS arm is defeated by any call
-- that changes who the owner is. The class is therefore enforced at four places." Chokepoints 1
-- (the generated policies) and 2 (the kernel) landed in DD-137b. This file is 3 and 4.
--
-- ═══ CHOKEPOINT 3 — ONE GATE, NOT A FIX PER FUNCTION ══════════════════════════════════════════
-- Measured live before writing this: **1,252** SECURITY DEFINER functions are executable by
-- `authenticated` or `anon`; **374** of them read a table classed `private` or `confidential`; and
-- exactly **one** consulted `iam.class_lanes` about it. A definer function's reads are not filtered
-- by RLS at all, so 374 functions currently decide, each in its own way, what a class means.
--
-- §3.4 says the repair is ONE gate, not 374 edits: `iam.assert_class_allows(p_token, p_action,
-- p_row_org)` — raising, audited on refusal, over the closed action set
-- `read | rewrite_owner | reparent | share_link | bulk_export`.
--
-- 🚨 WHAT THE GATE CAN AND CANNOT ANSWER, SAID OUT LOUD. Its three arguments are a TOKEN, an ACTION
-- and an ORGANIZATION. They do not include a row id, so it cannot and must not pretend to answer
-- "may this person read THIS row" — that is `iam.has_access`, the kernel, and it is a different
-- question. What this gate answers is the TYPE-level one that 374 functions are currently answering
-- by accident: *may a function running with borrowed rights do this KIND of thing to this token's
-- rows at all, without a per-row check?* A `read` that passes the gate still owes the caller an
-- `iam.has_access` per row when the class is private or confidential — and the gate REFUSES the
-- blanket read outright for those classes precisely so the per-row check cannot be skipped.
--
-- An action it does not know is REFUSED, never allowed. A token it does not know resolves to
-- `private` (chair R3: unset fails toward privacy). Every refusal writes `iam.access_audit` with
-- `granted = false` and the reason, because §3.4's own sentence about the emergency door applies
-- here too: the audit is the guarantee.
--
-- 🚨 AND THAT SENTENCE IS WHY THIS IS TWO FUNCTIONS AND NOT ONE. The first draft was a single
-- raising `assert_class_allows` that wrote the audit and then raised — and its own proof caught it:
-- **a caller that catches the exception discards the audit row with it.** PL/pgSQL's `EXCEPTION`
-- block is a subtransaction, so rolling back to its start undoes every write the failing call made,
-- the audit included. `public.create_share_link` catches by design (it returns
-- `{success:false,error}` rather than throwing at the browser), so the one caller wired here would
-- have refused silently, with a guarantee that quietly did not exist. Plain PL/pgSQL has no
-- autonomous transaction to work around it, so the SHAPE changes instead of the promise:
--
--   `iam.class_allows(token, action, org)`        -> boolean. Writes the audit on a refusal.
--                                                    For callers that must not throw.
--   `iam.assert_class_allows(token, action, org)` -> raises after it. For callers that let it fly.
--
-- A caller that both catches AND wants the audit uses the boolean one. That is written on the
-- raising function's own comment too, so the next person does not rediscover it the hard way.
--
-- ═══ CHOKEPOINT 4 — SHARE LINKS ═══════════════════════════════════════════════════════════════
-- §3.4: "`is_link_shareable` is DERIVED FROM THE CLASS (a `private` or `confidential` token cannot
-- be link-shared)". Measured live: **eight** registry rows said otherwise —
--   private:      conversation, dataset, structured_list, udt_document, workbook
--   confidential: interview_session, quiz_session, working_document
-- A share link is an anonymous, unauthenticated read of a row by URL. On a `private` token, whose
-- whole definition (§3.5) is "no standing read for anyone, our own staff included", that is the
-- widest possible read wearing the narrowest possible label. All eight carry **zero** active links,
-- so nothing in use breaks; the door simply stops being there.
--
-- The rule, stated once so it can be quoted: **A ROW CAN BE LINK-SHARED ONLY IF ITS TOKEN IS
-- CLASSED `organization` OR `public`.** It is derived, not declared — `is_link_shareable` is
-- computed from `data_class`, a trigger refuses a hand-set `true` that contradicts the class, and
-- both `create_share_link` (minting) and `resolve_share_token` (every single resolve, which it
-- already did) read the same derived answer. So a token reclassified to `private` next year turns
-- every existing link off at the next click, with no sweep and nobody remembering.
--
-- 🚨 WHAT THIS FILE DELIBERATELY DOES NOT DO, AND THE NUMBER THAT SAYS WHY. §3.4 also asks that
-- `create_share_link` refuse a ROW whose `visibility` is below `link`. Measured live first: of the
-- 305 active `file` share links, **280 are on rows whose visibility is `personal` or `internal`**.
-- Shipping that refusal today would not close a leak — the owner minted those links deliberately —
-- it would break the dominant share flow at the moment of creation, with no UI anywhere that offers
-- to raise a row's visibility first. It is left OUT, with the number, for the chair to sequence
-- alongside that UI. Existing links are unaffected either way; this is about minting new ones.

-- ═══════════════════════════════════════════════════════════════ 1. the gate (§3.4 chokepoint 3)
create or replace function iam.class_allows(
  p_token   text,
  p_action  text,
  p_row_org uuid default null
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_class text;
  v_ok    boolean;
  v_why   text;
  v_org   uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'assert_class_allows: no token. A gate asked about nothing answers nothing.'
      using errcode = '22023';
  end if;

  -- chair R3: a token nobody classified resolves to the strictest class, never the loosest.
  select et.data_class::text into v_class
    from platform.entity_types et
   where et.token = p_token and et.is_active;
  v_class := coalesce(v_class, 'private');

  case p_action
    -- A blanket read with borrowed rights. Allowed only where a standing read is what the class
    -- MEANS; on private/confidential the caller must ask the kernel per row instead.
    when 'read' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a definer function may not hand out '|| v_class ||' rows without a per-row '
               'iam.has_access check';
    -- Changing who owns a row, or which organization it belongs to, is how F-1 defeats a class:
    -- rewrite the owner and every lane follows. Never allowed on private or confidential.
    when 'rewrite_owner', 'reparent' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'the owner or home of a '|| v_class ||' row cannot be rewritten through a definer '
               'function — a class that survives only until somebody changes the owner is not a class';
    -- An anonymous read by URL.
    when 'share_link' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a '|| v_class ||' row cannot be shared by public link';
    -- Handing out many rows at once, with borrowed rights, is the same question at scale.
    when 'bulk_export' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a '|| v_class ||' token cannot be exported in bulk through a definer function';
    else
      -- NOT a silent pass. An action this gate has never heard of is refused by name, because a
      -- gate that shrugs at an unknown verb is a gate anybody can walk through by inventing one.
      v_ok := false;
      v_why := format('%L is not an action this gate knows (read, rewrite_owner, reparent, '
                      'share_link, bulk_export)', p_action);
  end case;

  if v_ok then return true; end if;

  -- THE AUDIT IS THE GUARANTEE (§3.5's sentence, and it applies to every refusal, not just doors).
  v_org := coalesce(p_row_org,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));
  begin
    insert into iam.access_audit(
      action, target_token, data_class, purpose, basis, is_emergency_door, granted,
      denial_reason, actor_user_id, organization_id, request_context)
    values (
      p_action, p_token, v_class, 'class_gate', 'definer_function', false, false,
      v_why, auth.uid(), v_org,
      jsonb_build_object('gate', 'iam.assert_class_allows', 'row_organization_id', p_row_org));
  exception when others then
    -- A refusal that cannot be recorded is still a refusal. It is never downgraded to a pass, and
    -- the failure to record says so in the same breath as the refusal itself.
    v_why := v_why || format(' [the refusal could not be audited: %s]', sqlerrm);
  end;

  -- The reason travels out in a place a caught exception cannot erase.
  perform set_config('iam.class_gate_last_reason', v_why, true);
  return false;
end
$function$;

comment on function iam.class_allows(text, text, uuid) is
  'DD-137c / VISIBILITY-BY-CLASS §3.4 chokepoint 3. THE type-level class gate for SECURITY DEFINER '
  'functions: may a function running with borrowed rights do this KIND of thing to this token at '
  'all? Returns false and writes iam.access_audit on refusal — the audit survives because this form '
  'does not raise. An unknown action and an unknown token both fail toward privacy. NOT a per-row '
  'check: that is iam.has_access, and a `read` that passes here still owes one per row.';

create or replace function iam.assert_class_allows(
  p_token   text,
  p_action  text,
  p_row_org uuid default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if iam.class_allows(p_token, p_action, p_row_org) then return; end if;
  raise exception 'Refused: %',
    coalesce(nullif(current_setting('iam.class_gate_last_reason', true), ''),
             format('the data class of %L does not allow %L', p_token, p_action))
    using errcode = '42501',
          detail  = format('token=%s action=%s', p_token, p_action),
          hint    = 'This is the data class of the table, not a permission you can be granted. '
                    'If the table is classed wrongly, that is a migration with an access delta '
                    'beside it (DD-137b), never a change made from a function.';
end
$function$;

comment on function iam.assert_class_allows(text, text, uuid) is
  'DD-137c / §3.4. The raising form of iam.class_allows, for callers that let the error fly. A '
  'caller that CATCHES this exception also discards the audit row it wrote, because PL/pgSQL '
  'EXCEPTION is a subtransaction. If you intend to catch, call iam.class_allows and return your own '
  'error.';

revoke all on function iam.class_allows(text, text, uuid) from public;
revoke all on function iam.assert_class_allows(text, text, uuid) from public;
-- Deliberately granted to NO client role: it is called from inside definer functions, which run as
-- their own owner. No `platform.client_callable_door` row, because there is no client door.

-- ══════════════════════════════════════════════ 2. link-shareability is DERIVED (§3.4 chokepoint 4)
create or replace function platform.entity_link_shareable(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  -- THE RULE: a row can be link-shared only if its token is classed `organization` or `public`.
  -- A token with no class of its own (a component: db-rules §6d-1 says its access IS its parent's)
  -- returns NULL — "this function has no opinion" — and the caller keeps what the registry says,
  -- because inventing an answer for a component is how a component gets a second owner.
  select case
           when et.data_class is null then null
           when et.data_class::text in ('organization', 'public') then true
           else false
         end
    from platform.entity_types et
   where et.token = p_token and et.is_active;
$function$;

comment on function platform.entity_link_shareable(text) is
  'DD-137c / §3.4 chokepoint 4. Whether the CLASS PERMITS this token''s rows to be shared by '
  'anonymous public link. A ceiling, never a requirement: false forbids it, true only allows the '
  'registry to say yes, and NULL means "no opinion" (a component inherits its parent''s access and '
  'has no class of its own).';

-- ── the backfill, with the sentence it would have to break named before it runs ────────────────
do $$
declare r record; v_flipped int := 0; v_names text := '';
begin
  for r in
    select s.resource_type, et.token, et.data_class::text as cls,
           (select count(*) from platform.share_links sl
             where sl.resource_type = s.resource_type and sl.is_active) as live
      from platform.shareable_resource_registry s
      join platform.entity_types et
        on et.schema_name = s.schema_name and et.table_name = s.table_name and et.is_active
     where s.is_active
       and s.is_link_shareable is true
       and platform.entity_link_shareable(et.token) is false
  loop
    if r.live > 0 then
      raise exception 'dd137c5: % (% / class %) has % ACTIVE share link(s). Turning link sharing '
                      'off for it would break a link somebody is using, which is a product '
                      'decision and not this migration''s to take silently. Revoke or migrate them '
                      'first.', r.resource_type, r.token, r.cls, r.live;
    end if;
    update platform.shareable_resource_registry
       set is_link_shareable = false, updated_at = now()
     where resource_type = r.resource_type;
    v_flipped := v_flipped + 1;
    v_names := v_names || format('%s (%s), ', r.resource_type, r.cls);
  end loop;
  raise notice 'dd137c5: link sharing turned off on % token(s): %', v_flipped, v_names;
end $$;

-- ── and it cannot come back by hand ───────────────────────────────────────────────────────────
create or replace function platform._share_registry_class_interlock()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_allowed boolean; v_class text;
begin
  if new.is_link_shareable is not true then return new; end if;
  select platform.entity_link_shareable(et.token), et.data_class::text
    into v_allowed, v_class
    from platform.entity_types et
   where et.schema_name = new.schema_name and et.table_name = new.table_name and et.is_active;
  if v_allowed is false then
    raise exception 'Refused: %.% is classed % — a private or confidential token cannot be '
                    'link-shared (VISIBILITY-BY-CLASS §3.4).', new.schema_name, new.table_name, v_class
      using errcode = '42501',
            hint = 'Link sharing follows the data class. To change it, reclassify the table in a '
                   'migration with an access delta beside it (DD-137b) — not by flipping this flag.';
  end if;
  return new;
end
$function$;

drop trigger if exists share_registry_class_interlock on platform.shareable_resource_registry;
create trigger share_registry_class_interlock
  before insert or update of is_link_shareable, schema_name, table_name
  on platform.shareable_resource_registry
  for each row execute function platform._share_registry_class_interlock();

-- ── minting asks the gate, by name ────────────────────────────────────────────────────────────
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_share_link';
  if v_def is null then raise exception 'dd137c5: public.create_share_link does not exist'; end if;

  v_new := replace(v_def,
    E'  IF NOT v_shareable THEN RETURN jsonb_build_object(''success'', false, ''error'', ''Public link sharing is not enabled for this item type''); END IF;',
    E'  IF NOT v_shareable THEN RETURN jsonb_build_object(''success'', false, ''error'', ''Public link sharing is not enabled for this item type''); END IF;\n'
    '  -- DD-137c / §3.4 chokepoint 3: the registry flag is derived from the class, and the gate is\n'
    '  -- asked anyway, because a refusal that is only a boolean leaves no row anybody can read\n'
    '  -- tomorrow. The BOOLEAN form is used on purpose: this function catches everything and\n'
    '  -- returns {success:false}, and catching a RAISE would roll the audit row back with it.\n'
    '  IF NOT iam.class_allows(\n'
    '       (SELECT et.token FROM platform.entity_types et\n'
    '         WHERE et.schema_name = v_resolved.schema_name AND et.table_name = v_resolved.table_name\n'
    '           AND et.is_active LIMIT 1),\n'
    '       ''share_link'', NULL) THEN\n'
    '    RETURN jsonb_build_object(''success'', false, ''error'',\n'
    '      coalesce(nullif(current_setting(''iam.class_gate_last_reason'', true), ''''),\n'
    '               ''This kind of item cannot be shared by public link.''));\n'
    '  END IF;');
  if v_new = v_def then
    raise exception 'dd137c5: create_share_link no longer contains the is_link_shareable refusal '
                    'this file patches — it changed underneath and must be re-read, never patched blind.';
  end if;
  execute v_new;
end $$;

-- ═══════════════════════════════════════════════════════════════════ PROOF — live, and rolled back
do $$
declare
  v_private_type text; v_org_type text;
  v_err text; v_res jsonb; v_n int;
begin
  -- (a) THE GATE REFUSES AND AUDITS, AND THE AUDIT ROW SURVIVES. A private token cannot be
  --     link-shared, and the refusal lands in iam.access_audit as a row somebody can read tomorrow.
  select count(*) into v_n from iam.access_audit where purpose = 'class_gate';
  if iam.class_allows('conversation', 'share_link', null) then
    raise exception 'dd137c5: the gate ALLOWED share_link on `conversation`, which is classed '
                    'private. It does not hold.';
  end if;
  if (select count(*) from iam.access_audit where purpose = 'class_gate') <> v_n + 1 then
    raise exception 'dd137c5: the gate refused but wrote no audit row. The audit is the guarantee.';
  end if;

  -- (a2) AND THE RAISING FORM RAISES.
  begin
    perform iam.assert_class_allows('conversation', 'share_link', null);
    raise exception 'dd137c5: assert_class_allows did not raise on a refused action';
  exception when insufficient_privilege then null; end;

  -- (b) AND IT ALLOWS WHAT THE CLASS ALLOWS — a gate that refuses everything proves nothing.
  if not iam.class_allows('note', 'share_link', null) then
    raise exception 'dd137c5: the gate refused share_link on `note`, which is classed organization';
  end if;
  perform iam.assert_class_allows('agent', 'read', null);

  -- (c) AN UNKNOWN ACTION AND AN UNKNOWN TOKEN BOTH FAIL TOWARD PRIVACY.
  if iam.class_allows('note', 'teleport', null) then
    raise exception 'dd137c5: the gate allowed an action it has never heard of';
  end if;
  if iam.class_allows('__no_such_token__', 'read', null) then
    raise exception 'dd137c5: an unclassified token resolved to something readable';
  end if;

  -- (d) NO REGISTRY ROW CLAIMS LINK SHARING THE CLASS FORBIDS.
  --     🚨 A CEILING, NOT AN EQUALITY, and the difference matters: the class only ever FORBIDS. An
  --     `organization` token with `is_link_shareable = false` is a deliberate product choice (a CRM
  --     deal, a rulebook, a sending identity), and deriving that flag to `true` because the class
  --     permits it would switch link sharing ON for 29 things nobody asked to share. The first
  --     draft of this assertion did exactly that and this proof caught it.
  select count(*) into v_n
    from platform.shareable_resource_registry s
    join platform.entity_types et
      on et.schema_name = s.schema_name and et.table_name = s.table_name and et.is_active
   where s.is_active
     and s.is_link_shareable is true
     and platform.entity_link_shareable(et.token) is false;
  if v_n <> 0 then
    raise exception 'dd137c5: % shareable-registry row(s) still claim link sharing their data class '
                    'forbids', v_n;
  end if;

  -- (e) THE INTERLOCK REFUSES A HAND-SET TRUE — proven by trying it, not by reading the trigger.
  begin
    update platform.shareable_resource_registry
       set is_link_shareable = true
     where resource_type = 'conversation';
    raise exception 'dd137c5: link sharing was switched back on for a private token by hand';
  exception when insufficient_privilege then null; end;

  -- (f) AND MINTING REFUSES THROUGH THE REAL RPC, as a real person, with a real row.
  --     The private token is `conversation`; a row is chosen from the caller's own so nothing about
  --     this proof depends on somebody else's data existing.
  declare
    v_uid uuid; v_conv uuid;
  begin
    select c.created_by, c.id into v_uid, v_conv
      from chat.conversation c where c.deleted_at is null limit 1;
    if v_conv is null then
      raise exception 'dd137c5: no conversation exists, so the minting half cannot be measured. It '
                      'is refused rather than assumed.';
    end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_res := public.create_share_link('conversation', v_conv);
    execute 'reset role';
    if coalesce((v_res->>'success')::boolean, false) then
      raise exception 'dd137c5: create_share_link MINTED a link for a private conversation: %', v_res;
    end if;
    raise notice 'dd137c5 PROVEN: minting a link on a private conversation is refused with "%"',
                 v_res->>'error';
  end;
exception when others then
  begin execute 'reset role'; exception when others then null; end;
  raise;
end $$;

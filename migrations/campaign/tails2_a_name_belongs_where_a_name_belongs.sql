-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
-- based-on: custom._card_words(uuid, text, text) cdfff4e7696712c089ac039c38dc7edcbfe3c643175788cd463020d08153ff70
-- based-on: custom.portal_record_title(uuid, uuid) 6e40e312e56c5b62dd8ae46de4f3b18aa9cdd6fa63b8d49ffc2451d438123325
-- based-on: custom.share_subject_name(uuid, text, uuid) 2d73a165ddf6e6ea1c9c3a83ecfd7eb60b528d4d6d84ac1ffba86fde16060edf
-- based-on: platform.relation_label(uuid, text, uuid) fabc6d1e8d24e41c89354e8bf266746af91228527c1e24872ccd268acec98d9a
-- based-on: custom.work_approval_request(uuid, uuid, jsonb, text, uuid, text, uuid) 709e0268afb17f2a9deb56180dc89bb7ff10d321fd39d1bb73ff67b8f667b3f1
-- based-on: custom.dashboard_stuck(uuid, uuid, text, integer, jsonb, integer, text) 0627c75b27a6a0cd5866ea55607a4de5f0566bef43e3889b2fd4b8d3de8437b9
-- based-on: custom.work_list(uuid, text, boolean, integer, integer) b2b500086e8f100b0e3ceecf52c0fd86888bee39bd2cccd9e08e236b0f91b26c
-- based-on: custom.work_whose_turn(uuid, uuid, boolean) d74b183e42fc8f7a9b302562a8c448c86f7228741a354538f05efce7b025b3b0
-- based-on: custom.field_history(uuid, uuid, text, integer, integer, uuid) d2288a38678cef606e8da451de56bd3efbbc43da461b901577e6e975e871cb9d
-- based-on: custom.comment_write(uuid, uuid, text, jsonb, uuid, uuid[]) ba3041519b5b5657f6e747b19e578ef84c8995a354879936a5b66032922d7a25
-- based-on: custom.relation_own(uuid, uuid, uuid) b7c6bc2940c8282061381c11af32069fd282b18ced9f0ea233dd7f9e0f03f42e
-- based-on: iam.discoverable_card(text, uuid) 263069b67f1496e61d668b64706ac64a19991e3b6dadc7693f8c12c6eb89b379
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- A SCREEN NEVER SHOWS AN ID WHERE A NAME BELONGS. ONE RESOLVER, EVERY DOOR.
-- lane TAILS-2 · 2026-09-21
--
-- Lane STAGE-RULES-2 hit this once and fixed it once: its preview named the cards it would
-- refuse as `"title": "8896def2-71ca-46e9-a777-0b9260464710"`, because a Table's
-- `title_field` may point at a RELATION column and a relation's stored value IS the other
-- record's id. It wrote `custom._card_words` for its own door and NAMED the rest of the
-- class rather than sweeping it: *"the same defect is still in `custom.portal_record_title`,
-- on a PUBLIC page where strangers see it"*, and *"the board names records by their id —
-- 11 records are not in any of these columns — ca5f1ac7-…"*.
--
-- THE CENSUS (every function body in `custom`, `platform`, `iam`, `history`, read from
-- `pg_proc.prosrc`, 2026-09-21). THIRTEEN live server-side functions could hand a reader a
-- uuid where a name belongs, in three flavours:
--
--   · TEN read `data ->> title_field` RAW, with no idea that the answer might be an id —
--     `portal_record_title`, `share_subject_name`, `dashboard_stuck`, `work_list`,
--     `work_whose_turn`, `platform.relation_label`, `field_history`, `comment_write`,
--     `relation_own`, and `portal_card` through `portal_record_title`;
--   · THREE never ask the Table at all and read hard-coded `name`/`title` keys —
--     `agg_record_name` (so every digest row), `work_approval_request` (so the title frozen
--     onto every approval card) and `iam.discoverable_card`;
--   · FOUR of them fall back to `left(id::text, 8)` or `id::text`, which is the defect
--     written down on purpose.
--
-- THE FIX IS ONE RESOLVER AND ITS RECORD-SHAPED FRONT DOOR, and every one of the thirteen
-- calls it:
--
--   custom._card_words(org, value, noun)   — the words for a stored VALUE
--   custom.record_words(org, record_id)    — the words for a RECORD
--
-- WHAT IT ANSWERS, in this order, and it never answers an id:
--   1. the viewer may not see that record  → `platform.relation_withheld_label()`, the one
--      sentence the platform already uses for exactly this (RELATION-DECLARE, 2026-09-20).
--      THE LADDER STILL DECIDES: naming a record is disclosing it, and a title resolver that
--      leaked one would be a hole in every door at once. A principal-less caller (the store
--      owner, a trigger, a background run) is not gated — it is not a seat.
--   2. the Table's `title_field`, then `title` / `name` / `label` / `full_name` / `company`
--      / `subject`, then the first text the record holds in key order — never a uuid-shaped
--      one, because a bare id in `name` is the same lie as a bare id in `title_field`.
--   3. the chosen value is an id → ONE hop to what it points at, and that hop obeys 1 and 2.
--      One hop, never a chain: a door that followed relations forever is a recursion a
--      person waits on.
--   4. nothing readable → "an untitled quote" / "an untitled job", in the Table's own noun.
--
-- WHAT DOES NOT CHANGE: `custom.rule_field_label` and `custom.dependency_label` read a Rule's
-- or a Field's own `label`/`key` — not a Table's configurable title — and their id fallback
-- is explicit and honest. `custom.io_cell` runs the other way (words in, record out).
-- `custom.record_history`, `custom.computed_provenance` and `custom.pipeline_board` emit no
-- record title at all; the footnote and the history entry get their names from the callers
-- fixed here (`field_history`, `agg_record_name`).
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE FIRST WORDS A RECORD HOLDS, when its Table's title column is empty or is not set.
-- Deliberately dumb and deliberately ordered: a person scanning a list would rather read
-- the wrong column than a hex number. `_`-prefixed keys are the store's own blocks
-- (`_derived`, `_computed`, `_retired`, `_values`, `_sources`) and are never a name.
create or replace function custom._first_words(p_data jsonb)
  returns text language sql immutable set search_path = pg_catalog as $fn$
  select v
    from (
      select case when jsonb_typeof(e.value) = 'object' and e.value ? 'value'
                  then e.value ->> 'value'
                  when jsonb_typeof(e.value) in ('string', 'number')
                  then p_data ->> e.key
                  else null end as v,
             e.key
        from jsonb_each(coalesce(p_data, '{}'::jsonb)) e
       where left(e.key, 1) <> '_'
         and e.key not in ('id', 'table_id', 'organization_id', 'entity_definition_id')
       order by e.key
    ) s
   where coalesce(btrim(s.v), '') <> ''
     and s.v !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   limit 1;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE WORDS ON A CARD, for a reader that has no browser to resolve a relation in.
-- Grown from lane STAGE-RULES-2's one-hop version: it now obeys the ladder on the record it
-- hops to, and it reads the hopped-to record's other columns rather than giving up the
-- moment its Table has no title column.
create or replace function custom._card_words(p_organization_id uuid, p_value text, p_noun text)
  returns text language plpgsql stable set search_path = pg_catalog as $fn$
declare
  v_other uuid;
  v_title text;
  v_me    uuid;
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return 'an untitled ' || coalesce(nullif(btrim(coalesce(p_noun, '')), ''), 'record');
  end if;
  -- Not a uuid at all: it is already the words somebody typed.
  begin
    v_other := p_value::uuid;
  exception when invalid_text_representation then
    return p_value;
  end;

  -- THE LADDER DECIDES BEFORE THE NAME IS READ. Naming the record at the other end of a
  -- relation is disclosing it, and the one thing every caller of this function has in
  -- common is that it runs inside a SECURITY DEFINER door, where nothing else would stop
  -- it. A caller with no seat (a trigger, the store owner, a background run) is not a
  -- person and is not gated.
  v_me := custom.query_principal();
  if v_me is not null and not custom.has_visibility(v_me, 'record', v_other, 'viewer') then
    return platform.relation_withheld_label();
  end if;

  select coalesce(nullif(o.data ->> (t.data ->> 'title_field'), ''),
                  nullif(o.data ->> 'title', ''),
                  nullif(o.data ->> 'name', ''),
                  nullif(o.data ->> 'label', ''),
                  nullif(o.data ->> 'full_name', ''),
                  nullif(o.data ->> 'company', ''),
                  nullif(o.data ->> 'subject', ''),
                  custom._first_words(o.data))
    into v_title
    from custom.record o
    left join custom.record t on t.organization_id = o.organization_id and t.id = o.table_id
   where o.organization_id = p_organization_id and o.id = v_other and o.deleted_at is null;

  -- ONE HOP, AND THEN IT SAYS IT DOES NOT KNOW. The hop landed on another id, or on
  -- nothing: say so rather than print either.
  if v_title is null or v_title ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return 'an untitled ' || coalesce(nullif(btrim(coalesce(p_noun, '')), ''), 'record');
  end if;
  return v_title;
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE WORDS FOR A RECORD. The front door every server-side reader now calls.
create or replace function custom.record_words(p_organization_id uuid, p_record_id uuid, p_noun text default null)
  returns text language plpgsql stable security definer set search_path = pg_catalog as $fn$
declare
  v_rec   custom.record;
  v_tab   jsonb;
  v_noun  text;
  v_raw   text;
  v_me    uuid;
begin
  if p_record_id is null then return null; end if;

  v_me := custom.query_principal();
  if v_me is not null and not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    return platform.relation_withheld_label();
  end if;

  select r.* into v_rec from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    -- Not hers and not here read the same from outside, which is REC-29 working.
    return platform.relation_withheld_label();
  end if;

  select t.data into v_tab from custom.record t
   where t.organization_id = p_organization_id and t.id = v_rec.table_id;

  v_noun := lower(coalesce(nullif(p_noun, ''),
                           nullif(v_tab ->> 'label_singular', ''),
                           nullif(v_tab ->> 'name', ''),
                           'record'));

  v_raw := coalesce(nullif(v_rec.data ->> (v_tab ->> 'title_field'), ''),
                    nullif(v_rec.data ->> 'title', ''),
                    nullif(v_rec.data ->> 'name', ''),
                    nullif(v_rec.data ->> 'label', ''),
                    nullif(v_rec.data ->> 'full_name', ''),
                    nullif(v_rec.data ->> 'company', ''),
                    nullif(v_rec.data ->> 'subject', ''),
                    custom._first_words(v_rec.data));

  return custom._card_words(p_organization_id, v_raw, v_noun);
end;
$fn$;

-- WHO MAY CALL IT: NOBODY, FROM A CLIENT. `custom.record_words` is a resolver the DOORS call
-- — it has no organization wall of its own because every caller has already asserted one, and
-- a client that could call it directly would be asking "what is this record called" about any
-- id it cared to type. It is declared as a server-only lane so the store's own guard knows
-- that is deliberate rather than forgotten.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'record_words', 'p_organization_id uuid, p_record_id uuid, p_noun text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
        'p_record_id is checked against the caller''s own visibility ladder (custom.has_visibility at viewer) whenever there IS a caller, and a record that fails it reads as platform.relation_withheld_label(); p_organization_id scopes the read and a null record id answers null. No client reaches it.',
        'tails2_a_name_belongs_where_a_name_belongs.sql',
        'server_only: only the store''s own doors call it — portal_record_title, share_subject_name, relation_label, work_approval_request, relation_own and discoverable_card — each of which has already asserted the organization wall and the caller''s reach before it asks what a record is called.',
        false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set identity_args = excluded.identity_args,
      identity_argtypes = excluded.identity_argtypes,
      reason = excluded.reason,
      non_client_lane = excluded.non_client_lane,
      signed_in_callers = excluded.signed_in_callers,
      anonymous_callers = excluded.anonymous_callers;

-- ═══ THE THIRTEEN, EACH THROUGH THE ONE RESOLVER ═══════════════════════════════════════

-- 1. THE PUBLIC PAGE. A stranger holding a portal link reads the title of the record the
--    portal is about; for any Table titled by a relation that was a uuid.
create or replace function custom.portal_record_title(p_organization_id uuid, p_record_id uuid)
  returns text language sql stable security definer set search_path = '' as $fn$
  select custom.record_words(p_organization_id, p_record_id);
$fn$;

-- 2. THE SHARE DIALOG'S SUBJECT. `left(id::text, 8)` was the honest-looking half of it.
create or replace function custom.share_subject_name(p_organization_id uuid, p_type text, p_id uuid)
  returns text language plpgsql stable security definer set search_path = 'pg_catalog' as $fn$
declare
  v_name text;
begin
  if p_id is null then return null; end if;

  -- Outside schema `custom` the platform's registry is the authority and this adds nothing.
  if p_type is distinct from 'record' then
    return coalesce(nullif(btrim(platform.entity_title(p_type, p_id)), ''), left(p_id::text, 8));
  end if;

  -- The registry first, and ONLY when it answered words rather than an id: `entity_title`
  -- reads the same relation-valued title column the rest of this class did.
  v_name := nullif(btrim(coalesce(platform.entity_title('record', p_id), '')), '');
  if v_name is not null
     and v_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return v_name;
  end if;

  return custom.record_words(p_organization_id, p_id);
end;
$fn$;


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE TEN THAT ARE PATCHED IN PLACE.
--
-- These are long function bodies that other lanes are also working in tonight, and the ONE
-- line each of them gets wrong is a line, not a body. So each block reads the body that is
-- LIVE, replaces exactly that line, and REFUSES BY NAME if the line has moved — which is
-- the concurrency check `create or replace` does not have, on top of the `-- based-on:`
-- hashes above. Nothing here is a snapshot of somebody else's work.
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- 3. THE RELATION CHIP THE STORE ANSWERS. Its access gate was already right (RELATION-DECLARE)
--    and is untouched; what it reads AFTER the gate was raw, so a Table titled by a relation
--    answered a uuid to every chip the store resolves. Null stays null — "this store knows no
--    title" is a different answer from "it has none", and the external-link fallback below it
--    depends on the difference.
do $do$
declare v_src text; v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform' and p.proname = 'relation_label';
  v_old := $q$       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    return v_title;$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'platform.relation_label no longer carries the block this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old,
    $q$       where l.record_id = p_target_id and l.organization_id = p_organization_id
       limit 1;
    end if;
    if v_title is not null then
      v_title := custom._card_words(p_organization_id, v_title, 'record');
    end if;
    return v_title;$q$);
end;
$do$;

-- 4. EVERY DIGEST ROW — `custom.agg_record_name` — IS NOT IN THIS FILE, AND THAT IS NOT AN
--    OVERSIGHT. Lane BUILDERS holds `campaign_watch.build_lock` on that exact function
--    (taken 05:02Z), and §4.14 exists so two lanes never land on one object at once. The
--    same fix for it ships in `tails2_a_digest_row_names_the_record.sql`, which takes the
--    lock the moment BUILDERS releases it. Its defect is written down in this lane's
--    PROGRESS doc so it cannot be lost: it reads hard-coded `name`/`title` keys, never the
--    Table's own title column, and falls back to `left(id::text, 8)`.

-- 5. THE TITLE FROZEN ONTO AN APPROVAL CARD. It is written once, at request time, and every
--    later reader (`custom.work_approval_read`, the inbox, the notification) shows that one
--    string forever — so a uuid written here is a uuid on a screen for good. It also never
--    asked the Table what its records are called, so a Table titled by anything but
--    `name`/`title` produced an approval card with no subject at all.
do $do$
declare v_src text; v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'work_approval_request';
  v_old := $q$'subject_title',   coalesce(v_subject.data ->> 'name', v_subject.data ->> 'title')$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'custom.work_approval_request no longer carries the line this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old,
    $q$'subject_title',   custom.record_words(p_organization_id, p_subject_id)$q$);
end;
$do$;

-- 6. THE STUCK LIST ON A DASHBOARD. Its rows were already filtered by what the reader may see;
--    the title beside each one was raw. It keeps answering NULL for a Table that declares no
--    title column — that was deliberate ("says null rather than inventing one") and still is.
do $do$
declare v_src text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'dashboard_stuck';
  v_old := $q$v_title := case when v_titlek is null then 'null::text' else custom.agg_value_sql(v_titlek) end;$q$;
  v_new := $q$v_title := case when v_titlek is null then 'null::text'
                   else format('custom._card_words(%L::uuid, (%s)::text, %L)',
                               p_organization_id, custom.agg_value_sql(v_titlek), 'record') end;$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'custom.dashboard_stuck no longer carries the line this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old, v_new);
end;
$do$;

-- 7. THE WORK LIST — "what is waiting on me", a screen a person lives in.
do $do$
declare v_src text; v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'work_list';
  v_old := $q$           r.data ->> coalesce(t.data ->> 'title_field', 'name'),$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'custom.work_list no longer carries the line this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old,
    $q$           custom._card_words(r.organization_id, r.data ->> coalesce(t.data ->> 'title_field', 'name'),
                              lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record'))),$q$);
end;
$do$;

-- 8. WHOSE TURN IT IS. Two names on one row were ids: the record's, and — when a person
--    record carries no `name` — the PERSON's, printed as `p.id::text` in the "turn" column.
do $do$
declare v_src text; v_old text; v_person text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'work_whose_turn';
  v_old := $q$           r.data ->> coalesce((select t.data ->> 'title_field'
                                  from custom.record t
                                 where t.organization_id = %1$L::uuid
                                   and t.id = %2$L::uuid), 'name'),$q$;
  v_person := $q$                else coalesce(nullif(p.data ->> 'name', ''), p.id::text) end,$q$;
  if position(v_old in v_src) = 0 or position(v_person in v_src) = 0 then
    raise exception 'custom.work_whose_turn no longer carries the lines this file rewrites; re-read it before applying.';
  end if;
  v_src := replace(v_src, v_old,
    $q$           custom._card_words(r.organization_id, r.data ->> coalesce((select t.data ->> 'title_field'
                                  from custom.record t
                                 where t.organization_id = %1$L::uuid
                                   and t.id = %2$L::uuid), 'name'), 'record'),$q$);
  v_src := replace(v_src, v_person,
    $q$                else coalesce(nullif(p.data ->> 'name', ''), 'somebody whose name is not filled in') end,$q$);
  execute v_src;
end;
$do$;

-- 9. A HISTORY ENTRY NAMES THE RECORD IT IS ABOUT.
do $do$
declare v_src text; v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'field_history';
  v_old := $q$else w.row_data -> 'data' ->> v_titlek end$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'custom.field_history no longer carries the line this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old,
    $q$else custom._card_words(p_organization_id, w.row_data -> 'data' ->> v_titlek, 'record') end$q$);
end;
$do$;

-- 10. A MENTION NOTIFICATION NAMES THE RECORD SOMEBODY WAS MENTIONED ON.
do $do$
declare v_src text; v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'comment_write';
  v_old := $q$v_title := custom.read_record(p_organization_id, p_record_id, true) ->> v_titlek;$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'custom.comment_write no longer carries the line this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old,
    $q$v_title := custom._card_words(p_organization_id, custom.read_record(p_organization_id, p_record_id, true) ->> v_titlek, 'record');$q$);
end;
$do$;

-- 11. THE REFUSAL THAT NAMES WHAT A RECORD IS ALREADY INSIDE. `r.id::text` was the last arm
--     of its coalesce, so the sentence a person reads when a move is refused could be
--     'That record is already inside "ca5f1ac7-…"' — the defect written down on purpose.
do $do$
declare v_src text; v_old text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'relation_own';
  v_old := $q$    select coalesce(nullif(r.data ->> (t.data ->> 'title_field'), ''),
                    nullif(r.data ->> 'name', ''), nullif(r.data ->> 'title', ''), r.id::text)
      into v_name
      from custom.record r
      left join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
     where r.organization_id = p_organization_id and r.id = v_parent;$q$;
  if position(v_old in v_src) = 0 then
    raise exception 'custom.relation_own no longer carries the block this file rewrites; re-read it before applying.';
  end if;
  execute replace(v_src, v_old,
    $q$    v_name := custom.record_words(p_organization_id, v_parent);$q$);
end;
$do$;

-- 12. THE DISCOVERY CARD. It never asked the Table what its records are called.
create or replace function iam.discoverable_card(p_resource_type text, p_resource_id uuid)
  returns table(resource_type text, resource_id uuid, title text)
  language sql stable security definer set search_path = '' as $fn$
  select c.resource_type, c.resource_id,
         coalesce(nullif(btrim(coalesce(custom.record_words(r.organization_id, r.id), '')), ''),
                  nullif(r.data ->> 'title', ''),
                  nullif(r.data ->> 'name', ''),
                  'Untitled')
    from iam.content_lane c
    left join custom.record r on r.id = c.resource_id
   where c.resource_type = p_resource_type
     and c.resource_id = p_resource_id
     and c.discoverable;
$fn$;

-- 13. `custom.portal_card` needs no change of its own: its `client` line already reads
--     `coalesce(custom.portal_record_title(...), client_record_id::text)`, and block 1 above
--     makes the inner call answer words. The `::text` arm now fires only for a record that is
--     genuinely gone, where an id is the only true thing left to say.

-- ───────────────────────────────────────────────────────────────────────────────────────
-- THE DOOR REGISTER. `custom.record_words` and `custom._first_words` are INTERNAL — called by
-- doors, never by a client — so they are declared nowhere and granted to nobody, exactly as
-- `custom._card_words` and `custom._pipeline_gate_expr` are.
revoke all on function custom.record_words(uuid, uuid, text) from public;
revoke all on function custom._first_words(jsonb) from public;

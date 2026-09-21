-- lane: ARGS-RULED
--
-- chair-step: it REPLACES the live bodies of four client doors in schema `custom`. Nothing is
--   dropped, nothing is revoked, no row of anybody's data is touched. The inverse is
--   migrations/inverse/argsruled_four_arguments_in_the_store_down.sql.
--
-- based-on: custom.read_record(uuid, uuid, boolean) 6705e1e5f1ff459f6d606b2b068fcb629f44af47b42685871f433f62d9431766
-- based-on: custom.anon_token_issue(uuid, text, jsonb, uuid, uuid, uuid, timestamp with time zone) 0b0d17c9d7d0fd606be4ab7956e7552a2d1bde4ca9a42d7017b42cbe92cff286
-- based-on: custom.doc_sign(uuid, uuid, text, text, uuid) 4078e12456337f3539d1e63341e4dfc86d467f508245c1ec17dab9613ebcc7bf
-- based-on: custom.agent_table_claim(uuid, uuid, uuid) 2d5c76ee3a42169272afe928cfcf76e9a9e27373d65fe696cb02016398aacd0c
--
-- ARGS-RULED — FOUR ARGUMENTS IN THE STORE, AND THE ONE THAT WAS DOOR-1 ITSELF.
--
-- 1 — `custom.read_record(p_organization_id)`. THE ONE READ DOOR MADE NO MEMBERSHIP DECISION
--     ABOUT THE ORGANIZATION IT WAS HANDED, and it raised `02000 there is no record % in this
--     organization` BEFORE asking `custom.has_visibility`. So the two answers differed: a caller
--     who guessed a record uuid learned whether it existed in that organization (02000) or not
--     (42501). One bit per guess, out of the door every screen, export and agent in this store
--     reads through. REC-29 is the store's own rule — "organizations are hard walls, and a door
--     decides who may reach one before it decides anything else" — and every other door obeys it.
--     Now: the wall, then the ladder, then existence. `custom.has_visibility` answers false for an
--     id that is not there, so a record you may not open and a record that is not there give the
--     same sentence, and the 02000 is reached only by somebody the ladder has already admitted —
--     which is what makes it useful to them ("it was deleted") and silent to everybody else.
--
-- 2 — `custom.anon_token_issue(p_saved_view_id)`. This door mints a token that grants ANONYMOUS
--     reads. Its `p_record_id` arm has asked `admin` on the record since the day it was written;
--     the saved view beside it was written into `custom.anon_token` with nothing asked at all, so
--     a member could publish a saved view they do not hold. Same ladder, same level.
--
-- 3 — `custom.doc_sign(p_signer_user_id)`. The account written onto a SIGNATURE. Nothing compared
--     it to the caller, so somebody with editor on the record could seal a document version in
--     another person's name. NULL stays legal and keeps the meaning `custom.doc_signature_write`
--     already declares for it — "an outside signer with no account of ours".
--
-- 4 — `custom.agent_table_claim(p_conversation)`. The conversation id is what buys a table its
--     exemption from this organization's agent-approval knob (`custom.agent_change_approval`
--     matches on it), and it was written in unasked, so a table could be claimed for somebody
--     else's conversation. It takes the platform kernel's own question for a conversation.
--
-- AND ONE THIS LANE SUSPECTED AND CLEARED BY READING: `custom.comment_write(p_mentions)` was
-- ALREADY right. Every mention is put through `custom.history_people(organization, ids)` — this
-- organization's own people — AND `custom.has_visibility(that person, 'record', record, 'viewer')`
-- before the comment is written, with the refusal naming why. Nothing to fix; it is ruled as it
-- stands.

set lock_timeout = '4s';

CREATE OR REPLACE FUNCTION custom.agent_table_claim(p_organization uuid, p_table uuid, p_conversation uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_organization is null or p_table is null then
    raise exception 'agent_table_claim: both an organization and a table are required'
      using errcode = 'null_value_not_allowed';
  end if;
  -- THE CALLER'S OWN ACCESS DECIDES, not the definer's. Without this, a signed-in
  -- person could stamp any table in any organization as "the agent's own" and buy
  -- itself the exemption — which would make the knob decorative.
  perform custom.assert_client_may_reach(p_organization, 'custom.agent_table_claim');
  -- STORE-T: AND THE ROW, on the one ladder. Stamping a table as "the agent's own" buys that
  -- table the exemption from the approval knob, so it is a change to what the table MEANS and
  -- it takes the level a change takes — not merely membership of the organization.
  perform custom.assert_client_may_change(p_organization, p_table, 'custom.agent_table_claim',
                                          'editor'::public.permission_level, 'table');
  -- ARGS-RULED (2026-09-21). AND THE CONVERSATION. `p_conversation` is what buys this table its
  -- exemption from the approval knob — custom.agent_change_approval matches on it — and it was
  -- written into custom.agent_table_origin with nothing asked about it, so a table could be
  -- claimed for somebody else's conversation. A conversation is an entity of the platform
  -- kernel, so it takes the kernel's own question.
  if p_conversation is not null
     and not custom.query_is_store_owner()
     and custom.query_principal() is not null
     and not iam.has_access('conversation', p_conversation, 'viewer'::public.permission_level) then
    raise exception 'That conversation is not yours, so this table was not claimed for it.'
      using errcode = '42501',
            hint = 'Claiming a table for a conversation is what exempts it from this organization''s agent-approval setting. Claim it for a conversation you are in.';
  end if;

  insert into custom.agent_table_origin (
    organization_id, table_id, conversation_id, created_by
  )
  values (p_organization, p_table, p_conversation, auth.uid())
  on conflict (organization_id, table_id) do nothing;
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.anon_token_issue(p_organization_id uuid, p_mode text, p_allowed_origins jsonb, p_form_id uuid DEFAULT NULL::uuid, p_saved_view_id uuid DEFAULT NULL::uuid, p_record_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(token_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_table  uuid;
  v_secret text;
  v_id     uuid;
  v_n      integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_issue');
  if coalesce(p_mode, '') not in ('read', 'write') then
    raise exception 'custom.anon_token_issue: mode is read or write, not "%". A token carrying both would be one credential holding two decisions, and the second is always the one nobody meant to grant.', p_mode
      using errcode = '22023';
  end if;

  select count(*) into v_n from jsonb_array_elements_text(coalesce(p_allowed_origins, '[]'::jsonb));
  if v_n = 0 then
    -- An empty origin list is refused at ISSUE rather than silently meaning "everywhere".
    raise exception 'custom.anon_token_issue: name the origins this token works from.'
      using errcode = '22004',
            hint = 'An embed token with no origin list is a token that works from any page on the internet, including an attacker''s. Pass the exact origins, scheme and host and port: ["https://example.com"].';
  end if;

  if p_mode = 'write' then
    if p_form_id is null then
      raise exception 'custom.anon_token_issue: a write token must name the form it writes to'
        using errcode = '22004';
    end if;
    select f.table_id into v_table from custom.anon_form f
     where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
    if v_table is null then
      raise exception 'custom.anon_token_issue: no form % in this organization', p_form_id
        using errcode = '23503';
    end if;
    if not custom.has_visibility(v_user, 'record', v_table, 'admin'::public.permission_level) then
      raise exception 'You may not issue a write token for this form.'
        using errcode = '42501',
              hint = 'Issuing a write token hands a stranger a way in, so it needs the admin level on the Table the form writes into.';
    end if;
  elsif p_record_id is not null then
    if not custom.has_visibility(v_user, 'record', p_record_id, 'admin'::public.permission_level) then
      raise exception 'You may not issue a read token for this record.'
        using errcode = '42501',
              hint = 'A read token lets anyone holding it read the record from an allowed origin, so issuing one needs the admin level on that record.';
    end if;
  end if;

  -- ARGS-RULED (2026-09-21). AND THE SAVED VIEW, ON THE SAME LADDER AS THE RECORD BESIDE IT.
  -- `p_saved_view_id` was written into custom.anon_token with nothing asked about it, and the
  -- token this door mints grants ANONYMOUS reads — so a member could issue a public token over a
  -- saved view they do not hold. The record arm above has asked `admin` since the day it was
  -- written; a saved view is a Record of this store like any other and takes the same question.
  if p_saved_view_id is not null
     and not custom.has_visibility(v_user, 'record', p_saved_view_id, 'admin'::public.permission_level) then
    raise exception 'You may not issue a token for this saved view.'
      using errcode = '42501',
            hint = 'A token over a saved view lets anyone holding it read that view from an allowed origin, so issuing one needs the admin level on the view - the same level the record arm of this door has always asked for.';
  end if;

  -- The secret is minted here and returned ONCE. Only its digest is stored, so a database read
  -- — a backup, a support query, a leaked dump — cannot produce a working token.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into custom.anon_token (organization_id, form_id, saved_view_id, record_id, mode,
                                 secret_hash, allowed_origins, expires_at, created_by)
  values (p_organization_id, p_form_id, p_saved_view_id, p_record_id, p_mode,
          encode(extensions.digest(v_secret, 'sha256'), 'hex'),
          coalesce(p_allowed_origins, '[]'::jsonb), p_expires_at, v_user)
  returning id into v_id;

  token_id := v_id; secret := v_secret; return next;
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.doc_sign(p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_name text, p_signer_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc    record;
  v_field  jsonb;
  v_have   jsonb;
  v_prior  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.doc_sign');
  -- THE DOOR. One call to the ONE predicate.
  perform custom.assert_store_door(p_organization_id, 'custom.doc_sign');
  -- ── SEAT-SUITES, 2026-09-19: EDITOR ON THE RECORD IS ASKED WHERE THE RECORD IS KNOWN. ──
  -- This line used to sit here and name `p_record_id`, which is not a parameter of this
  -- function — this door takes a RENDER id and reads the record out of it. So every call to
  -- `custom.doc_sign`, from every seat, died on its ninth line with
  -- `42703 column "p_record_id" does not exist` before it had looked at anything. The only
  -- door for signing a document could not sign one. It went unseen because the suite that
  -- covers it ran on the rehearsal copy, where this prologue does not exist.
  -- The question is unchanged — EDITOR on the record, on the one ladder — and it is now asked
  -- three statements further down, the moment the render row says which record that is.

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.doc_sign: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  -- ARGS-RULED (2026-09-21). A SIGNATURE IS SIGNED BY WHOEVER SIGNED IT.
  -- `p_signer_user_id` is written through custom.doc_signature_write onto the signature row as
  -- the account that signed, and nothing compared it to the caller — so somebody with editor on
  -- the record could seal a document version in another person's name. This is the
  -- stamp-from-an-argument class: GUARD-STAMPS closed it on custom.portal_principal_bind, and
  -- ARGS-RULED closed it on platform.unified_data_store_set the same day.
  -- NULL stays legal and means exactly what custom.doc_signature_write's own rule says it
  -- means: "an outside signer with no account of ours". The server lane is unchanged.
  if p_signer_user_id is not null
     and not custom.query_is_store_owner()
     and custom.query_principal() is not null
     and p_signer_user_id <> custom.query_principal() then
    raise exception 'A signature is signed by whoever signed it, so it cannot be recorded in somebody else''s name.'
      using errcode = '42501',
            hint = 'Leave the signer account empty for an outside signer with no account here, or sign it yourself. Whose name appears on a sealed document is not a field the person sealing it gets to choose.';
  end if;

  select d.record_id, d.table_id, d.content_hash, d.template_version, d.template_id
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no document % in this organization to sign', p_render_id
      using errcode = '02000',
            hint = 'A signature seals a rendered document version. Render one first: custom.doc_render_document(organization, template, record).';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_doc.record_id, 'custom.doc_sign',
                                         'editor'::public.permission_level, 'record');

  -- VAL-10: the Value a signature IS. It lives on a Field of the record's own Table, and
  -- that Field is a text Field whose format is signature — FLD-1's closed behaviour set,
  -- unwidened. A Field that is not one is refused BY NAME, naming the ones that are.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('VAL-10 through FLD-1''s closed set: one of list, range, text, relation, formula, and a signature is text. The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ③ THE DOOR REFUSES TO OVERWRITE A SIGNED VALUE. A seal already standing behind this
  -- Field's value on this record is what makes it immutable through every door this lane
  -- owns; ④ in this file's header names the one path that is not covered and who owns it.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, and a signature is immutable once signed',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10. Every seal on this record stays exactly as it was made. A further agreement is a further Field with its own signature, or a further document version with its own seal - never a rewriting of this one.';
  end if;

  -- THE VALUE. Written through the store's OWN door, so the envelope law stamps its version,
  -- its author and its time exactly as it does for every other Value, and the interned
  -- provenance carries the two facts the CLOSED envelope has no key for: the document
  -- version this signature sealed, and its hash.
  perform custom.record_update(p_organization_id, v_doc.record_id,
    jsonb_build_object(
      '_actor', 'user',
      p_field_key, to_jsonb(btrim(p_signer_name)),
      '_values', jsonb_build_object(
        p_field_key, jsonb_build_object(
          'src', jsonb_build_object(
            'kind',             'signed_document',
            'render_id',        p_render_id,
            'template_id',      v_doc.template_id,
            'document_version', v_doc.template_version,
            'document_hash',    v_doc.content_hash)))));

  -- THE SEAL, through this table's one write door.
  return custom.doc_signature_write(p_organization_id, p_render_id, v_doc.record_id,
                                    p_field_key, p_signer_name, p_signer_user_id,
                                    v_doc.content_hash, v_doc.template_version);
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST, AND IT WAS NOT DECIDED AT ALL.
  -- REC-29: "organizations are hard walls, and a door decides who may reach one before it
  -- decides anything else" — every other door in this store obeys it and DOOR-1, the one read
  -- door, did not. It made no membership decision about the organization it was handed.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  -- AND THE LADDER BEFORE EXISTENCE. This used to raise 02000 "there is no record % in this
  -- organization" BEFORE asking custom.has_visibility, so the two answers differed: a caller who
  -- guessed a record uuid learned whether it existed in that organization (02000) or not
  -- (42501). One bit per guess, and the store's own rule is that a record you may not open and a
  -- record that is not there answer the same thing. `custom.has_visibility` answers false for an
  -- id that is not there, so this ordering makes the two identical without a second read.
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  select r.table_id, custom.record_values_of(r)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    -- Only somebody the ladder has already admitted reaches this sentence, so it now tells a
    -- person who holds the record that it is in the trash — and tells a stranger nothing.
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask(p_organization_id, v_now, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_mask -> 'key_ids', v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  v_out := custom.choice_render(p_organization_id, v_table, v_out);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$

;

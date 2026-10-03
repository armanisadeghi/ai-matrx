--
-- THE SIGNING SURFACE GETS ITS DOORS (SPEC-ESIGN §6.0 U-03).
--
-- E-sign notices send signers to `/sign/e/<envelope>` (a platform user) and `/x/sign#t=<secret>`
-- (an outsider). Neither route existed, and the server half they need had nothing to call:
--
-- 1. THE SIGNED-IN SIGNER'S EIGHT DOORS WERE CLOSED. DD-169 batch 3 removed the client EXECUTE on
--    `esign_my_signer_row` and the seven `esign_sign_*` acts because, then, no client called them.
--    The signing surface is that client: aidream's `/esign/signing/envelope/{id}/act` runs them
--    `acting_as_user`, so `auth.uid()` is the signer's. Each body resolves the caller itself
--    (`esign._ctx_internal` refuses anyone but the signer row's own user — §8.4 case 23), which is
--    the literal recorded as each door's gate predicate.
-- 2. TWO READS for that server half:
--    `esign.outsider_token_organization` (the organization an outsider's code is sent under) and
--    `esign.document_storage` (where a frozen document's exact version lives, so its bytes are
--    handed over after the download act ledgers the read — never a URL). Both are SECURITY
--    INVOKER: a client role that reached one would read only what row security already gives it.
-- 3. THE CODE EMAIL HAS WORDS. `esign.verification_code` had no template, so the outsider's
--    one-time code could never have been sent. Its email and text say only the code.

-- ── 1. the signed-in signer's doors ──────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   gate_predicate, signed_in_callers, anonymous_callers, argument_rules)
select 'public', p.proname, pg_get_function_identity_arguments(p.oid),
       (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
       'Signed-in e-sign signer door (SPEC-ESIGN §6.0 U-03): ' || d.what
         || ' Called by aidream /esign/signing/envelope/{id}/act acting as the signed-in signer.',
       'matrx-frontend/migrations/esign_signing_surface_has_its_doors.sql',
       d.gate, true, false, jsonb_build_object('version', 1, 'arguments', (
         select jsonb_object_agg(a.name, jsonb_build_object(
                  'type', format_type(a.typ, null),
                  'position', a.pos,
                  'optional', a.pos > p.pronargs - p.pronargdefaults,
                  'foreign', case
                    when a.typ <> 'uuid'::regtype then jsonb_build_object('not_an_id', true)
                    else jsonb_build_object('bounded', true, 'note', case a.name
                      when 'p_signer_id' then 'esign._ctx_internal refuses any signer row whose user is not auth.uid() before any read or write.'
                      when 'p_envelope_id' then 'Only the caller''s own signer row on this envelope is resolved; any other envelope answers not_your_signer_row.'
                      when 'p_document_id' then 'Read only inside the caller''s own envelope; a document of another envelope is refused as unknown_document.'
                      when 'p_disclosure_id' then 'Must equal the disclosure frozen on the caller''s own envelope; any other id is refused.'
                      when 'p_image_file_id' then 'Stored as a pointer on the caller''s own signer row only; nothing is read from it or returned.'
                      end)
                    end))
           from unnest(p.proargnames[1:p.pronargs], p.proargtypes::oid[]) with ordinality as a(name, typ, pos)))
  from (values
    ('esign_my_signer_row',        'finds the caller''s own signer row on an envelope.', 'auth.uid()'),
    ('esign_sign_load',            'loads the caller''s envelope and its frozen documents.', 'esign._ctx_internal'),
    ('esign_sign_preview_ack',     'records that the signer rendered a document.', 'esign._ctx_internal'),
    ('esign_sign_consent',         'the consent step.', 'esign._ctx_internal'),
    ('esign_sign_adopt_signature', 'adopts the signer''s signature.', 'esign._ctx_internal'),
    ('esign_sign',                 'the Sign act under the five conditions of §4.3.', 'esign._ctx_internal'),
    ('esign_sign_decline',         'the signer declines.', 'esign._ctx_internal'),
    ('esign_sign_download',        'authorises and ledgers a document read.', 'esign._ctx_internal')
  ) as d(fn, what, gate)
  join pg_proc p on p.proname = d.fn and p.pronamespace = 'public'::regnamespace
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'public' and c.function_name = p.proname
                      and c.identity_args = pg_get_function_identity_arguments(p.oid));

grant execute on function public.esign_my_signer_row(uuid) to authenticated;
grant execute on function public.esign_sign_load(uuid, inet, text) to authenticated;
grant execute on function public.esign_sign_preview_ack(uuid, uuid, inet, text) to authenticated;
grant execute on function public.esign_sign_consent(uuid, uuid, inet, text) to authenticated;
grant execute on function public.esign_sign_adopt_signature(uuid, text, text, text, uuid, jsonb, inet, text) to authenticated;
grant execute on function public.esign_sign(uuid, jsonb, text, inet, text) to authenticated;
grant execute on function public.esign_sign_decline(uuid, text, inet, text) to authenticated;
grant execute on function public.esign_sign_download(uuid, uuid, inet, text) to authenticated;

-- ── 2. the server half's two reads ───────────────────────────────────────────────────────────
create or replace function esign.outsider_token_organization(p_secret text)
returns uuid
language sql stable
set search_path to ''
as $fn$
  select t.organization_id
    from platform.actor_token t
   where t.token_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
     and t.consumer_key = 'esign.signer';
$fn$;

create or replace function esign.document_storage(p_file_id uuid, p_version integer)
returns jsonb
language sql stable
set search_path to ''
as $fn$
  select jsonb_build_object(
           'storage_uri', coalesce(v.storage_uri, f.storage_uri),
           'mime_type', f.mime_type)
    from files.files f
    left join files.file_versions v
      on v.file_id = f.id and v.version_number = coalesce(p_version, f.current_version)
   where f.id = p_file_id;
$fn$;

-- ── 3. the code's words ──────────────────────────────────────────────────────────────────────
update communication.notification_event_type t
   set config = jsonb_set(
         coalesce(t.config, '{}'::jsonb),
         '{templates}',
         coalesce(t.config -> 'templates', '{}'::jsonb)
           || jsonb_build_object(
                'email', jsonb_build_object(
                  'subject', 'Your signing code: {{code}}',
                  'body', E'{{code}} is your code to open the document {{employer.name}} sent you to sign.\n\nIt works for 10 minutes and only once. Nobody from AI Matrx will ever ask you for it.\n\nIf you did not just ask for a code, ignore this email: without the link it opens nothing.'),
                'sms', jsonb_build_object(
                  'body', 'AI Matrx: {{code}} is your code to open the document {{employer.short_name}} sent you to sign. It works for 10 minutes.')),
         true)
 where t.event_key = 'esign.verification_code'
   and t.deleted_at is null
   and nullif(btrim(coalesce(t.config -> 'templates' -> 'email' ->> 'body', '')), '') is null;

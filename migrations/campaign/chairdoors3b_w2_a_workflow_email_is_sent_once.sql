-- draft: CHAIR-DOORS-3B rule 27 on the clone not yet green (the clone's sign-in freeze / pool were saturated on 2026-10-03 01:30 PT); body proven in a rolled-back transaction. Remove this line when db:rehearse passes.
-- chair-step: CREATES one new table crm.sending_claim through platform.create_entity_table (entity variant, organization data class, RLS by iam.apply_rls, certified in the same transaction), with a unique index on (organization_id, claim_key) and an index on identity_id; then REVOKEs INSERT, UPDATE, DELETE and TRUNCATE on it from anon and authenticated so only the server writes it (SELECT stays: the standard organization read plus platform_admin_read). A new table with a foreign key to crm.sending_identity takes SHARE ROW EXCLUSIVE on that table for the moment of the CREATE, which is why this file waits for Arman's watched window. No existing function, grant, policy, column or row is touched.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 1f) — WINDOW FILE: proven on the clone, left for the window
--
-- A WORKFLOW EMAIL IS SENT ONCE. Today a replayed workflow email whose charge failed, or two replays at
-- the same moment, can send twice. crm.sending_event cannot serve as the claim: clients may insert it
-- and it has no claim key. The server claims (organization_id, claim_key) here BEFORE it sends; a second
-- claim of the same key collides on the unique index and the send is skipped.
--   claim_key: `workflow.email:<run>:<node>:<dispatch>:<item>`
--   state:     claimed → sent | failed; provider_message_id and sending_event_id once settled.
--
-- INVERSE: migrations/inverse/chairdoors3b_w2_a_workflow_email_is_sent_once_down.sql

do $w2$
begin
  if to_regclass('crm.sending_claim') is null then
    perform platform.create_entity_table(
      p_schema => 'crm', p_table => 'sending_claim',
      p_token => 'crm_sending_claim', p_label => 'Sending claim',
      p_fields => array[
        'identity_id uuid REFERENCES crm.sending_identity(id) ON DELETE SET NULL',
        'claim_key text NOT NULL',
        'state text NOT NULL DEFAULT ''claimed'' CHECK (state IN (''claimed'', ''sent'', ''failed''))',
        'provider_message_id text',
        'sending_event_id uuid',
        'error_code text',
        'claimed_at timestamptz NOT NULL DEFAULT now()',
        'settled_at timestamptz'
      ],
      p_variant => 'entity',
      p_versioned => false, p_soft_delete => false,
      p_visibility => 'internal',
      p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
      p_parents => array[]::text[],
      p_data_class => 'organization'::platform.data_class,
      p_default_list_scope => 'organization'::platform.list_scope);
  end if;
end
$w2$;

create unique index if not exists sending_claim_organization_claim_key_key
  on crm.sending_claim (organization_id, claim_key);
create index if not exists sending_claim_identity_idx on crm.sending_claim (identity_id);

-- Server-only writes: the claim is the server's word, never a client's.
revoke insert, update, delete, truncate on table crm.sending_claim from anon, authenticated;

comment on table crm.sending_claim is
  'Chair (v6, CHAIR-DOORS-3B for lane 11): one row per workflow email the server has claimed to send — (organization_id, claim_key) is unique, so a replay or a second worker cannot send the same email twice. Written only by the server; members read their organization''s claims.';

do $proof$
begin
  if not iam.canonical_certify_ok('crm', 'sending_claim', 'crm_sending_claim') then
    raise exception 'crm.sending_claim is not canonical-certified';
  end if;
end
$proof$;

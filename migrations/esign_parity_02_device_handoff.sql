-- E-signature parity, wave A, step 2 — the phone handoff primitive (CONTRACT.md v2 §4, decision D).
-- platform.device_handoff: a platform primitive (purpose `esign.signature` first; phase-2 signer
-- attachments, ID photos and the PDF scanner reuse it). Reached ONLY through doors (§6.2), so it is
-- not listed and its rows default to personal visibility. Its own file because the platform
-- schema's grant pass inside iam.apply_rls is long.

do $$
begin
  if to_regclass('platform.device_handoff') is null then
    perform platform.create_entity_table(
      p_schema => 'platform', p_table => 'device_handoff',
      p_token => 'device_handoff', p_label => 'Device Handoff',
      p_fields => array[
        'purpose text NOT NULL',
        'subject_type text',
        'subject_id uuid',
        'envelope_id uuid',
        'target text',
        'secret_hash text NOT NULL UNIQUE',
        $f$status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','opened','completed','cancelled','expired'))$f$,
        'expires_at timestamptz NOT NULL',
        'opened_at timestamptz',
        'completed_at timestamptz',
        $f$method text CHECK (method IN ('drawn','uploaded'))$f$,
        'result_file_id uuid',   -- the filed image; evidence lives on the envelope's association edge
        'strokes jsonb',
        'texts_sent integer NOT NULL DEFAULT 0',
        'phone_last4 text',
        'ip inet',
        'user_agent text'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => false,
      p_visibility => 'personal', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false);
  end if;
end $$;

create index if not exists device_handoff_subject_idx
  on platform.device_handoff (subject_id, status);

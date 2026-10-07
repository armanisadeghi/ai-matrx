-- E-signature parity, wave A — table esign.envelope_draft (CONTRACT.md v2 §5.1). One table per file: the
-- canonical builder's grant pass is long, and one transaction holding several is cancelled.

do $$
begin
  if to_regclass('esign.envelope_draft') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'envelope_draft',
      p_token => 'esign_envelope_draft', p_label => 'E-Signature Draft',
      p_fields => array[
        'envelope_id uuid NOT NULL UNIQUE REFERENCES esign.envelope(id) ON DELETE CASCADE',
        $f$composition jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'revision integer NOT NULL DEFAULT 0',
        'saved_at timestamptz',
        -- {recipient_key: sha256(code)} — never plain text, never returned by any door (A-F6).
        $f$access_code_hashes jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false,
      p_visibility => 'none', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false,
      p_parents => array['esign_envelope:envelope_id']);
  end if;
end $$;

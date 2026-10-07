-- E-signature parity, wave A — table esign.template (CONTRACT.md v2 §5.1). One table per file: the
-- canonical builder's grant pass is long, and one transaction holding several is cancelled.

do $$
begin
  if to_regclass('esign.template') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'template',
      p_token => 'esign_template', p_label => 'E-Signature Template',
      p_fields => array[
        $f$name text NOT NULL CHECK (btrim(name) <> '')$f$,
        'description text',
        $f$composition jsonb NOT NULL DEFAULT '{}'::jsonb$f$,
        'source_envelope_id uuid'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true,
      p_visibility => 'internal', p_category => false, p_listed => true,
      p_org_default => false, p_gin_jsonb => false);
  end if;
end $$;

-- source_envelope_id is provenance only (no foreign key): a template may outlive, or be shared
-- beyond, the envelope it came from, and a cross-organization guard would be a new refusal.
create index if not exists template_source_envelope_idx on esign.template (source_envelope_id);

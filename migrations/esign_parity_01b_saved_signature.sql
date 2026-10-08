-- E-signature parity, wave A — table esign.saved_signature (CONTRACT.md v2 §5.1). One table per file: the
-- canonical builder's grant pass is long, and one transaction holding several is cancelled.

do $$
begin
  if to_regclass('esign.saved_signature') is null then
    perform platform.create_entity_table(
      p_schema => 'esign', p_table => 'saved_signature',
      p_token => 'esign_saved_signature', p_label => 'Saved Signature',
      p_fields => array[
        $f$target text NOT NULL CHECK (target IN ('signature','initials'))$f$,
        $f$kind text NOT NULL CHECK (kind IN ('typed','drawn','uploaded'))$f$,
        'typed_text text',
        'typed_style text',
        'image_file_id uuid NOT NULL',
        'is_default boolean NOT NULL DEFAULT false',
        'label text'
      ],
      p_variant => 'entity', p_versioned => false, p_soft_delete => true,
      p_visibility => 'personal', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false);
  end if;
end $$;

alter table esign.saved_signature add constraint saved_signature_image_file_id_fkey foreign key (image_file_id) references files.files(id);
create index if not exists saved_signature_image_file_idx on esign.saved_signature (image_file_id);
create unique index if not exists saved_signature_one_default_uq
  on esign.saved_signature (created_by, target) where is_default and deleted_at is null;

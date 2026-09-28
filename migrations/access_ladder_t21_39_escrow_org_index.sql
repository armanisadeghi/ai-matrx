-- lane: access-ladder T-21
-- Access ladder T-21 (2026-09-28): pdf.pdf_redaction_key_escrow's organization foreign key (added NOT VALID by the
-- retrofit in t21_23) needs a covering index before platform.provision_validate_base_contract can validate it
-- (provision_shape_guard). The table holds 0 rows.
set local lock_timeout = '3s';
create index if not exists pdf_redaction_key_escrow_organization_id_idx on pdf.pdf_redaction_key_escrow (organization_id);

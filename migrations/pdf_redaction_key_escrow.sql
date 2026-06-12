-- pdf_redaction_key_escrow — recovery model for reversible-redaction keys.
--
-- Today the per-session AES-256-GCM key exists ONLY in the redacting
-- browser's IndexedDB: clear browser data / switch devices and every
-- reversible redaction in that session is cryptographically unrecoverable
-- (redaction_mapping holds ciphertext+nonce, never keys). Decision
-- 2026-06-11: escrow wrapped keys org-scoped so the org (compliance) can
-- always restore.
--
-- SCOPE OF THIS MIGRATION: the DATA MODEL only. Nothing writes here yet —
-- the wrap/unwrap mechanics (KMS) belong to the security team's interface,
-- and storing UNwrapped keys server-side would silently weaken the current
-- client-only custody model. The backend gains write/read paths when the
-- wrapping interface exists; until then the FE's KeyHandoff acknowledgment
-- flow remains the custody gate.

create table if not exists public.pdf_redaction_key_escrow (
    id               uuid primary key default gen_random_uuid(),
    session_id       text not null unique,
    file_id          uuid references public.cld_files(id) on delete cascade,
    owner_id         uuid not null references auth.users(id) on delete cascade,
    organization_id  uuid,
    -- The session key WRAPPED by the org/KMS key — never plaintext.
    wrapped_key      text not null,
    -- Identifies the wrapping scheme + key version used (e.g. 'kms-v1:org').
    wrap_alg         text not null,
    created_at       timestamptz not null default now(),
    revoked_at       timestamptz
);

create index if not exists pdf_redaction_key_escrow_owner_idx
    on public.pdf_redaction_key_escrow (owner_id, created_at desc);
create index if not exists pdf_redaction_key_escrow_file_idx
    on public.pdf_redaction_key_escrow (file_id);

alter table public.pdf_redaction_key_escrow enable row level security;

create policy pdf_redaction_key_escrow_select on public.pdf_redaction_key_escrow
    for select using (owner_id = auth.uid());

create policy pdf_redaction_key_escrow_insert on public.pdf_redaction_key_escrow
    for insert with check (owner_id = auth.uid());

-- Revocation only (no key rewrites): owner may set revoked_at.
create policy pdf_redaction_key_escrow_update on public.pdf_redaction_key_escrow
    for update using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

comment on table public.pdf_redaction_key_escrow is
  'Org-recoverable WRAPPED reversible-redaction session keys. Write path intentionally unwired until the KMS wrapping interface exists — see migration header.';

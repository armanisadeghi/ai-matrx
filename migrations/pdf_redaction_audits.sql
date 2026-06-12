-- pdf_redaction_audits — applying the table the redaction engine was built
-- for. The matrx-utils SCHEMA.sql shipped 2026-05 but was never applied;
-- audits only landed inside cld_files.derivation_metadata JSONB. Source:
-- packages/matrx-utils/.../pdf/redact/SCHEMA.sql (applied verbatim below).

-- pdf_redaction_audits — every PDF redaction operation produces one row.
--
-- The matrx-utils RedactionEngine yields a `RedactionAudit` payload; the
-- host (aidream) is responsible for persisting this row via matrx-orm
-- before returning the post-redaction file to the user.
--
-- Per design §7.3 + the per-user-resource-ownership contract in root
-- CLAUDE.md, the row is owned by user_id and gated by RLS via
-- public.is_resource_owner / public.check_resource_access.
--
-- Apply as a matrx-orm migration when wiring this into a project.

create table if not exists public.pdf_redaction_audits (
    id                       uuid primary key default gen_random_uuid(),
    parent_file_id           uuid references public.cld_files(id) on delete set null,
    file_id                  uuid references public.cld_files(id) on delete cascade,
    user_id                  uuid not null references auth.users(id) on delete cascade,
    reason                   text not null,
    redaction_kind           text not null
        check (redaction_kind in (
            'regions','pattern','entities','repeated_regions',
            'metadata','forms','attachments','javascript',
            'annotations','composite'
        )),
    redaction_params         jsonb not null default '{}'::jsonb,
    tier_used                text not null default 'stream_rewrite'
        check (tier_used in ('stream_rewrite','rasterize','mixed','n/a')),
    status                   text not null default 'success'
        check (status in ('success','verification_failed','no_targets')),
    bytes_removed_estimate   bigint not null default 0,
    regions_count            integer not null default 0,
    created_at               timestamptz not null default now()
);

create index if not exists pdf_redaction_audits_user_idx
    on public.pdf_redaction_audits (user_id, created_at desc);
create index if not exists pdf_redaction_audits_file_idx
    on public.pdf_redaction_audits (file_id);
create index if not exists pdf_redaction_audits_parent_idx
    on public.pdf_redaction_audits (parent_file_id);

-- Enable RLS so the per-user ownership contract applies.
alter table public.pdf_redaction_audits enable row level security;

-- SELECT — only the owner may read. (SCHEMA.sql was written against an older
-- 3-arg is_resource_owner; the live signature is (p_resource_type, p_resource_id)
-- — adapted here, same semantics.)
create policy pdf_redaction_audits_select on public.pdf_redaction_audits
    for select using (
        public.is_resource_owner('pdf_redaction_audits', id)
    );

-- INSERT — only the row owner.
create policy pdf_redaction_audits_insert on public.pdf_redaction_audits
    for insert with check (user_id = auth.uid());

-- The audit row is intentionally append-only.  No update / delete policies.

-- Register the resource type so check_resource_access knows about it.
-- (Adapted to the live registry columns — SCHEMA.sql predates the reshape.)
insert into public.shareable_resource_registry
    (resource_type, table_name, id_column, owner_column,
     display_label, url_path_template, rls_uses_has_permission)
values (
    'pdf_redaction_audits',
    'pdf_redaction_audits',
    'id',
    'user_id',
    'Redaction Audit',
    '/files/{id}',
    false
) on conflict do nothing;

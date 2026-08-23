-- WHAT A LIBRARY RESOURCE IS — two axes, both ROWS so they stay editable.
--
-- Arman, 2026-08-23: "imagine news you get from CNN versus the news you get from
-- the associated press versus a blog article versus Wikipedia versus social
-- media … the same needs to apply to us. We need a couple layers, um, not to
-- make it complicated, but just a few layers where we can sort of identify what
-- something is."
--
-- THE TWO AXES ARE NOT ONE LADDER, and collapsing them is the classic mistake:
--   • source_authority — how authoritative the ORIGIN is. Nothing to do with us.
--   • assurance_level  — what WE did to it, and therefore what we stand behind.
-- "The AMA guide, reproduced as-is" and "our own expert wrote this" are both
-- high trust for OPPOSITE reasons; one number cannot say both. A single score
-- would also make "Authoritative source, never checked by us" — which is
-- exactly what the two canon Rulebooks are — impossible to state honestly.
--
-- VOCABULARY IS REUSED, NOT COINED. The two-axis framing and the word
-- "authority" come from the existing (unbuilt, far heavier) Knowledge System
-- spec — common-docs/projects/knowledge-system/vision/knowledge_provenance_model.md,
-- "Provenance (lineage)" vs "Authority (truth confidence now)" — whose Quality
-- Vector + log-odds propagation (04_matrx_quality_model.md) is deliberately NOT
-- built here. These coarse tiers are the honest label a human reads; that model,
-- if it ever lands, can compute INTO them rather than beside them.
-- The two table names are PROPOSED and await Arman's ratification.
--
-- NOTE ON THE DDL GUARD: these are LOOKUP TAXONOMIES, not entities — the exact
-- shape of iam.industries (slug PK, no organization_id, no owner, read-by-all,
-- platform-admin writes). They must not go through platform.create_entity_table,
-- which would give them an org, a visibility and an access tree that mean
-- nothing for a tier list. The guard is disabled and re-enabled in the SAME
-- transaction, per its own hint.
--
-- Idempotent. Applied via Supabase MCP against brsgrqvjdzwihsvnfqkf 2026-08-23.

alter event trigger ddl_guard disable;

create table if not exists platform.source_authority (
  slug        text primary key,
  label       text not null,
  blurb       text not null,
  rank        integer not null,
  is_active   boolean not null default true,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists platform.assurance_level (
  slug        text primary key,
  label       text not null,
  blurb       text not null,
  rank        integer not null,
  is_active   boolean not null default true,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter event trigger ddl_guard enable;

comment on table platform.source_authority is
  'How authoritative the ORIGIN of a body of knowledge is — nothing to do with what Matrx did to it. Rows, not an enum: tiers are expected to change. Ordered by `rank` (higher = more authoritative). Pairs with platform.assurance_level; neither is meaningful alone.';
comment on table platform.assurance_level is
  'What MATRX did to a body of knowledge, and therefore what we stand behind. Pairs with platform.source_authority. Ordered by `rank`.';

insert into platform.source_authority(slug, label, blurb, rank) values
  ('official',      'Official',      'The issuing body''s own material — a standards body, a regulator, a court, the authors themselves.', 50),
  ('first_party',   'Matrx expert',  'Authored here by a named expert or industry curator. It has no outside source, and does not need one.', 45),
  ('authoritative', 'Authoritative', 'A publisher of record: a peer-reviewed journal, a wire service, a government dataset, a published book of standing.', 40),
  ('reputable',     'Reputable',     'A named, accountable publisher whose work is edited but interpretive — a major outlet, a leading trade publication.', 30),
  ('community',     'Community',     'Openly editable or crowd-sourced — a wiki, a forum, a community handbook. Often excellent, never accountable.', 20),
  ('unattributed',  'Unattributed',  'No named author standing behind it: social posts, anonymous blogs, scraped pages.', 10)
on conflict (slug) do update set label = excluded.label, blurb = excluded.blurb, rank = excluded.rank, updated_at = now();

insert into platform.assurance_level(slug, label, blurb, rank) values
  ('expert_reviewed', 'Expert reviewed',  'A named human with standing in the field went through it and signed off.', 50),
  ('ai_fact_checked', 'AI fact-checked',  'Claims were cross-checked against sources by AI and the findings recorded. We think it''s good. No guarantees.', 40),
  ('verbatim',        'Reproduced as-is', 'Unchanged from the source. We assert nothing beyond fidelity — what it says, it said.', 30),
  ('ai_reviewed',     'AI reviewed',      'An AI read it end to end for contradictions, gaps and vagueness, and we acted on what it found. No outside claim was checked.', 20),
  ('unverified',      'Not verified',     'Captured and organized, nothing checked. Useful, but nobody has confirmed any of it. Treat it as a starting point.', 10)
on conflict (slug) do update set label = excluded.label, blurb = excluded.blurb, rank = excluded.rank, updated_at = now();

alter table platform.source_authority enable row level security;
alter table platform.assurance_level  enable row level security;

drop policy if exists source_authority_select_all on platform.source_authority;
create policy source_authority_select_all on platform.source_authority for select using (true);
drop policy if exists source_authority_platform_admin_all on platform.source_authority;
create policy source_authority_platform_admin_all on platform.source_authority
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists assurance_level_select_all on platform.assurance_level;
create policy assurance_level_select_all on platform.assurance_level for select using (true);
drop policy if exists assurance_level_platform_admin_all on platform.assurance_level;
create policy assurance_level_platform_admin_all on platform.assurance_level
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on platform.source_authority to authenticated, anon, service_role;
grant select on platform.assurance_level  to authenticated, anon, service_role;

-- The pair, on the first type to carry it. Adding the same two columns to
-- rag.data_stores / seo.starter_pack later is a copy of these two lines.
alter table platform.rulebook
  add column if not exists source_authority text references platform.source_authority(slug),
  add column if not exists assurance_level  text references platform.assurance_level(slug);

comment on column platform.rulebook.source_authority is
  'How authoritative this Rulebook''s ORIGIN is (platform.source_authority). Required before it can be given to an industry or to everyone.';
comment on column platform.rulebook.assurance_level is
  'What Matrx did to it, and therefore what we stand behind (platform.assurance_level). Required before it can be given to an industry or to everyone — "not verified" is a fine answer, an ABSENT answer is not.';

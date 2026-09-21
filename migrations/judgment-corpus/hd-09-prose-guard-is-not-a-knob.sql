-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- Guard: features/ai-work/conversations/__tests__/search-admits-scored-identities.test.ts
--
-- A sentence that starts with "Guard:" is a witness pointer, not a feature-knob
-- directive. The knob line above is the directive. This line must not refuse the file.
--
set local lock_timeout = '3s';
create schema if not exists custom;
create table if not exists custom.zz_thing (id bigint primary key, organization_id uuid not null);
alter table custom.zz_thing add column if not exists note text;
alter table custom.zz_thing add constraint zz_thing_note_len check (length(note) < 200) not valid;
alter table custom.zz_thing enable row level security;
create unique index if not exists zz_thing_org_idx on custom.zz_thing (organization_id, id);
comment on table custom.zz_thing is 'a corpus fixture';

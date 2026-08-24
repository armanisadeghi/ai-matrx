-- legacy_user_flashcards_port_to_canonical.sql
--
-- Education Q3 (Arman ruling 2026-08-20): "A forked conversation's chat-generated
-- decks get PORTED to the canonical system, not dropped; then the legacy tables
-- retire." One-time DML port of users.user_flashcard_sets (24 rows, cards as an
-- embedded {front,back}[] jsonb array) into education.fc_set / fc_card + member
-- edges, with canvas.canvas_items pointers repointed to the new sets.
--
-- Decisions carried in this file:
--   • Explicit created_by + organization_id (owner's personal org) on every row —
--     no trigger/resolver chooses an org (no-db-assigned-org law).
--   • users.user_flashcard_reviews (37 rows) are NOT synthesized into
--     education.item_mastery: the legacy rows carry no FSRS state (card_index +
--     result + reviewed_at only) and D-WP5-1 forbids fabricating ledger/mastery
--     data. The rows ride to the graveyard with their table — preserved, not
--     ported. (Assumption logged in common-docs systems/education/DECISIONS.md.)
--   • Fork-duplicate decks are ported as-is (zero data loss; dedupe is the
--     owner's call in the UI).
--   • Idempotent: a legacy set already ported (fc_set.metadata->>'legacy_id')
--     is skipped.
--
-- Applied via Supabase MCP execute_sql on 2026-08-22 (project brsgrqvjdzwihsvnfqkf).

begin;

with owner_org as (
  select u.created_by, (
    select o.id from iam.organizations o
    join iam.memberships m on m.organization_id = o.id and m.user_id = u.created_by
    where o.is_personal limit 1
  ) as org_id
  from (select distinct created_by from users.user_flashcard_sets) u
),
todo as (
  select s.*, oo.org_id
  from users.user_flashcard_sets s
  join owner_org oo on oo.created_by = s.created_by
  where jsonb_typeof(s.cards) = 'array'
    and not exists (
      select 1 from education.fc_set f where f.metadata->>'legacy_id' = s.id::text
    )
),
new_sets as (
  insert into education.fc_set (name, created_by, updated_by, organization_id, metadata)
  select
    coalesce(nullif(trim(t.title), ''), 'Flashcards'),
    t.created_by, t.created_by, t.org_id,
    jsonb_build_object(
      'imported_from', 'legacy_user_flashcard_sets',
      'legacy_id', t.id::text
    ) || case when t.conversation_id is not null
         then jsonb_build_object('source_system', 'cx_conversation', 'source_id', t.conversation_id::text)
         else '{}'::jsonb end
  from todo t
  returning id, (metadata->>'legacy_id')::uuid as legacy_id, created_by, organization_id
),
new_cards as (
  -- fc_card has no position column; order lives on the member edge. The
  -- ordinal rides fc_card.metadata (legacy_pos) so the edge insert can read it.
  insert into education.fc_card (front, back, card_kind, created_by, updated_by, organization_id, metadata)
  select
    coalesce(nullif(trim(c.card->>'front'), ''), trim(c.card->>'back')),
    case when nullif(trim(c.card->>'front'), '') is not null then coalesce(trim(c.card->>'back'), '') else '' end,
    'basic',
    ns.created_by, ns.created_by, ns.organization_id,
    jsonb_build_object(
      'imported_from', 'legacy_user_flashcard_sets',
      'legacy_set_id', ns.legacy_id::text,
      'legacy_pos', c.pos
    )
  from new_sets ns
  join todo t on t.id = ns.legacy_id
  cross join lateral jsonb_array_elements(t.cards) with ordinality as c(card, pos)
  where nullif(trim(c.card->>'front'), '') is not null or nullif(trim(c.card->>'back'), '') is not null
  returning id, (metadata->>'legacy_set_id')::uuid as legacy_set_id,
            (metadata->>'legacy_pos')::int as legacy_pos, created_by, organization_id
)
insert into platform.associations
  (source_type, source_id, target_type, target_id, role, position, created_by, organization_id, metadata)
select 'fc_card', nc.id, 'fc_set', ns.id, 'member', nc.legacy_pos,
       nc.created_by, nc.organization_id,
       jsonb_build_object('imported_from', 'legacy_user_flashcard_sets')
from new_cards nc
join new_sets ns on ns.legacy_id = nc.legacy_set_id;

-- Repoint the 7 canvas pointers so the debug/render path resolves canonically.
update canvas.canvas_items ci
set external_system = 'fc_set',
    external_id = f.id::text
from education.fc_set f
where ci.external_system = 'user_flashcard_sets'
  and f.metadata->>'legacy_id' = ci.external_id;

commit;

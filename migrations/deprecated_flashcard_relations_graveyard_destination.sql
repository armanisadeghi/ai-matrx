-- The legacy user flashcard tables were preserved in graveyard after their
-- data was ported to education.fc_set / education.fc_card. Keep the retirement
-- ledger pointed at the relations that actually exist so stale-reference
-- diagnostics lead to a resolvable destination.

begin;

do $$
begin
  if to_regclass('graveyard.user_flashcard_reviews') is null
     or to_regclass('graveyard.user_flashcard_sets') is null then
    raise exception 'Expected both legacy flashcard tables in graveyard';
  end if;
end $$;

update platform.deprecated_relations
set new_ref = case old_ref
  when 'public.user_flashcard_reviews' then 'graveyard.user_flashcard_reviews'
  when 'public.user_flashcard_sets' then 'graveyard.user_flashcard_sets'
end,
reason = case old_ref
  when 'public.user_flashcard_reviews' then 'legacy flashcard reviews preserved in graveyard after canonical education port'
  when 'public.user_flashcard_sets' then 'legacy flashcard sets preserved in graveyard after canonical education port'
end
where old_ref in (
  'public.user_flashcard_reviews',
  'public.user_flashcard_sets'
)
and new_ref is distinct from case old_ref
  when 'public.user_flashcard_reviews' then 'graveyard.user_flashcard_reviews'
  when 'public.user_flashcard_sets' then 'graveyard.user_flashcard_sets'
end;

do $$
declare
  repaired_count integer;
begin
  select count(*) into repaired_count
  from platform.deprecated_relations
  where (old_ref, new_ref) in (
    ('public.user_flashcard_reviews', 'graveyard.user_flashcard_reviews'),
    ('public.user_flashcard_sets', 'graveyard.user_flashcard_sets')
  );

  if repaired_count <> 2 then
    raise exception 'Expected exactly 2 repaired flashcard retirement rows, found %', repaired_count;
  end if;
end $$;

commit;

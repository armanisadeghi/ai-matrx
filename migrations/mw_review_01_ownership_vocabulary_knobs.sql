-- THE EXPERT'S REVIEW WORDING AND THEIR AGENDA PANEL — two knobs, no schema.
--
-- Doctrine: common-docs/systems/masterwork/doctrine/CORE.md §5 Grading —
-- "Each rule carries its origin so the expert can say 'yes, that's mine' rule
-- by rule; the review is mine / not mine / mine but wrong, and the last two
-- rows are the next session's agenda." Arman, 2026-09-15: a thumbs-up on a
-- result "is the most important indication we need".
--
-- Law 6, opinions become knobs. The wording an Expert sees while reviewing
-- their own rules is a behavioural choice an organization may hold an opinion
-- about, so it is a row, not a constant — and the same for whether the agenda
-- appears on the page.
--
-- NOTHING ELSE IN THIS CHANGE TOUCHES THE DATABASE. The signature itself is a
-- row in platform.output_feedback written through the existing
-- platform.upsert_output_feedback RPC: no new table, no new verdict word, no
-- other migration. Readers:
--   matrx-frontend features/masterwork/review/vocabulary.ts
--   matrx-frontend features/masterwork/review/NextSessionAgenda.tsx

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, propagation)
select
  'masterwork.review', 'vocabulary', '"auto"'::jsonb, '"auto"'::jsonb, 'enum',
  '["auto", "standard", "ownership"]'::jsonb,
  'What the rule review calls its buttons',
  'Auto uses the expert''s own words ("Mine", "Mine but wrong", "Not mine") for a Rulebook whose expertise comes from a person we can ask, and the neutral words ("Approve", "Request changes", "Reject") for one distilled from somebody else''s material. Ownership or Standard forces one wording everywhere. The words change; the review states they write do not.',
  'agent',
  'Chosen 2026-09-15 from Arman''s ruling and doctrine CORE.md §5. Default is auto rather than ownership because the ownership question is unanswerable for a Rulebook distilled from a book — a reader cannot say whether Gio Valiante''s rule is "theirs" — and a screen must never ask a question the person in front of it cannot answer. Org- and user-overridable because it is pure wording: a company that trains its people on one vocabulary sets it once, and no setting of it can change which status a click writes. Arman has NOT reviewed this default. Review due 2026-11-15.',
  current_date + 60, '{organization,user}'::text[], 'any',
  jsonb_build_object(
    'group', 'Masterwork review',
    'order', 1,
    'control', 'segmented',
    'help', 'The words on the buttons an expert uses to review their own rules. Nothing about what the buttons do changes.'
  ),
  'next_load'
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      allowed_values = excluded.allowed_values,
      label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      overridable_by = excluded.overridable_by,
      override_direction = excluded.override_direction,
      ui = excluded.ui,
      propagation = excluded.propagation,
      updated_at = now();

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, propagation)
select
  'masterwork.review', 'agenda_panel', 'true'::jsonb, 'true'::jsonb, 'boolean',
  'Show the next session''s agenda on the Rulebook page',
  'The panel listing every rule the expert said is not theirs, or is theirs but came out wrong, with their own words. Turning it off hides the panel only — the interviewer still receives the same list before its first turn, because that is a provision, not a panel.',
  'agent',
  'Chosen 2026-09-15. On by default because the list is the expert''s own words about their own rules and hiding their open review work by default would be the screen lying by omission; off exists for an organization whose experts review in a different order. Org-overridable. Arman has NOT reviewed this default. Review due 2026-11-15.',
  current_date + 60, '{organization}'::text[], 'any',
  jsonb_build_object(
    'group', 'Masterwork review',
    'order', 2,
    'control', 'switch',
    'help', 'Show the rules waiting for the next interview on the Rulebook page.'
  ),
  'next_load'
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      overridable_by = excluded.overridable_by,
      override_direction = excluded.override_direction,
      ui = excluded.ui,
      propagation = excluded.propagation,
      updated_at = now();

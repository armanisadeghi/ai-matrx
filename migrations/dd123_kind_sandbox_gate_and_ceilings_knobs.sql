-- DD-123 S7 — the Shape sandbox gate and its three ceilings become register rows.
--
-- WHAT THIS SEEDS (feature `custom`, the family DD-123 §1.10 names):
--
--   sandbox_org_components            the GATE. false = organization-authored
--                                     kind components render in the page, as
--                                     they do today. true = they render inside
--                                     the `/kind-sandbox` frame.
--   sandbox_frame_height_px           the height the host gives one frame
--                                     before it offers "Show all" (S3).
--   sandbox_expanded_frame_height_px  what "Show all" grows to before the host
--                                     says plainly that the rest is cut off.
--   sandbox_message_bytes             the cap the HOST applies to one inbound
--                                     frame→host message.
--
-- WHY THE GATE IS SEEDED **false**. `lib/knobs` and the scoped resolver both
-- RAISE on a missing knob by design, so until this row exists the host reads
-- OFF and says so once in the console (`useKindSandboxKnob.ts`). Seeding it
-- true would flip 162 live component bodies onto a new render path in one
-- step, with no live parity proof behind it (S5) and no browser refusal proof
-- (S6). The row lands OFF; the rollout (plan §6) turns it on org by org.
--
-- WHY `overridable_by` IS '{}' (PLATFORM-LOCKED) TODAY. The gate is not tenant
-- policy — it selects which of two render paths the platform trusts, and until
-- S5 (rendering parity across every live body) and S6 (the real-browser
-- refusal proofs) are green there is no org that should be able to put itself
-- on the new path, in either direction. The three ceilings are blast-radius
-- backstops of the same build: a tenant raising them spends this page's layout
-- and this tab's memory, which is the SoR's "whose number is it?" test
-- answering "not theirs".
--   The rollout's first two steps NEED the organization rung, so opening it is
-- a deliberate follow-on migration — per the feature-knobs SoR, overridability
-- is curated in its own migration and a re-run of this seed never touches it
-- (which is why `overridable_by` is absent from the on-conflict list below).
--
-- AGENT-SET VALUES (2026-09-12). Every number here is today's shipped constant
-- in `features/content-ir/sandbox/protocol.ts`, so seeding changes no behavior
-- on either side of the gate; the rows exist so the numbers can move without a
-- deploy. Reviewed after the first organization runs framed.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, label, description, set_by, basis, review_due,
   overridable_by, override_direction)
values
  ('custom', 'sandbox_org_components',
   'false'::jsonb, 'false'::jsonb, 'boolean', null,
   null, null,
   'Render organization-authored components in the Shape sandbox',
   'When on, a component authored by an organization renders inside an isolated same-origin frame that cannot reach the network, read a cookie, or script the page. When off, it renders in the page exactly as it does today. This is a rollback lever for a RENDERING regression — turning it off returns the page to today''s behavior and nothing else.',
   'agent',
   'Seeded OFF because ON is a one-step move of all 162 live organization-authored component bodies onto a render path whose parity proof (DD-123 S5) and browser refusal proof (S6) are still in flight. OFF is byte-identical to the behavior shipped today.',
   current_date + 45, '{}', 'any'),

  ('custom', 'sandbox_frame_height_px',
   '4000'::jsonb, '4000'::jsonb, 'integer', 'pixels',
   400, 20000,
   'Sandbox frame height before "Show all"',
   'How tall one sandboxed component may be before the host holds it at this height and offers a control saying how tall it really is. Nothing is ever cut off silently.',
   'agent',
   'Today''s shipped constant (FRAME_HEIGHT_CEILING_PX, DD-123 S3). A runaway body — an author''s unbounded list, a layout loop — must not be able to grow the host page without limit; 4000 px is about two screens, which is as much as a reader takes in before choosing to expand. The frame''s own copy of this number is compiled into the bundle, so the host can lower this below 4000 and see it, but cannot raise it above 4000 until the frame ships a new bundle.',
   current_date + 45, '{}', 'any'),

  ('custom', 'sandbox_expanded_frame_height_px',
   '20000'::jsonb, '20000'::jsonb, 'integer', 'pixels',
   1000, 60000,
   'Sandbox frame height after "Show all"',
   'The most a sandboxed component may occupy once the reader has expanded it. Past this the host shows the component at this height and says in words that the rest is cut off.',
   'agent',
   'Today''s shipped constant (EXPANDED_FRAME_HEIGHT_CEILING_PX, DD-123 S3). Five screens of one component is past what a reader can use; beyond it the honest answer is a sentence, not more pixels. Must always be at or above sandbox_frame_height_px — the host refuses to frame anything and says so if the two rows are set the other way round.',
   current_date + 45, '{}', 'any'),

  ('custom', 'sandbox_message_bytes',
   '65536'::jsonb, '65536'::jsonb, 'integer', 'bytes',
   4096, 1048576,
   'Largest message the host accepts from a sandbox frame',
   'One message from a sandboxed component to the page may not exceed this. A larger one is dropped with a named refusal — never a truncated render.',
   'agent',
   'Today''s shipped constant (MAX_INBOUND_BYTES, DD-123 §1.6). 64 KB carries every message the protocol defines (a size report, an action, a resolved value, an error sentence) with room to spare, and keeps one frame from feeding the host page unbounded JSON to parse. The frame''s own copy is compiled into the bundle, so lowering this row tightens the host immediately while raising it above 64 KB does nothing until the bundle ships.',
   current_date + 45, '{}', 'any')

on conflict (feature, key) do update set
  default_value = excluded.default_value,
  value_type = excluded.value_type,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  value = case when platform.feature_knob.set_by = 'human'
    then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human'
    then platform.feature_knob.review_due else excluded.review_due end;
-- NOTE: overridable_by / override_direction / bound_value are deliberately NOT
-- in that list. Overridability is curated in its own migration and a re-run of
-- this seed must never quietly re-lock a rung someone opened on purpose
-- (common-docs/systems/platform/feature-knobs/FEATURE.md, § the invariants).

-- Verification, in the same transaction as the insert: four rows, the gate off,
-- the ceilings in the right order. A seed that silently landed three of four
-- rows, or an expanded ceiling below the unexpanded one, fails here rather than
-- at render time in front of a reader.
do $$
declare
  v_rows int;
  v_gate jsonb;
  v_frame numeric;
  v_expanded numeric;
begin
  select count(*) into v_rows
    from platform.feature_knob
   where feature = 'custom'
     and key in ('sandbox_org_components', 'sandbox_frame_height_px',
                 'sandbox_expanded_frame_height_px', 'sandbox_message_bytes');
  if v_rows <> 4 then
    raise exception 'DD-123 S7 seed: expected 4 custom sandbox knob rows, found %', v_rows;
  end if;

  select coalesce(value, default_value) into v_gate
    from platform.feature_knob
   where feature = 'custom' and key = 'sandbox_org_components';
  if v_gate <> 'false'::jsonb then
    raise notice 'DD-123 S7 seed: the gate is %, not false — a human value is being preserved, which is the on-conflict rule working', v_gate;
  end if;

  select (coalesce(value, default_value) #>> '{}')::numeric into v_frame
    from platform.feature_knob
   where feature = 'custom' and key = 'sandbox_frame_height_px';
  select (coalesce(value, default_value) #>> '{}')::numeric into v_expanded
    from platform.feature_knob
   where feature = 'custom' and key = 'sandbox_expanded_frame_height_px';
  if v_expanded < v_frame then
    raise exception 'DD-123 S7 seed: the expanded ceiling (%) is below the unexpanded one (%) — "Show all" would show less', v_expanded, v_frame;
  end if;
end $$;

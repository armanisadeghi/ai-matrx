-- flashcard_deck_cards_v1 (+ flashcard_card_ref_v1): the input kind the
-- `flashcards.fix_giveaway_cards` mandate's provision offers as `cards`.
-- Split out of list_change_target_flashcard_deck.sql, which a release applied
-- to production (2026-10-02 06:49Z) before this part was added to it.
--
-- ── flashcard_deck_cards_v1 (+ flashcard_card_ref_v1) ──────────────────────
-- The INPUT kind a deck-wide AI step is offered: every card of one deck with
-- its id. Data-only (no component, skill or bridge). Compiled floor:
-- features/content-ir/kinds/flashcard-deck-cards.ts. Insert-or-refresh, with
-- the one edge and one canonical example per kind; validation_status on the
-- examples is DERIVED by trigger, never set here. is_active is not set here.

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   emitted_fingerprint, is_active, organization_id, visibility, metadata)
select
  'flashcard_card_ref_v1',
  $LCP$Flashcard Card Reference$LCP$,
  'ts',
  $LCP$[{"name":"id","required":true,"description":"The card's id. Copy it exactly when proposing a change to this card.","type":"string"},{"name":"front","required":true,"description":"The card's front, as stored: markdown with LaTeX math.","type":"string"},{"name":"back","required":true,"description":"The card's back, as stored: markdown with LaTeX math.","type":"string"}]$LCP$::jsonb,
  $LCP${"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}$LCP$::jsonb,
  $LCP${"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}$LCP$::jsonb,
  'ef-77k2041o489v6',
  false,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'public'::platform.visibility,
  $LCP${"family": "platform", "category": "input", "direction": "input", "generated": false, "source_name": "flashcards.fix_giveaway_cards", "activation_note": "data-only input item: one card's id and faces"}$LCP$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
   where kind = 'flashcard_card_ref_v1' and deleted_at is null);

update content_ir.kind_definition
   set data = $LCP$[{"name":"id","required":true,"description":"The card's id. Copy it exactly when proposing a change to this card.","type":"string"},{"name":"front","required":true,"description":"The card's front, as stored: markdown with LaTeX math.","type":"string"},{"name":"back","required":true,"description":"The card's back, as stored: markdown with LaTeX math.","type":"string"}]$LCP$::jsonb,
       emitted_block_schema = $LCP${"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}$LCP$::jsonb,
       emitted_json_schema = $LCP${"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}$LCP$::jsonb,
       emitted_fingerprint = 'ef-77k2041o489v6'
 where kind = 'flashcard_card_ref_v1' and deleted_at is null
   and emitted_fingerprint is distinct from 'ef-77k2041o489v6';

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   emitted_fingerprint, is_active, organization_id, visibility, metadata)
select
  'flashcard_deck_cards_v1',
  $LCP$Flashcard Deck Cards$LCP$,
  'ts',
  $LCP$[{"name":"cards","required":true,"description":"Every card in the deck, in deck order.","type":"array"}]$LCP$::jsonb,
  $LCP${"type":"object","properties":{"cards":{"type":"array","items":{"$ref":"#/$defs/flashcard_card_ref_v1"},"description":"Every card in the deck, in deck order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_deck_cards_v1"}},"required":["__kind","cards"],"additionalProperties":false,"$defs":{"flashcard_card_ref_v1":{"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}}}$LCP$::jsonb,
  $LCP${"type":"object","properties":{"cards":{"type":"array","items":{"$ref":"#/$defs/flashcard_card_ref_v1"},"description":"Every card in the deck, in deck order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_deck_cards_v1"}},"required":["__kind","cards"],"additionalProperties":false,"$defs":{"flashcard_card_ref_v1":{"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}}}$LCP$::jsonb,
  'os-8ei65564a7bj',
  false,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'public'::platform.visibility,
  $LCP${"family": "platform", "category": "input", "direction": "input", "generated": false, "source_name": "flashcards.fix_giveaway_cards", "activation_note": "data-only input: every card of one deck, with ids"}$LCP$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
   where kind = 'flashcard_deck_cards_v1' and deleted_at is null);

update content_ir.kind_definition
   set data = $LCP$[{"name":"cards","required":true,"description":"Every card in the deck, in deck order.","type":"array"}]$LCP$::jsonb,
       emitted_block_schema = $LCP${"type":"object","properties":{"cards":{"type":"array","items":{"$ref":"#/$defs/flashcard_card_ref_v1"},"description":"Every card in the deck, in deck order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_deck_cards_v1"}},"required":["__kind","cards"],"additionalProperties":false,"$defs":{"flashcard_card_ref_v1":{"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}}}$LCP$::jsonb,
       emitted_json_schema = $LCP${"type":"object","properties":{"cards":{"type":"array","items":{"$ref":"#/$defs/flashcard_card_ref_v1"},"description":"Every card in the deck, in deck order."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_deck_cards_v1"}},"required":["__kind","cards"],"additionalProperties":false,"$defs":{"flashcard_card_ref_v1":{"type":"object","properties":{"id":{"type":"string","description":"The card's id. Copy it exactly when proposing a change to this card."},"front":{"type":"string","description":"The card's front, as stored: markdown with LaTeX math."},"back":{"type":"string","description":"The card's back, as stored: markdown with LaTeX math."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"flashcard_card_ref_v1"}},"required":["__kind","id","front","back"],"additionalProperties":false}}}$LCP$::jsonb,
       emitted_fingerprint = 'os-8ei65564a7bj'
 where kind = 'flashcard_deck_cards_v1' and deleted_at is null
   and emitted_fingerprint is distinct from 'os-8ei65564a7bj';

insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'cards', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition p, content_ir.kind_definition c
 where p.kind = 'flashcard_deck_cards_v1' and p.deleted_at is null
   and c.kind = 'flashcard_card_ref_v1' and c.deleted_at is null
on conflict (parent_definition_id, field_name, child_definition_id) do nothing;

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, organization_id)
select d.id, d.version, $LCP${"__kind": "flashcard_card_ref_v1", "id": "5caf6520-469b-417f-936c-5d59e608e100", "front": "Ammonium Ion\n(Formula and Charge)", "back": "\\(\\text{NH}_4^+\\)\n(charge: \\(+1\\))"}$LCP$::jsonb,
       $LCP$Polyatomic ions deck — real cards$LCP$,
       $LCP$Two real cards: one clean, one whose back names the front's ion.$LCP$,
       'authored', true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition d
 where d.kind = 'flashcard_card_ref_v1' and d.deleted_at is null
on conflict (kind_definition_id, kind_version) where (is_canonical and deleted_at is null)
do update set data = excluded.data, label = excluded.label, description = excluded.description;

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, organization_id)
select d.id, d.version, $LCP${"__kind": "flashcard_deck_cards_v1", "cards": [{"__kind": "flashcard_card_ref_v1", "id": "5caf6520-469b-417f-936c-5d59e608e100", "front": "Ammonium Ion\n(Formula and Charge)", "back": "\\(\\text{NH}_4^+\\)\n(charge: \\(+1\\))"}, {"__kind": "flashcard_card_ref_v1", "id": "01d5f01b-6246-49a4-ae92-0b7edce35e5a", "front": "Borite Ion\n(Formula and Charge)", "back": "\\(\\text{BO}_2^{2-}\\)\n(charge: \\(-2\\), as noted in the study text for aluminum borite, \\(\\text{Al}_2(\\text{BO}_2)_3\\))"}]}$LCP$::jsonb,
       $LCP$Polyatomic ions deck — real cards$LCP$,
       $LCP$Two real cards: one clean, one whose back names the front's ion.$LCP$,
       'authored', true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition d
 where d.kind = 'flashcard_deck_cards_v1' and d.deleted_at is null
on conflict (kind_definition_id, kind_version) where (is_canonical and deleted_at is null)
do update set data = excluded.data, label = excluded.label, description = excluded.description;

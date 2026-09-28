--
-- THE READING SET ON A CHAT ANSWER (chair ruling 2026-09-26: notes and chat answers get the full
-- reading set, anchored to the saved record). Comments on a chat message already work (the
-- comment doors take any registered token). Highlights, private notes and passage links ride
-- platform.associations, and the vocabulary has NO pair into `message` yet, so today the client
-- leaves Highlight, Private note and Link ABSENT on chat answers (annotationPairs reads
-- public.association_link_sources and offers only what a pair allows). These rows make them present.
--
-- Mirrors the RC-A3 document pairs and the RC-B11 note pairs exactly:
--   document → message  role annotates   an annotation document (highlight / private note, payload
--                                         text_anchor) on the answer. Non-conveying: personal.
--   fc_card  → message  role anchored_to  a flashcard linked to the passage it teaches.
--   note     → message  role anchored_to  a note linked to a passage of the answer.
-- All non-conveying (container_side none, conveys_max viewer), like every annotation pair.

insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes, allows_loops)
values
  ('document', 'message', 'none', 'viewer', true,
   'Reading set on a chat answer (2026-09-26): an annotation document (role annotates, payload text_anchor) — a highlight or private note — on a chat message. Non-conveying: an annotation is personal.', false),
  ('fc_card', 'message', 'none', 'viewer', true,
   'Reading set on a chat answer (2026-09-26): a flashcard linked to the passage of a chat message it teaches (role anchored_to, payload text_anchor). Non-conveying.', false),
  ('note', 'message', 'none', 'viewer', true,
   'Reading set on a chat answer (2026-09-26): a note linked to a passage of a chat message (role anchored_to, payload text_anchor). Non-conveying.', false)
on conflict do nothing;

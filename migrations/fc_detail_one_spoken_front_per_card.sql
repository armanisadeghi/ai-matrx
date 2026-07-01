-- fc_detail_one_spoken_front_per_card
--
-- Structurally prevent duplicate spoken_front details: at most one LIVE
-- spoken_front per card. Partial (WHERE kind) so other detail kinds (helper,
-- example, spoken_back, …) can still have many rows per card. This makes the
-- on-demand Fast Fire TTS regeneration idempotent — a re-run can never create a
-- second spoken_front row for a card (see
-- features/flashcards/fast-fire/spoken-front/generateSpokenFront.thunk.ts).
--
-- Idempotent: IF NOT EXISTS.

create unique index if not exists uq_fc_detail_one_spoken_front
on education.fc_detail (card_id)
where kind = 'spoken_front' and deleted_at is null;

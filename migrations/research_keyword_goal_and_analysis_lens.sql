-- Per-keyword goals (focused lens) — workstream A of
-- docs/handoffs/research-lens-video-and-experts.md.
--
-- rs_keyword.goal: the user-authored "what is THIS search for" sentence that
-- threads into every agent prompt that touches the keyword.
-- rs_analysis.keyword_id: NULL = the topic-level lens (the historical default,
-- shared by every keyword); non-NULL = an analysis written specifically for
-- that keyword's goal. The analysis dedup key becomes (source_id, keyword_id).

alter table research.rs_keyword add column if not exists goal text;

alter table research.rs_analysis add column if not exists keyword_id uuid
  references research.rs_keyword(id) on delete set null;

create index if not exists idx_rs_analysis_keyword_id
  on research.rs_analysis(keyword_id) where keyword_id is not null;

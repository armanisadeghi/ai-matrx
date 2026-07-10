-- Two overloads of triage_feedback_item exist; the 8-arg version (with
-- p_category_id defaulting NULL) is a strict superset of the 7-arg version,
-- making PostgREST RPC calls ambiguous ("Could not choose the best candidate
-- function"). Drop the redundant 7-arg overload; the 8-arg one covers every
-- caller that omits p_category_id since it defaults to NULL.
drop function if exists public.triage_feedback_item(uuid,text,text,text,text[],integer,text);

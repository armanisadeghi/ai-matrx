-- Register the conversation -> web_brand association pair: "this conversation is about this brand".
--
-- The PR Director's chat in the Press Room (/marketing/[brandId]/pr) writes this edge through
-- public.assoc_add so a continuation turn from ANY surface keeps its brand: aidream's
-- news/pr_brand_context.py::seed_pr_brand_context reads the edge and re-attaches the
-- pr_brand_context source when the request did not ship it. Brief:
-- common-docs/projects/outside-skill-packs/BRIEFS-STRATEGY-AND-ORG-CHART.md §2 (Inputs).
--
-- NON-CONVEYING (container_side='none'), per the canonical-associations rule for a new pair:
-- talking about a brand must never grant access to it, and a brand must never grant access to a
-- conversation. assoc_add then requires editor on one end and viewer on the other (the person owns
-- the conversation and can read the brand), and the seed re-checks brand access every turn.
-- Direction is canonical little -> big (conversation -> web_brand).
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes)
values (
  'conversation', 'web_brand', 'none', 'editor'::permission_level, true,
  'The brand a conversation is about (PR Director, Press Room, 2026-09-27). Non-conveying; the reader re-checks brand access every turn.'
)
on conflict (source_type, target_type) do update
  set is_active = true,
      updated_at = now();

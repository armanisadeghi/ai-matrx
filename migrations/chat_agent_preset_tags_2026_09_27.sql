-- chat_agent_preset_tags_2026_09_27.sql — the first Chat-mode presets (Amendment 1, A2).
--
-- Arman, composer-spec-amendment-1.md A2: "A preset is an agent carrying a `chat-agent` tag.
-- Rules for who can tag are later; for now read the tag." No agent carried it, so Chat mode's
-- agent pill had nothing to list. The starting presets are the system agents already holding
-- the chat surface's own quick-start jobs for news, writing and research — picked by the JOB
-- (mandate), never by a hardcoded agent id, so a rebind moves the preset with it.
--
-- Metadata only: appends one tag; nothing about the agents' instructions, models or tools changes.
-- Idempotent: an agent that already carries the tag is left alone.

-- Provenance: a code-tier write names its system (platform._stamp_actor_tier).
select set_config('app.actor_system', 'composer.chat_presets_seed', true);

update agent.definition d
   set tags = array_append(coalesce(d.tags, '{}'::text[]), 'chat-agent')
  from mandate.definition m
 where m.default_holder_type = 'agent'
   and m.default_holder_id = d.id
   and m.deleted_at is null
   and d.deleted_at is null
   and m.mandate_key in ('chat.quick_fair_news', 'chat.quick_writing_partner', 'chat.quick_research')
   and not ('chat-agent' = any(coalesce(d.tags, '{}'::text[])));

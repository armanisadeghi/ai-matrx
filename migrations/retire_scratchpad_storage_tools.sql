-- Retire the `scratchpad` and `storage` tools platform-wide.
--
-- WHY (Arman's ruling, 2026-08-12): neither tool filled a gap.
--
--   * `storage` was "persistent agent-namespaced KV, per user". That is exactly
--     what the server-side `memory` tool already is (chat.agent_memory, scoped
--     user / project / organization). A second mechanism for the same job.
--
--   * `scratchpad` was an agent-writable KV that squatted on the name of
--     `user_scratchpad` — the USER's own per-conversation document
--     (workbench.working_documents kind='scratch'), which the agent may read and
--     is explicitly forbidden to write. Same word, opposite meaning: an agent
--     holding both was told two contradictory things about what a scratchpad is.
--
-- Both were ported from matrx-extend on 2026-05-19 and backed by tables
-- (public.cx_agent_memory, public.agent_user_kv) that were dropped long ago with
-- no deprecation record — so every call has been failing. Live telemetry at the
-- time of this migration: scratchpad 7 calls / 7 errors, storage 10 / 8, both
-- last used 2026-08-10.
--
-- The real gap this exposed — per-conversation agent memory that survives a
-- context RESET (as opposed to the user-owned scratchpad, which the user may
-- wipe at any time, and so cannot carry agent continuity) — is deliberately NOT
-- filled here. It gets its own tool, its own design, and a different name.
--
-- Definitions are DEACTIVATED, not hard-deleted: tool.definition_version rows
-- FK to them and are the record of what these tools were. Bindings ARE deleted —
-- a binding is what makes a tool advertised to an executor, and leaving inert
-- ones behind is the half-state that misleads the next reader.

begin;

-- 1. Deactivate the two definitions.
update tool.definition
   set is_active      = false,
       deactivated_at = coalesce(deactivated_at, now()),
       deleted_at     = coalesce(deleted_at, now()),
       metadata       = metadata || jsonb_build_object(
         'retired_reason',
         'Duplicate capability. storage == the server-side `memory` tool; '
         || 'scratchpad collided with the user-owned `user_scratchpad` document. '
         || 'Backing tables were already dropped, so every call failed.',
         'retired_on', '2026-08-12'
       )
 where name in ('scratchpad', 'storage');

-- 2. Drop their executor bindings (chrome-extension + matrx-user).
delete from tool.binding b
 using tool.definition d
 where b.tool_id = d.id
   and d.name in ('scratchpad', 'storage');

-- 3. Stop force-feeding them onto every surface, and make sure the two
--    chrome-extension surfaces are not left with NO memory tool at all —
--    they never carried `memory`, so removing these two would have taken
--    their last remembering capability away.
update tool.surface_defaults
   set always_include_tools = (
         select coalesce(array_agg(t order by t), '{}')
           from unnest(
             case
               when surface_name like 'chrome-extension/%'
                    and not ('memory' = any(always_include_tools))
                 then always_include_tools || array['memory']
               else always_include_tools
             end
           ) as t
          where t not in ('scratchpad', 'storage')
       ),
       updated_at = now()
 where always_include_tools && array['scratchpad', 'storage'];

-- 4. Record the two long-dropped tables so `check:dead-relations` screams at any
--    surviving reference. They were removed with no deprecation record, which is
--    the only reason this rotted silently for months.
insert into platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
values
  ('public.cx_agent_memory',
   'DELETED — no successor',
   'Ephemeral per-conversation KV from the 2026-05-19 matrx-extend port. Backed the '
   || '`scratchpad` tool, retired 2026-08-12. Durable memory is the `memory` tool '
   || '(chat.agent_memory — a DIFFERENT table that reused this name). The user''s '
   || 'per-conversation scratchpad is workbench.working_documents kind=''scratch''.',
   now()),
  ('public.agent_user_kv',
   'DELETED — no successor',
   'Per-user persistent KV from the 2026-05-19 matrx-extend port. Backed the '
   || '`storage` tool, retired 2026-08-12. Superseded by the `memory` tool '
   || '(chat.agent_memory), which already does user / project / organization scope.',
   now())
on conflict (old_ref) do nothing;

commit;

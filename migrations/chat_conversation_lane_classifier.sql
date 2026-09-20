-- chat.conversation_lane — the ONE platform classifier for "which lane is this
-- conversation in": chat | matrx | auto | plugin | subagent.
--
-- Arman, 2026-09-18: outside and automated conversations were spilling into the
-- chat sidebar, and the filter tree's "Select all" re-admitted all of them. The
-- sidebar now carries five independent on/off lane toggles — Chat | Matrx |
-- Auto | Plugins | Subagents — that AND above the source tree. The lane is
-- decided HERE, once, so every client (web, desktop, extension, mobile) filters
-- the same way server-side instead of re-deriving it from a client registry.
--
-- Precedence (first match wins): subagent > plugin > auto > chat > matrx.
--   subagent  any sub-agent — internal child agents AND plugin sub-agents
--             (conversation_type 'subagent' or origin_class 'child_agent').
--   plugin    conversations mirrored from an outside coding tool
--             (source_app 'code-plugin': claude-code, codex, cursor, vscode,
--             coding_session_reply).
--   auto      what the user does not control: scheduled / workflow / system /
--             client auto-fire origins, automated conversation types, the
--             'system' feature, and rows the server apps write on their own
--             (aidream + aidream-*, matrx-scheduler, mcp-agent-service — the
--             registry already marks every one of them programmatic).
--   chat      places the user picks an agent and chats with it: /chat, the
--             agent runner (incl. the floating agent run windows, which stamp
--             'agent-runner'), agent builder, agent apps, comparison,
--             generator, other agent chrome, voice agent.
--   matrx     everything else the user triggers inside the product.
--
-- Pure function of the row's provenance columns → IMMUTABLE, inlinable.
-- `chat.lane(chat.conversation)` is the PostgREST computed field, so a client
-- filters with `.in('lane', [...])` on `chat.conversation`.

create or replace function chat.conversation_lane(
  source_app text,
  source_feature text,
  origin_class text,
  conversation_type text
) returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when conversation_type = 'subagent' or origin_class = 'child_agent'
      then 'subagent'
    when source_app = 'code-plugin'
      then 'plugin'
    when origin_class in ('scheduled', 'workflow', 'system', 'client_auto')
      or conversation_type in ('scheduled', 'workflow', 'auto', 'system',
                               'research', 'podcast', 'hindsight_replay')
      or source_feature = 'system'
      or source_app = 'aidream'
      or source_app like 'aidream-%'
      or source_app in ('matrx-scheduler', 'mcp-agent-service')
      then 'auto'
    when source_feature in ('chat', 'agent-runner', 'agent-builder', 'agent-app',
                            'agent-comparison', 'agent-generator', 'agents-other',
                            'voice-agent')
      then 'chat'
    else 'matrx'
  end
$$;

comment on function chat.conversation_lane(text, text, text, text) is
  'The ONE conversation lane classifier: chat | matrx | auto | plugin | subagent (precedence subagent > plugin > auto > chat > matrx). Sidebar lane toggles filter on it via the chat.lane computed field.';

-- PostgREST computed field: `select=...,lane` and `lane=in.(chat,matrx)`.
create or replace function chat.lane(c chat.conversation)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select chat.conversation_lane(c.source_app, c.source_feature, c.origin_class, c.conversation_type)
$$;

comment on function chat.lane(chat.conversation) is
  'PostgREST computed field over chat.conversation_lane — filter with lane=in.(...).';

-- Per-lane counts for the signed-in user, for the sidebar toggle badges. The
-- sibling of get_cx_conversation_source_facets: SECURITY INVOKER, same
-- `mine`, non-ephemeral, non-deleted scope.
create or replace function public.get_cx_conversation_lane_counts()
returns table(lane text, n bigint)
language sql
stable
set search_path = ''
as $$
  select
    chat.conversation_lane(c.source_app, c.source_feature, c.origin_class, c.conversation_type) as lane,
    count(*)::bigint as n
  from chat.conversation c
  where c.created_by = (select auth.uid())
    and c.deleted_at is null
    and c.is_ephemeral = false
  group by 1;
$$;

comment on function public.get_cx_conversation_lane_counts() is
  'Per-lane conversation counts for the caller (chat | matrx | auto | plugin | subagent). Powers the conversation sidebar lane toggles.';

grant execute on function chat.conversation_lane(text, text, text, text) to authenticated, service_role;
grant execute on function chat.lane(chat.conversation) to authenticated, service_role;
grant execute on function public.get_cx_conversation_lane_counts() to authenticated, service_role;

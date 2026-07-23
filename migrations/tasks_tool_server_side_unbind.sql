-- tasks_tool_server_side_unbind
--
-- Move the `tasks` tool from client-delegated to server-executed.
--
-- THE PROBLEM: `tasks` (the agent's per-conversation tasklist on
-- chat.agent_task) was bound to the CLIENT executors `matrx-user` and
-- `chrome-extension`, so `resolve_executor_binding('tasks', …)` returned
-- "surface" and every task update HARD-SUSPENDED the orchestrator loop purely so
-- the browser could perform a plain DB write. The suspend→POST→resume handshake
-- stalls deterministically whenever a desktop companion (matrx-local) is
-- attached — the turn sits `paused` until the user types "continue".
--
-- THE FIX: delete both client bindings. With NO active `tool.binding` row,
-- `resolve_executor_binding` returns "server" and the tool runs in-loop via its
-- @tool declaration (executor `aidream`, aidream/tools/agent_tasks_tool.py) —
-- exactly like kind_create (which also has zero tool.binding rows). The loop
-- never enters the suspend path for `tasks` again.
--
-- ORDERING (critical): the aidream server callable MUST be deployed BEFORE this
-- runs. If `tasks` has no client binding AND no deployed server callable, the
-- tool-merge viability gate drops it (`no_viable_executor`) and the model loses
-- the tool. Deploy aidream commit 90eb68486 first, then apply this.
--
-- Idempotent: the DELETE is a no-op once the rows are gone. Reversible — to
-- restore delegation, re-insert (tool_id, 'matrx-user') and
-- (tool_id, 'chrome-extension') into tool.binding with is_active = true.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

DELETE FROM tool.binding
WHERE tool_id = (SELECT id FROM tool.definition WHERE name = 'tasks')
  AND executor_name IN ('matrx-user', 'chrome-extension');

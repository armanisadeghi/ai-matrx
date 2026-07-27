-- Tool argument recovery is a first-class, loudly recorded executor outcome.
--
-- The Python tool executor emits INFERRED, COERCED, and VARIANT_RECOVERED
-- rows to chat.tool_trace whenever its generic argument-recovery layer repairs
-- a provider call. The original constraint predates those outcomes and rejects
-- the trace row during the request's final persistence barrier, rolling back
-- otherwise-valid messages and tool calls. Keep one closed event vocabulary,
-- extended in place to match every event the canonical executor emits.
--
-- Idempotent: replacing the named CHECK with the complete vocabulary is safe
-- on both pre- and post-fix databases.

ALTER TABLE chat.tool_trace
  DROP CONSTRAINT IF EXISTS cx_tool_trace_event_check;

ALTER TABLE chat.tool_trace
  ADD CONSTRAINT cx_tool_trace_event_check
  CHECK (
    event IN (
      'OK',
      'FAIL',
      'SURFACE_REJECT',
      'NO_EXECUTOR',
      'LOOP_BLOCK',
      'INFERRED',
      'COERCED',
      'VARIANT_RECOVERED'
    )
  );

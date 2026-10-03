-- lane KINDS-GLUE wave 1 follow-up (2026-10-02) — two dispositions a verifier called debatable, decided by the rulings
-- ("a write happened" -> receipt; reads of data that lives elsewhere -> envelope; output a person would keep -> record):
--   tool_trace_incident_report    envelope -> receipt   report_trace_incident FILES an incident (creates or merges a
--                                                        user_feedback row) and returns the row it wrote: a write
--                                                        happened. kindsglue_e's M3 swept it in with the tool_trace_*
--                                                        reads by prefix.
--   personalization_write_result  receipt -> record     the crm.outreach_personalization_writer mandate's output: the
--                                                        personalization lines themselves (text, fact, source url per
--                                                        target). The agent wrote nothing — "write" is copywriting —
--                                                        so it is output a person keeps, like its item kind
--                                                        personalization_target_result (record).
-- The same value is declared in code for tool_trace_incident_report (matrx-ai tools/kinds/tool_traces.py @kind), so the
-- publisher's match sync agrees; personalization_write_result has no @kind (minted from the mandate's schema).
-- Only a row still holding kindsglue_e's value is written; only metadata.disposition changes. kindsglue_c's backstop
-- admits it (a declared value replaced by another declared value). Each written row's version bumps: run
-- `pnpm shape:types --all-generated` afterwards and commit the .gen.ts.
-- PRECONDITION: kindsglue_e applied. Locks: row locks on the two written rows only.
-- lane: KINDS-GLUE

update content_ir.kind_definition kd
   set metadata = jsonb_set(kd.metadata, '{disposition}', to_jsonb(v.ruled))
  from (values
    ('tool_trace_incident_report', 'envelope', 'receipt'),
    ('personalization_write_result', 'receipt', 'record')
  ) as v(kind, classified, ruled)
 where kd.kind = v.kind
   and kd.deleted_at is null
   and kd.metadata ->> 'disposition' = v.classified;

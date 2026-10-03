-- INVERSE of migrations/campaign/kindsglue_g_two_reviewed_dispositions.sql (lane KINDS-GLUE): the two kinds go back
-- to kindsglue_e's value, only where they still hold the ruled one.
-- lane: KINDS-GLUE

update content_ir.kind_definition kd
   set metadata = jsonb_set(kd.metadata, '{disposition}', to_jsonb(v.classified))
  from (values
    ('tool_trace_incident_report', 'envelope', 'receipt'),
    ('personalization_write_result', 'receipt', 'record')
  ) as v(kind, classified, ruled)
 where kd.kind = v.kind
   and kd.deleted_at is null
   and kd.metadata ->> 'disposition' = v.ruled;

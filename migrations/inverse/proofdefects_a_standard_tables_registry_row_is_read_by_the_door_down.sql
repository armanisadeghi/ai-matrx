-- chair-step: inverse of proofdefects_a_standard_tables_registry_row_is_read_by_the_door.sql (lane PROOF-DEFECTS, D1) — custom.entity_table(text) runs as the caller again, so an ordinary person's custom-field doors on standard tables refuse with "There is no table called ..." again. No policy, grant, table or row changes.
-- lane: PROOF-DEFECTS
set local statement_timeout = '60s';

alter function custom.entity_table(text) security invoker;

comment on function custom.entity_table(text) is null;

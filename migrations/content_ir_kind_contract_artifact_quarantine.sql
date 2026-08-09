-- Quarantine machine-minted I/O contract rows out of the real-shape population
-- (features-to-workflows item 6; NOMENCLATURE.md "I/O contract identities").
-- A contract artifact is a bookkeeping row minted by matrx-graph contract_kinds
-- (slug shape <family>_io_<type>_<hash8>_<input|output>) so the typed-I/O system
-- can detect drift. Shape pickers/galleries list ONLY human-named shapes;
-- contract minting keeps working unchanged (the aidream publisher stamps the
-- flag on every row it writes).
alter table content_ir.kind_definition
  add column if not exists is_contract_artifact boolean not null default false;

comment on column content_ir.kind_definition.is_contract_artifact is
  'True for machine-minted I/O contract bookkeeping rows (contract_kinds slugs like tool_io_*_<hash8>_output). Excluded from shape pickers/galleries; never set on human-named shapes.';

update content_ir.kind_definition
   set is_contract_artifact = true
 where kind ~ '^(action_io|tool_io|workflow_io|agent_io)_.+_[0-9a-f]{8}_(input|output)$'
   and is_contract_artifact = false;

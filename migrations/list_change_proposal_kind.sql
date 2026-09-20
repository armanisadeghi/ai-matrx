-- list_change_proposal_v1 — the "proposed changes to a list" primitive.
--
-- An agent proposes changes to ANY list the platform holds; the person accepts
-- or rejects each one inside the conversation; the accepted ones land in the
-- store through ONE port (features/list-change-proposals/applyListChange.ts).
-- Known defects per repository is the first customer, not the feature.
--
-- What this file registers, all idempotent, all INSERT/UPSERT only:
--   1. three content_ir.kind_definition rows (the envelope + its two children),
--      emitted verbatim by `scripts/shape/emit-kind-rows.ts` from the compiled
--      floor in features/content-ir/kinds/list-change-proposal.ts — never hand
--      written, so the stored schema cannot drift from the source;
--   2. the two content_ir.kind_edge rows those fields imply;
--   3. one canonical content_ir.kind_example per kind. validation_status is
--      DERIVED by the kind_example_recompute_validation trigger — never set here;
--   4. skill.definition `kind_list_change_proposal` — the render-block skill that
--      TEACHES any agent this kind (opt-in per agent, never auto-attached);
--   5. four skill.render_definition content blocks under Agent Skills, so a
--      person can inject the instruction into one agent in two clicks;
--   6. the platform's "Known defects" table template + its six columns, so a
--      context item can hold one such list per scope.
--
-- is_active is deliberately NOT set on the kinds here: content_ir.set_kind_activation
-- is the ONE write path for it and it runs the dual gate. Run
-- `tsx scripts/shape/activate-kinds.ts list_change_proposal_v1 --apply` after this.


-- ── list_change_proposal_v1 ─────────────────────────────────────────────────────────────
insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   emitted_fingerprint, is_active, organization_id, visibility, metadata)
select
  'list_change_proposal_v1',
  $LCP$Proposed Changes to a List$LCP$,
  'ts',
  $LCP$[{"name":"target","required":true,"description":"Which list these changes are for.","type":"object"},{"name":"summary","required":true,"description":"One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself.","type":"string"},{"name":"proposals","required":true,"description":"The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer.","type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$LCP$::jsonb,
  $LCP${"type":"object","properties":{"target":{"$ref":"#/$defs/list_change_target_v1","description":"Which list these changes are for."},"summary":{"type":"string","description":"One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself."},"proposals":{"type":"array","items":{"$ref":"#/$defs/list_change_proposal_item_v1"},"description":"The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_v1"}},"required":["__kind","target","summary","proposals"],"additionalProperties":false,"$defs":{"list_change_target_v1":{"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false},"list_change_proposal_item_v1":{"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}}}$LCP$::jsonb,
  $LCP${"type":"object","properties":{"target":{"$ref":"#/$defs/list_change_target_v1","description":"Which list these changes are for."},"summary":{"type":"string","description":"One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself."},"proposals":{"type":"array","items":{"$ref":"#/$defs/list_change_proposal_item_v1"},"description":"The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_v1"}},"required":["__kind","target","summary","proposals"],"additionalProperties":false,"$defs":{"list_change_target_v1":{"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false},"list_change_proposal_item_v1":{"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}}}$LCP$::jsonb,
  '2n0-1h3h1psx7fu9i',
  false,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'public'::platform.visibility,
  $LCP${"family": "platform", "category": "interaction", "direction": "output", "generated": false, "source_name": "platform.list_change_proposals", "activation_note": "the proposed-changes-to-a-list primitive"}$LCP$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
   where kind = 'list_change_proposal_v1' and deleted_at is null);

update content_ir.kind_definition
   set label = $LCP$Proposed Changes to a List$LCP$,
       authoring_owner = 'ts',
       data = $LCP$[{"name":"target","required":true,"description":"Which list these changes are for.","type":"object"},{"name":"summary","required":true,"description":"One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself.","type":"string"},{"name":"proposals","required":true,"description":"The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer.","type":"array"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$LCP$::jsonb,
       emitted_block_schema = $LCP${"type":"object","properties":{"target":{"$ref":"#/$defs/list_change_target_v1","description":"Which list these changes are for."},"summary":{"type":"string","description":"One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself."},"proposals":{"type":"array","items":{"$ref":"#/$defs/list_change_proposal_item_v1"},"description":"The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_v1"}},"required":["__kind","target","summary","proposals"],"additionalProperties":false,"$defs":{"list_change_target_v1":{"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false},"list_change_proposal_item_v1":{"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}}}$LCP$::jsonb,
       emitted_json_schema = $LCP${"type":"object","properties":{"target":{"$ref":"#/$defs/list_change_target_v1","description":"Which list these changes are for."},"summary":{"type":"string","description":"One line a person reads before deciding — what you are proposing and why, overall. Never restate the list itself."},"proposals":{"type":"array","items":{"$ref":"#/$defs/list_change_proposal_item_v1"},"description":"The proposed changes, one per row. Propose only what actually changes; an empty array is a real answer."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_v1"}},"required":["__kind","target","summary","proposals"],"additionalProperties":false,"$defs":{"list_change_target_v1":{"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false},"list_change_proposal_item_v1":{"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}}}$LCP$::jsonb,
       emitted_fingerprint = '2n0-1h3h1psx7fu9i'
 where kind = 'list_change_proposal_v1' and deleted_at is null
   and emitted_fingerprint is distinct from '2n0-1h3h1psx7fu9i';


-- ── list_change_proposal_item_v1 ─────────────────────────────────────────────────────────────
insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   emitted_fingerprint, is_active, organization_id, visibility, metadata)
select
  'list_change_proposal_item_v1',
  $LCP$Proposed List Change$LCP$,
  'ts',
  $LCP$[{"name":"id","required":true,"description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one.","type":"string"},{"name":"action","required":true,"description":"add a new row, remove an existing one, or update one in place.","type":"enum","values":["add","remove","update"]},{"name":"title","required":true,"description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list.","type":"string"},{"name":"reason","required":true,"description":"One sentence on why. Not a paragraph, not a restatement of the row.","type":"string"},{"name":"values","nullable":true,"description":"add only: the new row's values, keyed by the list's own column names.","type":"inline_object","fields":[],"open":true},{"name":"row_id","nullable":true,"description":"remove and update only: the id of the row already in the list.","type":"string"},{"name":"patch","nullable":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept.","type":"inline_object","fields":[],"open":true},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$LCP$::jsonb,
  $LCP${"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}$LCP$::jsonb,
  $LCP${"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}$LCP$::jsonb,
  '148-1jitceznu4mxd',
  false,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'public'::platform.visibility,
  $LCP${"family": "platform", "category": "interaction", "direction": "output", "generated": false, "source_name": "platform.list_change_proposals", "activation_note": "the proposed-changes-to-a-list primitive"}$LCP$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
   where kind = 'list_change_proposal_item_v1' and deleted_at is null);

update content_ir.kind_definition
   set label = $LCP$Proposed List Change$LCP$,
       authoring_owner = 'ts',
       data = $LCP$[{"name":"id","required":true,"description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one.","type":"string"},{"name":"action","required":true,"description":"add a new row, remove an existing one, or update one in place.","type":"enum","values":["add","remove","update"]},{"name":"title","required":true,"description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list.","type":"string"},{"name":"reason","required":true,"description":"One sentence on why. Not a paragraph, not a restatement of the row.","type":"string"},{"name":"values","nullable":true,"description":"add only: the new row's values, keyed by the list's own column names.","type":"inline_object","fields":[],"open":true},{"name":"row_id","nullable":true,"description":"remove and update only: the id of the row already in the list.","type":"string"},{"name":"patch","nullable":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept.","type":"inline_object","fields":[],"open":true},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$LCP$::jsonb,
       emitted_block_schema = $LCP${"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}$LCP$::jsonb,
       emitted_json_schema = $LCP${"type":"object","properties":{"id":{"type":"string","description":"A short id unique within this message, so a decision can be remembered against it. Never reuse one."},"action":{"type":"string","enum":["add","remove","update"],"description":"add a new row, remove an existing one, or update one in place."},"title":{"type":"string","description":"One line naming what changes, as the person would say it. For remove and update this is the row's CURRENT title, so the person recognises it without opening the list."},"reason":{"type":"string","description":"One sentence on why. Not a paragraph, not a restatement of the row."},"values":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"add only: the new row's values, keyed by the list's own column names."},"row_id":{"type":["string","null"],"description":"remove and update only: the id of the row already in the list."},"patch":{"type":["object","null"],"properties":{},"required":[],"additionalProperties":true,"description":"update only: just the columns that change, keyed by the list's own column names. Columns you leave out are kept."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_proposal_item_v1"}},"required":["__kind","id","action","title","reason"],"additionalProperties":false}$LCP$::jsonb,
       emitted_fingerprint = '148-1jitceznu4mxd'
 where kind = 'list_change_proposal_item_v1' and deleted_at is null
   and emitted_fingerprint is distinct from '148-1jitceznu4mxd';


-- ── list_change_target_v1 ─────────────────────────────────────────────────────────────
insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   emitted_fingerprint, is_active, organization_id, visibility, metadata)
select
  'list_change_target_v1',
  $LCP$List Change Target$LCP$,
  'ts',
  $LCP$[{"name":"kind","required":true,"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store.","type":"enum","values":["scope_dataset","table"]},{"name":"context_item_id","nullable":true,"description":"scope_dataset only: the context item that holds the list.","type":"string"},{"name":"scope_id","nullable":true,"description":"scope_dataset only: the scope whose copy of the list this is.","type":"string"},{"name":"table_id","nullable":true,"description":"table only: the Table being changed.","type":"string"},{"name":"home_record_id","nullable":true,"description":"table only: the Record the Table is homed in.","type":"string"},{"name":"label","nullable":true,"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'.","type":"string"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$LCP$::jsonb,
  $LCP${"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false}$LCP$::jsonb,
  $LCP${"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false}$LCP$::jsonb,
  'uy-b8x9d5xxracr',
  false,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'public'::platform.visibility,
  $LCP${"family": "platform", "category": "interaction", "direction": "output", "generated": false, "source_name": "platform.list_change_proposals", "activation_note": "the proposed-changes-to-a-list primitive"}$LCP$::jsonb
where not exists (
  select 1 from content_ir.kind_definition
   where kind = 'list_change_target_v1' and deleted_at is null);

update content_ir.kind_definition
   set label = $LCP$List Change Target$LCP$,
       authoring_owner = 'ts',
       data = $LCP$[{"name":"kind","required":true,"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store.","type":"enum","values":["scope_dataset","table"]},{"name":"context_item_id","nullable":true,"description":"scope_dataset only: the context item that holds the list.","type":"string"},{"name":"scope_id","nullable":true,"description":"scope_dataset only: the scope whose copy of the list this is.","type":"string"},{"name":"table_id","nullable":true,"description":"table only: the Table being changed.","type":"string"},{"name":"home_record_id","nullable":true,"description":"table only: the Record the Table is homed in.","type":"string"},{"name":"label","nullable":true,"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'.","type":"string"},{"name":"additionalDetails","type":"inline_object","fields":[],"open":true}]$LCP$::jsonb,
       emitted_block_schema = $LCP${"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false}$LCP$::jsonb,
       emitted_json_schema = $LCP${"type":"object","properties":{"kind":{"type":"string","enum":["scope_dataset","table"],"description":"Which kind of list this is. scope_dataset = a table held per scope by a context item (today). table = a Table homed in a Record in the unified record store."},"context_item_id":{"type":["string","null"],"description":"scope_dataset only: the context item that holds the list."},"scope_id":{"type":["string","null"],"description":"scope_dataset only: the scope whose copy of the list this is."},"table_id":{"type":["string","null"],"description":"table only: the Table being changed."},"home_record_id":{"type":["string","null"],"description":"table only: the Record the Table is homed in."},"label":{"type":["string","null"],"description":"What to call this list on screen, in the person's words — e.g. 'Known defects in matrx-frontend'."},"additionalDetails":{"type":"object","properties":{},"required":[],"additionalProperties":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","const":"list_change_target_v1"}},"required":["__kind","kind"],"additionalProperties":false}$LCP$::jsonb,
       emitted_fingerprint = 'uy-b8x9d5xxracr'
 where kind = 'list_change_target_v1' and deleted_at is null
   and emitted_fingerprint is distinct from 'uy-b8x9d5xxracr';


insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'target', c.id, null, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition p, content_ir.kind_definition c
 where p.kind = 'list_change_proposal_v1' and p.deleted_at is null
   and c.kind = 'list_change_target_v1' and c.deleted_at is null
on conflict (parent_definition_id, field_name, child_definition_id) do nothing;


insert into content_ir.kind_edge
  (parent_definition_id, field_name, child_definition_id, position, organization_id)
select p.id, 'proposals', c.id, 0, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition p, content_ir.kind_definition c
 where p.kind = 'list_change_proposal_v1' and p.deleted_at is null
   and c.kind = 'list_change_proposal_item_v1' and c.deleted_at is null
on conflict (parent_definition_id, field_name, child_definition_id) do nothing;


insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, organization_id)
select d.id, d.version, $LCP${"__kind": "list_change_proposal_v1", "target": {"__kind": "list_change_target_v1", "kind": "scope_dataset", "context_item_id": "3f1a0c84-9f1e-4d4a-9b2f-1c7a5f2e9c01", "scope_id": "b7d2e5aa-0c11-4f3d-8a6e-9d4c2b1f7e20", "table_id": null, "home_record_id": null, "label": "Known defects in matrx-frontend"}, "summary": "Two things came up in this conversation that the list does not have, and one on it is fixed.", "proposals": [{"__kind": "list_change_proposal_item_v1", "id": "p1", "action": "add", "title": "The scroll chain breaks on the notes list at tablet width", "reason": "You described it twice today and nothing on the list covers it.", "values": {"title": "The scroll chain breaks on the notes list at tablet width", "detail": "Between 768px and 1024px the notes list scrolls the page instead of the panel, so the header leaves the screen.", "area": "notes", "severity": "medium", "status": "open", "first_seen": "2026-09-18"}, "row_id": null, "patch": null}, {"__kind": "list_change_proposal_item_v1", "id": "p2", "action": "remove", "title": "Agent picker shows archived agents", "reason": "You said this shipped last week, so it is no longer a known defect.", "values": null, "row_id": "6c9e1b40-7d55-4a12-93cf-2f0a8e5d4b31", "patch": null}, {"__kind": "list_change_proposal_item_v1", "id": "p3", "action": "update", "title": "File upload fails silently over 25MB", "reason": "You called this the one that keeps biting you, which the list has as low.", "values": null, "row_id": "0a4f77e2-3b18-4c90-8e77-5d3f1a6c8b52", "patch": {"severity": "high"}}]}$LCP$::jsonb,
       $LCP$Known defects — three proposed changes$LCP$,
       $LCP$The canonical sample: one add, one remove and one update against a scope-held list.$LCP$,
       'authored', true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition d
 where d.kind = 'list_change_proposal_v1' and d.deleted_at is null
on conflict (kind_definition_id, kind_version) where (is_canonical and deleted_at is null)
do update set data = excluded.data, label = excluded.label, description = excluded.description;


insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, organization_id)
select d.id, d.version, $LCP${"__kind": "list_change_proposal_item_v1", "id": "p1", "action": "add", "title": "The scroll chain breaks on the notes list at tablet width", "reason": "You described it twice today and nothing on the list covers it.", "values": {"title": "The scroll chain breaks on the notes list at tablet width", "area": "notes", "severity": "medium", "status": "open"}, "row_id": null, "patch": null}$LCP$::jsonb,
       $LCP$Known defects — three proposed changes$LCP$,
       $LCP$The canonical sample: one add, one remove and one update against a scope-held list.$LCP$,
       'authored', true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition d
 where d.kind = 'list_change_proposal_item_v1' and d.deleted_at is null
on conflict (kind_definition_id, kind_version) where (is_canonical and deleted_at is null)
do update set data = excluded.data, label = excluded.label, description = excluded.description;


insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, description, source, is_canonical, organization_id)
select d.id, d.version, $LCP${"__kind": "list_change_target_v1", "kind": "scope_dataset", "context_item_id": "3f1a0c84-9f1e-4d4a-9b2f-1c7a5f2e9c01", "scope_id": "b7d2e5aa-0c11-4f3d-8a6e-9d4c2b1f7e20", "table_id": null, "home_record_id": null, "label": "Known defects in matrx-frontend"}$LCP$::jsonb,
       $LCP$Known defects — three proposed changes$LCP$,
       $LCP$The canonical sample: one add, one remove and one update against a scope-held list.$LCP$,
       'authored', true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  from content_ir.kind_definition d
 where d.kind = 'list_change_target_v1' and d.deleted_at is null
on conflict (kind_definition_id, kind_version) where (is_canonical and deleted_at is null)
do update set data = excluded.data, label = excluded.label, description = excluded.description;


-- ── the skill that teaches ANY agent this kind ─────────────────────────
insert into skill.definition
  (skill_id, label, description, skill_type, body, icon_name, platform_targets,
   semver, category_id, is_active, is_system, organization_id, visibility)
select 'kind_list_change_proposal',
       'Proposed Changes to a List',
       'Emit proposed additions, removals and edits to a list the person gave you, so they can accept or reject each one inside the conversation.',
       'render_block'::public.skl_skill_type,
       $LCP$# Proposed changes to a list

You are often given a LIST as one of your inputs — a repository's known defects, a client's
do-not-contact names, a brand's banned words, an org's approved vendors. While you work, you
will notice that the list is wrong: something belongs on it that is not there, something on it
is finished, something on it is described badly.

Do not tell the person in prose and ask them to go and edit it. **Emit a
`list_change_proposal_v1` block.** It renders in your message as one row per proposed change
with Accept and Reject on each, and a click writes straight into the list. The next
conversation is given the corrected list.

## When to emit it

Emit it when ALL of these are true:

- You were given a list (as a variable, a context value, or a table in your context).
- You can name a specific change to it, with a reason from THIS conversation.
- The change is about the list's content, not about what the person should do next.

Do NOT emit it:

- To confirm the list is fine. Say so in one sentence, or say nothing.
- To restate the list. The person is looking at the same list you are.
- For something you merely suspect. A proposal you cannot justify in one sentence is not a
  proposal, it is noise, and it trains the person to stop reading them.
- More than once per turn for the same list. One block, every change in it.

## The exact structure

One fenced ```json block. Nothing else in the fence.

```json
{
  "__kind": "list_change_proposal_v1",
  "target": {
    "__kind": "list_change_target_v1",
    "kind": "scope_dataset",
    "context_item_id": "<copy from the list you were given>",
    "scope_id": "<copy from the list you were given>",
    "label": "Known defects in matrx-frontend"
  },
  "summary": "Two things came up today that the list does not have, and one on it is fixed.",
  "proposals": [
    {
      "__kind": "list_change_proposal_item_v1",
      "id": "p1",
      "action": "add",
      "title": "The scroll chain breaks on the notes list at tablet width",
      "reason": "You described it twice today and nothing on the list covers it.",
      "values": {
        "title": "The scroll chain breaks on the notes list at tablet width",
        "detail": "Between 768px and 1024px the page scrolls instead of the panel.",
        "area": "notes",
        "severity": "medium",
        "status": "open",
        "first_seen": "2026-09-18"
      }
    },
    {
      "__kind": "list_change_proposal_item_v1",
      "id": "p2",
      "action": "remove",
      "title": "Agent picker shows archived agents",
      "reason": "You said this shipped last week, so it is no longer a known defect.",
      "row_id": "6c9e1b40-7d55-4a12-93cf-2f0a8e5d4b31"
    },
    {
      "__kind": "list_change_proposal_item_v1",
      "id": "p3",
      "action": "update",
      "title": "File upload fails silently over 25MB",
      "reason": "You called this the one that keeps biting you; the list has it as low.",
      "row_id": "0a4f77e2-3b18-4c90-8e77-5d3f1a6c8b52",
      "patch": { "severity": "high" }
    }
  ]
}
```

## The rules that make it work

**1. `target` is COPIED, never invented.** The list you were given carries its own address.
Copy it exactly. If you cannot find the address, you were not given a list you can propose
changes to — say that in a sentence instead of guessing ids. A fabricated id renders a block
that refuses on every click.

**2. `id` is unique within the message and never reused.** It is the key the person's decision
is remembered under. Reusing one across two proposals loses a decision.

**3. `title` is what the PERSON sees, and for `remove` and `update` it is the row's CURRENT
title.** The person must recognise the row from your line alone, without opening the list.

**4. `reason` is ONE sentence, from this conversation.** "You described it twice today" is a
reason. "This is a common issue" is not.

**5. Each action carries exactly its own fields.**

| action   | carries                             | never carries      |
|----------|-------------------------------------|--------------------|
| `add`    | `values` (all the list's columns)   | `row_id`, `patch`  |
| `remove` | `row_id`                            | `values`, `patch`  |
| `update` | `row_id` + `patch` (changed columns only) | `values`     |

An `add` whose `values` is empty, a `remove` with no `row_id`, or an `update` with an empty
`patch` is dropped from the block and shown to the person as unreadable. Nothing is silently
swallowed — but nothing broken is applied either.

**6. `values` and `patch` use the LIST'S OWN column names**, exactly as the list gave them to
you. A key the list does not have is stored and then never read.

**7. Never restate the list, and never repeat a proposal the person already rejected.** If you
can see that a row is already there, do not propose adding it — the block will say "already on
the list", which reads as though you did not look.

**8. `summary` is one line about the SET, not a list of the proposals.** The proposals are
right below it.

## What happens after you emit it

Each row gets Accept and Reject. Accepting writes to the list under the PERSON'S OWN
authority — if they may not edit that list, the row says so in the store's own words and
nothing changes. Rejecting records the decision and changes nothing. Both survive a reload.

Accepting a `remove` DELETES the row outright, so the person is asked to confirm it first.
That is expected; do not apologise for it or work around it.

You will not be told the outcome inside the same turn. Do not wait for it, do not ask "did you
accept those?", and do not re-emit the block. The next conversation is given the updated list —
that IS the feedback.
$LCP$,
       'ListChecks',
       '["web"]'::jsonb,
       '1.0.0',
       '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid,
       true, true,
       '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       'public'::platform.visibility
where not exists (
  select 1 from skill.definition
   where skill_id = 'kind_list_change_proposal' and deleted_at is null);

update skill.definition
   set body = $LCP$# Proposed changes to a list

You are often given a LIST as one of your inputs — a repository's known defects, a client's
do-not-contact names, a brand's banned words, an org's approved vendors. While you work, you
will notice that the list is wrong: something belongs on it that is not there, something on it
is finished, something on it is described badly.

Do not tell the person in prose and ask them to go and edit it. **Emit a
`list_change_proposal_v1` block.** It renders in your message as one row per proposed change
with Accept and Reject on each, and a click writes straight into the list. The next
conversation is given the corrected list.

## When to emit it

Emit it when ALL of these are true:

- You were given a list (as a variable, a context value, or a table in your context).
- You can name a specific change to it, with a reason from THIS conversation.
- The change is about the list's content, not about what the person should do next.

Do NOT emit it:

- To confirm the list is fine. Say so in one sentence, or say nothing.
- To restate the list. The person is looking at the same list you are.
- For something you merely suspect. A proposal you cannot justify in one sentence is not a
  proposal, it is noise, and it trains the person to stop reading them.
- More than once per turn for the same list. One block, every change in it.

## The exact structure

One fenced ```json block. Nothing else in the fence.

```json
{
  "__kind": "list_change_proposal_v1",
  "target": {
    "__kind": "list_change_target_v1",
    "kind": "scope_dataset",
    "context_item_id": "<copy from the list you were given>",
    "scope_id": "<copy from the list you were given>",
    "label": "Known defects in matrx-frontend"
  },
  "summary": "Two things came up today that the list does not have, and one on it is fixed.",
  "proposals": [
    {
      "__kind": "list_change_proposal_item_v1",
      "id": "p1",
      "action": "add",
      "title": "The scroll chain breaks on the notes list at tablet width",
      "reason": "You described it twice today and nothing on the list covers it.",
      "values": {
        "title": "The scroll chain breaks on the notes list at tablet width",
        "detail": "Between 768px and 1024px the page scrolls instead of the panel.",
        "area": "notes",
        "severity": "medium",
        "status": "open",
        "first_seen": "2026-09-18"
      }
    },
    {
      "__kind": "list_change_proposal_item_v1",
      "id": "p2",
      "action": "remove",
      "title": "Agent picker shows archived agents",
      "reason": "You said this shipped last week, so it is no longer a known defect.",
      "row_id": "6c9e1b40-7d55-4a12-93cf-2f0a8e5d4b31"
    },
    {
      "__kind": "list_change_proposal_item_v1",
      "id": "p3",
      "action": "update",
      "title": "File upload fails silently over 25MB",
      "reason": "You called this the one that keeps biting you; the list has it as low.",
      "row_id": "0a4f77e2-3b18-4c90-8e77-5d3f1a6c8b52",
      "patch": { "severity": "high" }
    }
  ]
}
```

## The rules that make it work

**1. `target` is COPIED, never invented.** The list you were given carries its own address.
Copy it exactly. If you cannot find the address, you were not given a list you can propose
changes to — say that in a sentence instead of guessing ids. A fabricated id renders a block
that refuses on every click.

**2. `id` is unique within the message and never reused.** It is the key the person's decision
is remembered under. Reusing one across two proposals loses a decision.

**3. `title` is what the PERSON sees, and for `remove` and `update` it is the row's CURRENT
title.** The person must recognise the row from your line alone, without opening the list.

**4. `reason` is ONE sentence, from this conversation.** "You described it twice today" is a
reason. "This is a common issue" is not.

**5. Each action carries exactly its own fields.**

| action   | carries                             | never carries      |
|----------|-------------------------------------|--------------------|
| `add`    | `values` (all the list's columns)   | `row_id`, `patch`  |
| `remove` | `row_id`                            | `values`, `patch`  |
| `update` | `row_id` + `patch` (changed columns only) | `values`     |

An `add` whose `values` is empty, a `remove` with no `row_id`, or an `update` with an empty
`patch` is dropped from the block and shown to the person as unreadable. Nothing is silently
swallowed — but nothing broken is applied either.

**6. `values` and `patch` use the LIST'S OWN column names**, exactly as the list gave them to
you. A key the list does not have is stored and then never read.

**7. Never restate the list, and never repeat a proposal the person already rejected.** If you
can see that a row is already there, do not propose adding it — the block will say "already on
the list", which reads as though you did not look.

**8. `summary` is one line about the SET, not a list of the proposals.** The proposals are
right below it.

## What happens after you emit it

Each row gets Accept and Reject. Accepting writes to the list under the PERSON'S OWN
authority — if they may not edit that list, the row says so in the store's own words and
nothing changes. Rejecting records the decision and changes nothing. Both survive a reload.

Accepting a `remove` DELETES the row outright, so the person is asked to confirm it first.
That is expected; do not apologise for it or work around it.

You will not be told the outcome inside the same turn. Do not wait for it, do not ask "did you
accept those?", and do not re-emit the block. The next conversation is given the updated list —
that IS the feedback.
$LCP$,
       label = 'Proposed Changes to a List',
       skill_type = 'render_block'::public.skl_skill_type,
       is_system = true,
       category_id = '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid,
       visibility = 'public'::platform.visibility
 where skill_id = 'kind_list_change_proposal' and deleted_at is null;


insert into skill.render_definition
  (block_id, label, description, icon_name, template, block_type, sort_order,
   is_active, skill_id, category_id, organization_id, visibility)
select 'list-change-proposals-general', $LCP$Propose changes to my list$LCP$, $LCP$Let the agent offer additions, removals and edits to a list it was given, for the person to accept or reject in the conversation.$LCP$, 'ListChecks',
       $LCP$When a list is one of your inputs and you notice it is wrong, do not tell me in prose — emit a proposed-changes block so I can accept or reject each item right here:

```json
{"__kind":"list_change_proposal_v1","target":{"__kind":"list_change_target_v1","kind":"scope_dataset","context_item_id":"<copy from the list>","scope_id":"<copy from the list>","label":"<what I call the list>"},"summary":"<one line about the set>","proposals":[{"__kind":"list_change_proposal_item_v1","id":"p1","action":"add","title":"<one line I will recognise>","reason":"<one sentence, from this conversation>","values":{"<the list's own column names>":"<value>"}}]}
```

- Copy `target` from the list I gave you; never invent ids.
- `add` carries `values`; `remove` carries `row_id`; `update` carries `row_id` and `patch`.
- One sentence of reason each, from this conversation. Never restate the list.
- Emit nothing when the list is already right.$LCP$, 'markdown', 10, true,
       (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null),
       '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility
where not exists (
  select 1 from skill.render_definition
   where block_id = 'list-change-proposals-general' and deleted_at is null);

update skill.render_definition
   set label = $LCP$Propose changes to my list$LCP$, description = $LCP$Let the agent offer additions, removals and edits to a list it was given, for the person to accept or reject in the conversation.$LCP$,
       template = $LCP$When a list is one of your inputs and you notice it is wrong, do not tell me in prose — emit a proposed-changes block so I can accept or reject each item right here:

```json
{"__kind":"list_change_proposal_v1","target":{"__kind":"list_change_target_v1","kind":"scope_dataset","context_item_id":"<copy from the list>","scope_id":"<copy from the list>","label":"<what I call the list>"},"summary":"<one line about the set>","proposals":[{"__kind":"list_change_proposal_item_v1","id":"p1","action":"add","title":"<one line I will recognise>","reason":"<one sentence, from this conversation>","values":{"<the list's own column names>":"<value>"}}]}
```

- Copy `target` from the list I gave you; never invent ids.
- `add` carries `values`; `remove` carries `row_id`; `update` carries `row_id` and `patch`.
- One sentence of reason each, from this conversation. Never restate the list.
- Emit nothing when the list is already right.$LCP$, icon_name = 'ListChecks',
       category_id = '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, is_active = true,
       skill_id = (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null)
 where block_id = 'list-change-proposals-general' and deleted_at is null;


insert into skill.render_definition
  (block_id, label, description, icon_name, template, block_type, sort_order,
   is_active, skill_id, category_id, organization_id, visibility)
select 'list-change-proposals-known-defects', $LCP$Keep my known-defects list current$LCP$, $LCP$The agent proposes additions and removals to the known-defects list for the repository or product area in context.$LCP$, 'Bug',
       $LCP$You are given this scope's known defects. Treat them as already known: never re-report one to me.

When this conversation reveals a defect that is NOT on the list, or shows that one on the list is fixed or mis-described, end your message with a proposed-changes block so I can accept or reject each one here:

```json
{"__kind":"list_change_proposal_v1","target":{"__kind":"list_change_target_v1","kind":"scope_dataset","context_item_id":"<copy from the list>","scope_id":"<copy from the list>","label":"Known defects"},"summary":"<one line>","proposals":[{"__kind":"list_change_proposal_item_v1","id":"p1","action":"add","title":"<the defect in one line>","reason":"<why it belongs, from this conversation>","values":{"title":"...","detail":"...","area":"...","severity":"medium","status":"open","first_seen":"<today>"}},{"__kind":"list_change_proposal_item_v1","id":"p2","action":"remove","title":"<the row's current title>","reason":"<why it is no longer a defect>","row_id":"<the row's id>"}]}
```

Propose nothing when nothing changed.$LCP$, 'markdown', 20, true,
       (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null),
       '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility
where not exists (
  select 1 from skill.render_definition
   where block_id = 'list-change-proposals-known-defects' and deleted_at is null);

update skill.render_definition
   set label = $LCP$Keep my known-defects list current$LCP$, description = $LCP$The agent proposes additions and removals to the known-defects list for the repository or product area in context.$LCP$,
       template = $LCP$You are given this scope's known defects. Treat them as already known: never re-report one to me.

When this conversation reveals a defect that is NOT on the list, or shows that one on the list is fixed or mis-described, end your message with a proposed-changes block so I can accept or reject each one here:

```json
{"__kind":"list_change_proposal_v1","target":{"__kind":"list_change_target_v1","kind":"scope_dataset","context_item_id":"<copy from the list>","scope_id":"<copy from the list>","label":"Known defects"},"summary":"<one line>","proposals":[{"__kind":"list_change_proposal_item_v1","id":"p1","action":"add","title":"<the defect in one line>","reason":"<why it belongs, from this conversation>","values":{"title":"...","detail":"...","area":"...","severity":"medium","status":"open","first_seen":"<today>"}},{"__kind":"list_change_proposal_item_v1","id":"p2","action":"remove","title":"<the row's current title>","reason":"<why it is no longer a defect>","row_id":"<the row's id>"}]}
```

Propose nothing when nothing changed.$LCP$, icon_name = 'Bug',
       category_id = '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, is_active = true,
       skill_id = (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null)
 where block_id = 'list-change-proposals-known-defects' and deleted_at is null;


insert into skill.render_definition
  (block_id, label, description, icon_name, template, block_type, sort_order,
   is_active, skill_id, category_id, organization_id, visibility)
select 'list-change-proposals-additions-only', $LCP$Only propose additions to my list$LCP$, $LCP$A narrower version: the agent may propose adding rows, but never removing or editing existing ones.$LCP$, 'ListPlus',
       $LCP$You may propose ADDITIONS to the list you were given, and nothing else — never a removal, never an edit. Emit them as a proposed-changes block so I can accept or reject each one here:

```json
{"__kind":"list_change_proposal_v1","target":{"__kind":"list_change_target_v1","kind":"scope_dataset","context_item_id":"<copy from the list>","scope_id":"<copy from the list>","label":"<what I call the list>"},"summary":"<one line>","proposals":[{"__kind":"list_change_proposal_item_v1","id":"p1","action":"add","title":"<one line I will recognise>","reason":"<one sentence, from this conversation>","values":{"<the list's own column names>":"<value>"}}]}
```

If something on the list looks wrong, say so in one sentence instead of proposing a change to it.$LCP$, 'markdown', 30, true,
       (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null),
       '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility
where not exists (
  select 1 from skill.render_definition
   where block_id = 'list-change-proposals-additions-only' and deleted_at is null);

update skill.render_definition
   set label = $LCP$Only propose additions to my list$LCP$, description = $LCP$A narrower version: the agent may propose adding rows, but never removing or editing existing ones.$LCP$,
       template = $LCP$You may propose ADDITIONS to the list you were given, and nothing else — never a removal, never an edit. Emit them as a proposed-changes block so I can accept or reject each one here:

```json
{"__kind":"list_change_proposal_v1","target":{"__kind":"list_change_target_v1","kind":"scope_dataset","context_item_id":"<copy from the list>","scope_id":"<copy from the list>","label":"<what I call the list>"},"summary":"<one line>","proposals":[{"__kind":"list_change_proposal_item_v1","id":"p1","action":"add","title":"<one line I will recognise>","reason":"<one sentence, from this conversation>","values":{"<the list's own column names>":"<value>"}}]}
```

If something on the list looks wrong, say so in one sentence instead of proposing a change to it.$LCP$, icon_name = 'ListPlus',
       category_id = '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, is_active = true,
       skill_id = (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null)
 where block_id = 'list-change-proposals-additions-only' and deleted_at is null;


insert into skill.render_definition
  (block_id, label, description, icon_name, template, block_type, sort_order,
   is_active, skill_id, category_id, organization_id, visibility)
select 'list-change-proposals-never-repeat', $LCP$Never re-report what my list already has$LCP$, $LCP$Pairs with any list: the agent treats the list as known, stays quiet about it, and only speaks up to propose a change.$LCP$, 'EyeOff',
       $LCP$The list you were given is ALREADY KNOWN to me. Do not summarise it, do not repeat items from it, and do not raise one of them as if it were new — that is the single most annoying thing you can do with it.

The only time you mention the list at all is to propose a change to it, as a `list_change_proposal_v1` block, with one sentence of reason per proposal drawn from this conversation. Silence about the list is the correct default.$LCP$, 'markdown', 40, true,
       (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null),
       '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility
where not exists (
  select 1 from skill.render_definition
   where block_id = 'list-change-proposals-never-repeat' and deleted_at is null);

update skill.render_definition
   set label = $LCP$Never re-report what my list already has$LCP$, description = $LCP$Pairs with any list: the agent treats the list as known, stays quiet about it, and only speaks up to propose a change.$LCP$,
       template = $LCP$The list you were given is ALREADY KNOWN to me. Do not summarise it, do not repeat items from it, and do not raise one of them as if it were new — that is the single most annoying thing you can do with it.

The only time you mention the list at all is to propose a change to it, as a `list_change_proposal_v1` block, with one sentence of reason per proposal drawn from this conversation. Silence about the list is the correct default.$LCP$, icon_name = 'EyeOff',
       category_id = '2c324058-95e9-4b7e-a991-884f4443eb6e'::uuid, is_active = true,
       skill_id = (select id from skill.definition where skill_id = 'kind_list_change_proposal' and deleted_at is null)
 where block_id = 'list-change-proposals-never-repeat' and deleted_at is null;


-- ── the first customer's data: the platform "Known defects" table template ──
-- A template lives in ONE organization (context.provision_scope_dataset refuses
-- a template whose organization_id is not the scope's), so the platform copy is
-- registered in the system organization and an organization that wants the list
-- gets its own copy of these columns the same way the 34 scope templates work.
insert into workbench.udt_dataset_templates (organization_id, name, description, version, is_active)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'Known defects',
       'One row per known defect in a repository, product area or site — the list an agent is given so it stops re-reporting what you already know.',
       1, true
where not exists (
  select 1 from workbench.udt_dataset_templates
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(name) = 'known defects' and is_active);


insert into workbench.udt_dataset_template_fields
  (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules)
select t.id, 'title', $LCP$Title$LCP$, 'string'::public.field_data_type, 0, true,
       $LCP${"description": "The defect in one line, as a person would say it."}$LCP$::jsonb
  from workbench.udt_dataset_templates t
 where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(t.name) = 'known defects' and t.is_active
on conflict (template_id, field_name) do nothing;


insert into workbench.udt_dataset_template_fields
  (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules)
select t.id, 'detail', $LCP$Detail$LCP$, 'string'::public.field_data_type, 1, false,
       $LCP${"description": "What happens, where, and what it should do instead."}$LCP$::jsonb
  from workbench.udt_dataset_templates t
 where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(t.name) = 'known defects' and t.is_active
on conflict (template_id, field_name) do nothing;


insert into workbench.udt_dataset_template_fields
  (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules)
select t.id, 'area', $LCP$Area$LCP$, 'string'::public.field_data_type, 2, false,
       $LCP${"description": "The part of the system it lives in."}$LCP$::jsonb
  from workbench.udt_dataset_templates t
 where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(t.name) = 'known defects' and t.is_active
on conflict (template_id, field_name) do nothing;


insert into workbench.udt_dataset_template_fields
  (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules)
select t.id, 'severity', $LCP$Severity$LCP$, 'string'::public.field_data_type, 3, false,
       $LCP${"description": "low, medium, high or blocking."}$LCP$::jsonb
  from workbench.udt_dataset_templates t
 where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(t.name) = 'known defects' and t.is_active
on conflict (template_id, field_name) do nothing;


insert into workbench.udt_dataset_template_fields
  (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules)
select t.id, 'status', $LCP$Status$LCP$, 'string'::public.field_data_type, 4, false,
       $LCP${"description": "open, fixed or wont_fix."}$LCP$::jsonb
  from workbench.udt_dataset_templates t
 where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(t.name) = 'known defects' and t.is_active
on conflict (template_id, field_name) do nothing;


insert into workbench.udt_dataset_template_fields
  (template_id, field_name, display_name, data_type, field_order, is_required, validation_rules)
select t.id, 'first_seen', $LCP$First seen$LCP$, 'date'::public.field_data_type, 5, false,
       $LCP${"description": "The day it was first noticed."}$LCP$::jsonb
  from workbench.udt_dataset_templates t
 where t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and lower(t.name) = 'known defects' and t.is_active
on conflict (template_id, field_name) do nothing;

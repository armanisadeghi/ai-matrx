-- Seed: workflow-I/O kinds (5 generic pass-through + 5 structural node outputs).
-- Schemas derived from the matrx-graph pydantic models (model_json_schema()); examples
-- validated with Draft202012Validator before this seed was written. Idempotent.

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'json', 'JSON (any value)', 'python', null, $mtx${}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":true,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='json' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"anything":true,"nested":[1,"two"]}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='json' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'text', 'Text', 'python', null, $mtx${"type":"string"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":true,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='text' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx$"hello world"$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='text' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'number', 'Number', 'python', null, $mtx${"type":"number"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":true,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='number' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx$42.5$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='number' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'boolean', 'Boolean', 'python', null, $mtx${"type":"boolean"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":true,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='boolean' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx$true$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='boolean' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'string_list', 'String List', 'python', null, $mtx${"type":"array","items":{"type":"string"}}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":true,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='string_list' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx$["alpha","beta"]$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='string_list' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'http_response', 'HTTP Response', 'python', null, $mtx${"additionalProperties":false,"description":"Canonical HTTP response shape emitted by http.* nodes.\n\n``ok`` is True iff ``200 <= status < 300``. Downstream routing usually\nbranches on ``ok`` via ``data.transform`` or ``control.branch``.","properties":{"ok":{"description":"True iff the response status is 2xx. The field downstream steps branch on for success vs failure.","title":"Ok","type":"boolean"},"status":{"description":"HTTP status code (e.g. 200, 404). 0 when the request failed before any response arrived.","title":"Status","type":"integer"},"url":{"description":"The final URL the request resolved to, after any redirects.","title":"Url","type":"string"},"headers":{"additionalProperties":{"type":"string"},"description":"Response headers, with lower-cased keys.","title":"Headers","type":"object"},"body":{"default":null,"description":"Parsed JSON when the content-type is JSON-like; the decoded text otherwise. Use this for structured downstream steps.","title":"Body"},"text":{"default":"","description":"Raw response body as text, truncated to the max_bytes cap.","title":"Text","type":"string"},"content_type":{"default":"","description":"The response's Content-Type header value.","title":"Content Type","type":"string"},"elapsed_ms":{"default":0,"description":"Wall-clock time for the request, in milliseconds.","title":"Elapsed Ms","type":"integer"},"error":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"description":"Human-readable failure reason when the call errored before or during response receipt; None on success.","title":"Error"}},"required":["ok","status","url"],"title":"HttpResponse","type":"object"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":false,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='http_response' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"ok":true,"status":200,"url":"https://example.com/api","headers":{"content-type":"application/json"},"body":{"message":"hello"},"text":"{\"message\": \"hello\"}","content_type":"application/json","elapsed_ms":123,"error":null}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='http_response' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'regex_extract_result', 'Regex Extract Result', 'python', null, $mtx${"additionalProperties":false,"properties":{"matches":{"description":"All matches \u2014 one entry per match: the full match string (no groups), a dict (named groups), or a list (positional groups). Named groups take precedence if a pattern mixes both.","items":{},"title":"Matches","type":"array"},"count":{"default":0,"description":"How many matches were found.","title":"Count","type":"integer"},"first":{"default":null,"description":"The first match, or null when none \u2014 for a quick found/not-found branch without indexing.","title":"First"}},"title":"RegexExtractOutput","type":"object"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":false,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='regex_extract_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"matches":["alpha","beta"],"count":2,"first":"alpha"}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='regex_extract_result' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'branch_result', 'Branch Result', 'python', null, $mtx${"additionalProperties":true,"properties":{"direction":{"description":"Which handle the run took \u2014 'true' or 'false'.","title":"Direction","type":"string"},"value":{"default":null,"description":"The input value, passed through so downstream steps still receive it.","title":"Value"}},"required":["direction"],"title":"BranchOutput","type":"object"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":false,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='branch_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"direction":"true","value":{"score":0.9}}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='branch_result' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'map_result', 'Map Result', 'python', null, $mtx${"additionalProperties":false,"properties":{"dispatched":{"description":"How many child invocations were dispatched (one per item).","title":"Dispatched","type":"integer"}},"required":["dispatched"],"title":"MapOutput","type":"object"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":false,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='map_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"dispatched":3}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='map_result' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'gather_result', 'Gather Result', 'python', null, $mtx${"additionalProperties":false,"properties":{"values":{"description":"The values collected from the channel.","items":{},"title":"Values","type":"array"},"count":{"default":0,"description":"How many values were gathered.","title":"Count","type":"integer"}},"title":"GatherOutput","type":"object"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":false,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='gather_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"values":[1,2,3],"count":3}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='gather_result' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

insert into content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_json_schema, is_active, visibility, organization_id, metadata)
select 'workflow_run_result', 'Workflow Run Result', 'python', null, $mtx${"additionalProperties":false,"properties":{"success":{"description":"True when the child workflow run completed successfully.","title":"Success","type":"boolean"},"run_id":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"description":"The child run's id (for looking up its events/checkpoints); null if it never started.","title":"Run Id"},"last_outputs":{"additionalProperties":true,"description":"The child run's terminal node outputs, keyed by node id.","title":"Last Outputs","type":"object"},"channel_values":{"additionalProperties":true,"description":"The child run's final channel (shared-state) values, keyed by channel name.","title":"Channel Values","type":"object"},"error":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"description":"The failure reason when success is false; null on success.","title":"Error"}},"required":["success"],"title":"SubgraphCallOutput","type":"object"}$mtx$::jsonb, false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582', '{"family":"workflow_io","generic":false,"category":"pure"}'::jsonb
where not exists (select 1 from content_ir.kind_definition where organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kind='workflow_run_result' and deleted_at is null);

insert into content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical, validation_status, validated_at, organization_id)
select kd.id, kd.version, $mtx${"success":true,"run_id":"d2f8a1c4-0000-4000-8000-000000000000","last_outputs":{"final_node":{"result":"done"}},"channel_values":{},"error":null}$mtx$::jsonb, 'Canonical example', 'authored', true, 'passed', now(), '39c38960-d30c-4840-b0c1-c9960de95582'
from content_ir.kind_definition kd
where kd.organization_id='39c38960-d30c-4840-b0c1-c9960de95582' and kd.kind='workflow_run_result' and kd.deleted_at is null
  and not exists (select 1 from content_ir.kind_example e where e.kind_definition_id=kd.id and e.is_canonical and e.deleted_at is null);

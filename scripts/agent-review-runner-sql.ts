import { createHash } from "node:crypto";

export type ChecklistEvidence = {
  checklist_id: string; result: "pass" | "fail"; target: string; observed_at: string;
  breakpoint?: "desktop" | "tablet" | "mobile"; locator?: string;
  popup?: { trigger: string; url: string };
};
export type ChecklistEntry = { id: string; action: string; requires_popup?: boolean };
export type RunnerIdentity = { stableWorker: string; runId: string };
export type ReviewerVerdict = {
  role: "functional_coverage" | "quality"; reviewer: string; verdict: "pass";
  evidence_hash: string; receipt: string; reviewed_at: string;
};

export const sha256Json = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const sha256Text = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function normalizeInstruction(instructions: string): string {
  const normalized = instructions.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Review instructions cannot be empty");
  return normalized;
}

export function freezeChecklist(checklist: ChecklistEntry[]): ChecklistEntry[] {
  const ids = checklist.map((entry) => entry.id.trim());
  if (!checklist.length || new Set(ids).size !== checklist.length || checklist.some((entry) => !entry.id.trim() || !entry.action.trim())) {
    throw new Error("Manifest needs unique checklist IDs and individual requested actions");
  }
  return checklist.map((entry) => ({
    id: entry.id.trim(), action: entry.action.trim(),
    ...(entry.requires_popup === true ? { requires_popup: true } : {}),
  }));
}

export function requireCompleteEvidence(checklist: ChecklistEntry[], evidence: ChecklistEvidence[]): void {
  if (evidence.length !== checklist.length || new Set(evidence.map((entry) => entry.checklist_id)).size !== evidence.length) {
    throw new Error("Every frozen checklist item needs exactly one evidence record");
  }
  for (const item of checklist) {
    const match = evidence.find((entry) => entry.checklist_id === item.id);
    if (!match || match.result !== "pass" || !match.target.trim() || !Number.isFinite(Date.parse(match.observed_at)) ||
      (item.requires_popup && (!match.popup?.trigger.trim() || !match.popup.url.trim()))) {
      throw new Error(`Missing complete evidence for checklist item ${item.id}`);
    }
  }
}

export function requireIndependentVerdicts(stableWorker: string, evidenceHash: string, verdicts: ReviewerVerdict[]): [ReviewerVerdict, ReviewerVerdict] {
  const byRole = new Map(verdicts.map((verdict) => [verdict.role, verdict]));
  const functional = byRole.get("functional_coverage");
  const quality = byRole.get("quality");
  if (verdicts.length !== 2 || !functional || !quality) {
    throw new Error("Acceptance requires exactly one functional-coverage and one quality verdict");
  }
  if (functional.reviewer === quality.reviewer || functional.reviewer === stableWorker || quality.reviewer === stableWorker) {
    throw new Error("Both reviewers must be independent from the worker and from each other");
  }
  for (const verdict of [functional, quality]) {
    if (verdict.verdict !== "pass" || verdict.evidence_hash !== evidenceHash || !verdict.receipt.trim() ||
      !Number.isFinite(Date.parse(verdict.reviewed_at))) {
      throw new Error("Each independent PASS verdict must bind the exact evidence hash and carry a receipt and timestamp");
    }
  }
  return [functional, quality];
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const json = (value: unknown): string => `${quote(JSON.stringify(value))}::jsonb`;
const eventKey = (id: string, operation: string, nonce: string): string => `agent-review:${id}:${operation}:${nonce}`;

export function claimSql(
  id: string, identity: RunnerIdentity, instructionHash: string, checklist: ChecklistEntry[], route: string,
  fixture: { id: string; owner_id: string; owner_email: "admin@admin.com"; proof: string }, nonce: string,
): string {
  const worker = quote(identity.stableWorker);
  const frozen = freezeChecklist(checklist);
  const checklistHash = sha256Json(frozen);
  const runnerSeed = {
    run_id: identity.runId, instruction_hash: instructionHash, checklist_hash: checklistHash,
    checklist: frozen, route, fixture,
  };
  return `do $runner$
declare v_row agent.review_queue%rowtype; v_instruction_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('agent-review-runner:' || ${worker}, 0));
  if exists (
    select 1 from agent.review_queue q where q.status='agent_review'
      and q.metadata #>> '{triage,assignment,owner}'=${worker}
      and q.metadata #>> '{triage,assignment,state}' in ('claimed','fixing','verifying')
  ) then raise exception 'stable worker already owns an active review'; end if;
  select q.* into v_row from agent.review_queue q
  where q.id=${quote(id)} and q.url=${quote(route)}
    and q.status in ('submitted','agent_changes_requested','human_changes_requested')
    and q.conversation_id is not null and q.metadata #>> '{triage,assignment,state}'='ready'
    and coalesce(q.metadata #>> '{triage,assignment,owner}','')=''
    and coalesce(q.metadata #>> '{triage,lane}','') <> 'human_required'
    and coalesce(q.metadata #> '{triage,required_tools}','[]'::jsonb) @> '["browser"]'::jsonb
    and not coalesce(q.metadata #> '{triage,required_tools}','[]'::jsonb) @> '["human_input"]'::jsonb
  for update skip locked;
  if not found then raise exception 'claim rejected: row missing, changed, owned, or ineligible'; end if;
  v_instruction_hash := encode(digest(regexp_replace(trim(v_row.instructions), '\\s+', ' ', 'g'), 'sha256'),'hex');
  if v_instruction_hash <> ${quote(instructionHash)} then raise exception 'browser preflight instruction hash is stale'; end if;
  update agent.review_queue q set status='agent_review', metadata=jsonb_set(
    jsonb_set(jsonb_set(v_row.metadata,'{triage,assignment,state}','"claimed"'::jsonb),'{triage,assignment,owner}',to_jsonb(${worker}::text)),
    '{triage,runner}', ${json(runnerSeed)} || jsonb_build_object('prior_status',v_row.status,'prior_assignment',v_row.metadata #> '{triage,assignment}')
  ) where q.id=v_row.id and q.status=v_row.status and q.metadata=v_row.metadata;
  if not found then raise exception 'agent-review claim changed before update'; end if;
  insert into communication.dm_messages (conversation_id,sender_id,content,message_type,status,client_message_id,organization_id,created_by,metadata)
  select v_row.conversation_id,c.created_by,'Claimed for guarded UI review.','system','sent',${quote(eventKey(id, "claimed", nonce))},c.organization_id,c.created_by,
    jsonb_build_object('actor_kind','agent','actor_label',${worker},'review_event','agent_review_claimed','review_queue_id',v_row.id,'run_id',${quote(identity.runId)},'instruction_hash',v_instruction_hash,'checklist_hash',${quote(checklistHash)})
  from communication.dm_conversations c where c.id=v_row.conversation_id;
  if not found then raise exception 'claim audit event was not inserted'; end if;
end $runner$;`;
}

export function candidateSql(
  id: string, identity: RunnerIdentity, instructionHash: string, checklist: ChecklistEntry[],
  evidence: ChecklistEvidence[], reviewer: string, nonce: string,
): string {
  requireCompleteEvidence(checklist, evidence);
  if (!reviewer.trim() || reviewer === identity.stableWorker) throw new Error("Functional UI reviewer must be independent from the stable worker");
  const frozen = freezeChecklist(checklist);
  const evidenceHash = sha256Json(evidence);
  const candidate = { instruction_hash: instructionHash, checklist: frozen, evidence, evidence_hash: evidenceHash, reviewer, run_id: identity.runId, recorded_at: new Date().toISOString() };
  return `with updated as (
 update agent.review_queue q set metadata=jsonb_set(q.metadata,'{triage,runner,candidate}',${json(candidate)})
 where q.id=${quote(id)} and q.status='agent_review'
  and q.metadata #>> '{triage,assignment,owner}'=${quote(identity.stableWorker)}
  and q.metadata #>> '{triage,runner,run_id}'=${quote(identity.runId)}
  and q.metadata #>> '{triage,runner,instruction_hash}'=${quote(instructionHash)}
  and q.metadata #>> '{triage,runner,checklist_hash}'=${quote(sha256Json(frozen))}
 returning q.*
), event as (
 insert into communication.dm_messages (conversation_id,sender_id,content,message_type,status,client_message_id,organization_id,created_by,metadata)
 select u.conversation_id,c.created_by,'Recorded complete functional UI evidence.','system','sent',${quote(eventKey(id, "candidate", nonce))},c.organization_id,c.created_by,
  jsonb_build_object('actor_kind','agent','actor_label',${quote(reviewer)},'review_event','candidate_recorded','review_queue_id',u.id,'run_id',${quote(identity.runId)},'evidence_hash',${quote(evidenceHash)})
 from updated u join communication.dm_conversations c on c.id=u.conversation_id returning client_message_id
) select jsonb_build_object('updated_count',(select count(*) from updated),'event_count',(select count(*) from event));`;
}

export function acceptSql(id: string, identity: RunnerIdentity, evidenceHash: string, verdicts: ReviewerVerdict[], nonce: string): string {
  const [functional, quality] = requireIndependentVerdicts(identity.stableWorker, evidenceHash, verdicts);
  return `with updated as (
 update agent.review_queue q set metadata=jsonb_set(q.metadata,'{triage,runner,acceptance}',${json({ evidence_hash: evidenceHash, verdicts: [functional, quality], accepted_at: new Date().toISOString() })})
 where q.id=${quote(id)} and q.status='agent_review'
  and q.metadata #>> '{triage,assignment,owner}'=${quote(identity.stableWorker)}
  and q.metadata #>> '{triage,runner,run_id}'=${quote(identity.runId)}
  and q.metadata #>> '{triage,runner,candidate,evidence_hash}'=${quote(evidenceHash)}
  and q.metadata #>> '{triage,runner,candidate,reviewer}'=${quote(functional.reviewer)}
 returning q.*
), event as (
 insert into communication.dm_messages (conversation_id,sender_id,content,message_type,status,client_message_id,organization_id,created_by,metadata)
 select u.conversation_id,c.created_by,'Independent functional-coverage and quality verdicts accepted.','system','sent',${quote(eventKey(id, "accepted", nonce))},c.organization_id,c.created_by,
  jsonb_build_object('actor_kind','agent','actor_label',${quote(quality.reviewer)},'review_event','candidate_accepted','review_queue_id',u.id,'run_id',${quote(identity.runId)},'evidence_hash',${quote(evidenceHash)})
 from updated u join communication.dm_conversations c on c.id=u.conversation_id returning client_message_id
) select jsonb_build_object('updated_count',(select count(*) from updated),'event_count',(select count(*) from event));`;
}

export function promoteSql(id: string, identity: RunnerIdentity, instructionHash: string, evidenceHash: string, nonce: string): string {
  return `with promoted as (
 update agent.review_queue q set status='ready_for_human', metadata=jsonb_set(
  jsonb_set(jsonb_set(jsonb_set(q.metadata,'{triage,assignment,state}','"awaiting_review"'::jsonb),'{triage,verification,verified_by}',to_jsonb((q.metadata #>> '{triage,runner,candidate,reviewer}')::text)),'{triage,verification,verified_at}',to_jsonb(now())),
  '{triage,verification,notes}',to_jsonb('Guarded browser evidence passed independent functional-coverage and quality review.'::text))
 where q.id=${quote(id)} and q.status='agent_review'
  and q.metadata #>> '{triage,assignment,owner}'=${quote(identity.stableWorker)}
  and q.metadata #>> '{triage,runner,run_id}'=${quote(identity.runId)}
  and q.metadata #>> '{triage,runner,instruction_hash}'=${quote(instructionHash)}
  and q.metadata #>> '{triage,runner,candidate,evidence_hash}'=${quote(evidenceHash)}
  and q.metadata #>> '{triage,runner,acceptance,evidence_hash}'=${quote(evidenceHash)}
  and jsonb_array_length(coalesce(q.metadata #> '{triage,runner,acceptance,verdicts}','[]'::jsonb))=2
 returning q.*
), event as (
 insert into communication.dm_messages (conversation_id,sender_id,content,message_type,status,client_message_id,organization_id,created_by,metadata)
 select p.conversation_id,c.created_by,'Independent UI review accepted and promoted.','system','sent',${quote(eventKey(id, "promoted", nonce))},c.organization_id,c.created_by,
  jsonb_build_object('actor_kind','agent','actor_label',p.metadata #>> '{triage,runner,candidate,reviewer}','review_event','ready_for_human','review_queue_id',p.id,'run_id',${quote(identity.runId)},'instruction_hash',${quote(instructionHash)},'evidence_hash',${quote(evidenceHash)})
 from promoted p join communication.dm_conversations c on c.id=p.conversation_id returning client_message_id
) select jsonb_build_object('updated_count',(select count(*) from promoted),'event_count',(select count(*) from event));`;
}

export function releaseSql(id: string, identity: RunnerIdentity, instructionHash: string, reason: string, nonce: string): string {
  return `with released as (
 update agent.review_queue q set status=q.metadata #>> '{triage,runner,prior_status}',
  metadata=jsonb_set(q.metadata,'{triage,assignment}',q.metadata #> '{triage,runner,prior_assignment}')
 where q.id=${quote(id)} and q.status='agent_review'
  and q.metadata #>> '{triage,assignment,owner}'=${quote(identity.stableWorker)}
  and q.metadata #>> '{triage,runner,run_id}'=${quote(identity.runId)}
  and q.metadata #>> '{triage,runner,instruction_hash}'=${quote(instructionHash)}
 returning q.*
), event as (
 insert into communication.dm_messages (conversation_id,sender_id,content,message_type,status,client_message_id,organization_id,created_by,metadata)
 select r.conversation_id,c.created_by,${quote(reason)},'system','sent',${quote(eventKey(id, "released", nonce))},c.organization_id,c.created_by,
  jsonb_build_object('actor_kind','agent','actor_label',${quote(identity.stableWorker)},'review_event','runner_released','review_queue_id',r.id,'run_id',${quote(identity.runId)},'instruction_hash',${quote(instructionHash)})
 from released r join communication.dm_conversations c on c.id=r.conversation_id returning client_message_id
) select jsonb_build_object('updated_count',(select count(*) from released),'event_count',(select count(*) from event));`;
}

export function readbackSql(id: string, operation: string, nonce: string): string {
  return `select jsonb_build_object('row',to_jsonb(q),'event',to_jsonb(m)) from agent.review_queue q
  left join communication.dm_messages m on m.conversation_id=q.conversation_id and m.client_message_id=${quote(eventKey(id, operation, nonce))}
  where q.id=${quote(id)}`;
}

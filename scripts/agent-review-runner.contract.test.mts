import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSql, candidateSql, claimSql, freezeChecklist, normalizeInstruction,
  promoteSql, releaseSql, requireCompleteEvidence, requireIndependentVerdicts,
  sha256Json, sha256Text,
} from "./agent-review-runner-sql";

const actor = { stableWorker: "review-worker-01", runId: "run-20260920-a" };
const instructions = "Open the admin sidebar. Verify mobile layout.";
const checklist = freezeChecklist([
  { id: "sidebar", action: "Open the admin sidebar" },
  { id: "mobile-popup", action: "Verify mobile popup", requires_popup: true },
]);
const evidence = [
  { checklist_id: "sidebar", result: "pass" as const, target: "/administration/users/agent-review", observed_at: "2026-09-20T10:00:00.000Z", breakpoint: "desktop" as const },
  { checklist_id: "mobile-popup", result: "pass" as const, target: "/administration/users/agent-review", observed_at: "2026-09-20T10:01:00.000Z", breakpoint: "mobile" as const, popup: { trigger: "a[target=_blank]", url: "https://example.com/result" } },
];
const fixture = { id: "fixture-01", owner_id: "00000000-0000-4000-8000-000000000002", owner_email: "admin@admin.com" as const, proof: "live row owner query" };
const instructionHash = sha256Text(normalizeInstruction(instructions));
const evidenceHash = sha256Json(evidence);
const verdicts = [
  { role: "functional_coverage" as const, reviewer: "ui-reviewer-17", verdict: "pass" as const, evidence_hash: evidenceHash, receipt: "all checklist evidence inspected", reviewed_at: "2026-09-20T10:02:00.000Z" },
  { role: "quality" as const, reviewer: "quality-reviewer-22", verdict: "pass" as const, evidence_hash: evidenceHash, receipt: "evidence quality and route binding inspected", reviewed_at: "2026-09-20T10:03:00.000Z" },
];

test("instruction hashing matches PostgreSQL digest bytes rather than JSON string bytes", () => {
  assert.equal(normalizeInstruction("  abc\n\t"), "abc");
  assert.equal(sha256Text("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(sha256Text("abc"), sha256Json("abc"));
});

test("claim locks before a fresh guarded select and refuses every unsafe eligibility class", () => {
  const sql = claimSql("00000000-0000-0000-0000-000000000001", actor, instructionHash, checklist, "/administration/users/agent-review/fixture-01", fixture, "event-1");
  assert.ok(sql.indexOf("pg_advisory_xact_lock") < sql.indexOf("select q.* into v_row"));
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /stable worker already owns an active review/);
  assert.match(sql, /assignment,owner}'.*=''[\s\S]*human_required[\s\S]*\["browser"\][\s\S]*\["human_input"\]/);
  assert.match(sql, /q\.url='\/administration\/users\/agent-review\/fixture-01'/);
  assert.match(sql, /agent-review:00000000-0000-0000-0000-000000000001:claimed:event-1/);
  assert.match(sql, new RegExp(fixture.owner_id));
});

test("complete evidence requires one PASS per frozen action and popup proof where declared", () => {
  assert.equal(checklist[1]?.requires_popup, true);
  assert.throws(() => requireCompleteEvidence(checklist, evidence.slice(0, 1)), /exactly one/);
  assert.throws(() => requireCompleteEvidence(checklist, [evidence[0]!, { ...evidence[1]!, popup: undefined }]), /mobile-popup/);
  assert.throws(() => requireCompleteEvidence(checklist, [evidence[0]!, { ...evidence[1]!, result: "fail" }]), /mobile-popup/);
  assert.doesNotThrow(() => requireCompleteEvidence(checklist, evidence));
});

test("acceptance requires two distinct reviewers bound to the exact evidence hash", () => {
  assert.throws(() => requireIndependentVerdicts(actor.stableWorker, evidenceHash, [verdicts[0]!]), /exactly one/);
  assert.throws(() => requireIndependentVerdicts(actor.stableWorker, evidenceHash, [verdicts[0]!, { ...verdicts[1]!, reviewer: verdicts[0]!.reviewer }]), /independent/);
  assert.throws(() => requireIndependentVerdicts(actor.stableWorker, evidenceHash, [verdicts[0]!, { ...verdicts[1]!, evidence_hash: "0".repeat(64) }]), /exact evidence hash/);
  assert.deepEqual(requireIndependentVerdicts(actor.stableWorker, evidenceHash, verdicts), verdicts);
});

test("each mutation binds run, hashes, independent reviewer, and a unique audit event", () => {
  const candidate = candidateSql("id", actor, instructionHash, checklist, evidence, verdicts[0]!.reviewer, "event-2");
  const accepted = acceptSql("id", actor, evidenceHash, verdicts, "event-3");
  const promoted = promoteSql("id", actor, instructionHash, evidenceHash, "event-4");
  const released = releaseSql("id", actor, instructionHash, "fixture rehearsal complete", "event-5");
  assert.match(candidate, /candidate:event-2/);
  assert.match(candidate, new RegExp(evidenceHash));
  assert.match(accepted, /accepted:event-3/);
  assert.match(accepted, /functional_coverage/);
  assert.match(accepted, /quality/);
  assert.match(promoted, /promoted:event-4/);
  assert.match(promoted, /candidate,reviewer/);
  assert.match(promoted, /awaiting_review/);
  assert.match(released, /released:event-5/);
  assert.match(released, /prior_assignment/);
  for (const sql of [candidate, accepted, promoted, released]) {
    assert.match(sql, /updated_count|select count\(\*\) from promoted|select count\(\*\) from released/);
    assert.match(sql, /event_count/);
  }
});

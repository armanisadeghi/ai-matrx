/**
 * Guarded operator for one explicitly named agent-review row. SQL executes
 * only through the repository's canonical admin-query operator.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  acceptSql, candidateSql, claimSql, freezeChecklist, normalizeInstruction,
  promoteSql, readbackSql, releaseSql, requireCompleteEvidence, sha256Json,
  sha256Text, type ChecklistEntry, type ChecklistEvidence, type ReviewerVerdict,
  type RunnerIdentity,
} from "./agent-review-runner-sql";
import { authenticateAdminDevLogin, verifyAdminBrowserPreflight } from "./agent-review-runner-browser";

type Args = Record<string, string>;
type Fixture = { id: string; owner_id: string; owner_email: "admin@admin.com"; proof: string };
type Manifest = { instructions: string; route: string; fixture: Fixture; checklist: ChecklistEntry[] };
type Readback = { row: Record<string, unknown>; event?: Record<string, unknown> | null };

function args(argv: string[]): Args {
  const out: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) throw new Error(`Unexpected argument: ${part}`);
    const [key, inline] = part.slice(2).split("=", 2);
    const value = inline ?? argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    out[key] = value;
    if (inline === undefined) index += 1;
  }
  return out;
}

function required(input: Args, key: string): string {
  const value = input[key]?.trim();
  if (!value) throw new Error(`Pass --${key}`);
  return value;
}

function identity(input: Args): RunnerIdentity {
  const stableWorker = required(input, "stable-worker");
  const runId = required(input, "run-id");
  if (stableWorker.includes(`:${runId}`)) throw new Error("--stable-worker must be durable and must not embed --run-id");
  return { stableWorker, runId };
}

async function runAdminQuery(sql: string): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), "agent-review-runner-"));
  const file = join(directory, "query.sql");
  try {
    await writeFile(file, sql, { mode: 0o600 });
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn("pnpm", ["admin-query", "--file", file], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk; });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `admin-query exited ${code}`)));
    });
    const firstJson = Math.min(...["{", "["].map((token) => {
      const position = result.indexOf(token);
      return position < 0 ? Number.POSITIVE_INFINITY : position;
    }));
    if (!Number.isFinite(firstJson)) throw new Error("admin-query returned no JSON payload");
    return JSON.parse(result.slice(firstJson));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function jsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function manifest(raw: Manifest): Manifest {
  const checklist = freezeChecklist(raw.checklist);
  if (!raw.route?.startsWith("/") || raw.route === "/") throw new Error("Manifest needs the exact non-root queue route");
  if (!raw.fixture?.id?.trim() || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw.fixture.owner_id) ||
      raw.fixture.owner_email !== "admin@admin.com" || !raw.fixture.proof?.trim()) {
    throw new Error("Manifest needs a disposable fixture ID, actual admin owner UUID, admin email, and ownership proof");
  }
  return { instructions: normalizeInstruction(raw.instructions), route: raw.route, fixture: raw.fixture, checklist };
}

function rowsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["rows", "result", "data"]) {
    const nested = (value as Record<string, unknown>)[key];
    const rows = rowsFrom(nested);
    if (rows.length) return rows;
  }
  return [];
}

function exactReadback(payload: unknown): Readback {
  const rows = rowsFrom(payload);
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
    throw new Error(`Mutation verification expected one row, received ${rows.length}`);
  }
  const value = rows[0] as Record<string, unknown>;
  const candidate = value.jsonb_build_object ?? value;
  if (!candidate || typeof candidate !== "object") throw new Error("Mutation verification returned an unreadable row");
  const readback = candidate as Readback;
  if (!readback.row || typeof readback.row !== "object") throw new Error("Mutation verification did not return the queue row");
  return readback;
}

const objectAt = (value: unknown, key: string): Record<string, unknown> => {
  if (!value || typeof value !== "object") throw new Error(`Missing ${key}`);
  const child = (value as Record<string, unknown>)[key];
  if (!child || typeof child !== "object") throw new Error(`Missing ${key}`);
  return child as Record<string, unknown>;
};

function assertMutation(
  operation: "claimed" | "candidate" | "accepted" | "promoted" | "released",
  readback: Readback,
  actor: RunnerIdentity,
  expected: { instructionHash?: string; checklistHash?: string; evidenceHash?: string; reviewer?: string },
): void {
  if (!readback.event) throw new Error(`${operation} mutation did not write its unique audit event`);
  const row = readback.row;
  const metadata = objectAt(row, "metadata");
  const triage = objectAt(metadata, "triage");
  const assignment = objectAt(triage, "assignment");
  const runner = objectAt(triage, "runner");
  const eventMetadata = objectAt(readback.event, "metadata");
  if (operation !== "released" && runner.run_id !== actor.runId) throw new Error(`${operation} readback has the wrong run ID`);
  if (expected.instructionHash && runner.instruction_hash !== expected.instructionHash) throw new Error(`${operation} readback has the wrong instruction hash`);
  if (expected.checklistHash && runner.checklist_hash !== expected.checklistHash) throw new Error(`${operation} readback has the wrong checklist hash`);
  if (operation === "claimed" && (row.status !== "agent_review" || assignment.owner !== actor.stableWorker || assignment.state !== "claimed")) {
    throw new Error("Claim did not establish the expected status and owner");
  }
  if (operation === "candidate") {
    const candidate = objectAt(runner, "candidate");
    if (candidate.evidence_hash !== expected.evidenceHash || candidate.reviewer !== expected.reviewer) throw new Error("Candidate readback has the wrong evidence hash or reviewer");
  }
  if (operation === "accepted" && objectAt(runner, "acceptance").evidence_hash !== expected.evidenceHash) throw new Error("Acceptance readback has the wrong evidence hash");
  if (operation === "promoted") {
    const verification = objectAt(triage, "verification");
    if (row.status !== "ready_for_human" || assignment.state !== "awaiting_review" || verification.verified_by !== expected.reviewer) {
      throw new Error("Promotion did not establish ready_for_human with the actual UI reviewer");
    }
  }
  if (operation === "released" && (row.status === "agent_review" || assignment.owner === actor.stableWorker)) throw new Error("Release did not restore prior status and ownership");
  if (eventMetadata.run_id !== actor.runId) throw new Error(`${operation} event has the wrong run ID`);
  if (expected.evidenceHash && operation !== "claimed" && operation !== "released" && eventMetadata.evidence_hash !== expected.evidenceHash) {
    throw new Error(`${operation} event has the wrong evidence hash`);
  }
}

async function main(): Promise<void> {
  const [operation] = process.argv.slice(2);
  const input = args(process.argv.slice(3));
  const id = required(input, "id");
  const actor = identity(input);

  if (operation === "status") {
    const payload = await runAdminQuery(`select jsonb_build_object('row',to_jsonb(q)) from agent.review_queue q where q.id='${id.replace(/'/g, "''")}'`);
    console.log(JSON.stringify(exactReadback(payload), null, 2));
    return;
  }
  if (operation === "preflight") {
    const spec = manifest(await jsonFile<Manifest>(required(input, "manifest-file")));
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      await authenticateAdminDevLogin(context, required(input, "login-url"), required(input, "base-url"));
      const page = await context.newPage();
      const proof = await verifyAdminBrowserPreflight(page, required(input, "base-url"), spec.route, {
        review_id: id, stable_worker: actor.stableWorker, run_id: actor.runId,
        instruction_hash: sha256Text(spec.instructions), checklist_hash: sha256Json(spec.checklist),
      }, spec.fixture);
      console.log(JSON.stringify(proof));
    } finally { await browser.close(); }
    return;
  }

  const nonce = randomUUID();
  let sql: string;
  let readbackOperation: "claimed" | "candidate" | "accepted" | "promoted" | "released";
  let expected: { instructionHash?: string; checklistHash?: string; evidenceHash?: string; reviewer?: string } = {};
  if (operation === "claim") {
    const spec = manifest(await jsonFile<Manifest>(required(input, "manifest-file")));
    const preflight = await jsonFile<Record<string, unknown>>(required(input, "preflight-file"));
    const instructionHash = sha256Text(spec.instructions);
    const checklistHash = sha256Json(spec.checklist);
    const verifiedAt = typeof preflight.verified_at === "string" ? Date.parse(preflight.verified_at) : NaN;
    if (preflight.identity !== "admin@admin.com" || preflight.review_id !== id || preflight.stable_worker !== actor.stableWorker ||
      preflight.run_id !== actor.runId || preflight.route !== spec.route || preflight.instruction_hash !== instructionHash ||
      preflight.checklist_hash !== checklistHash || JSON.stringify(preflight.fixture) !== JSON.stringify(spec.fixture) ||
      !Number.isFinite(verifiedAt) || verifiedAt > Date.now() + 30_000 || Date.now() - verifiedAt > 10 * 60_000) {
      throw new Error("Claim requires fresh route-, fixture-, instruction-, checklist-, worker-, and run-bound browser preflight evidence");
    }
    sql = claimSql(id, actor, instructionHash, spec.checklist, spec.route, spec.fixture, nonce);
    readbackOperation = "claimed";
    expected = { instructionHash, checklistHash };
  } else if (operation === "candidate") {
    const payload = await jsonFile<{ instructions: string; checklist: ChecklistEntry[]; evidence: ChecklistEvidence[]; reviewer: string }>(required(input, "evidence-file"));
    const checklist = freezeChecklist(payload.checklist);
    requireCompleteEvidence(checklist, payload.evidence);
    const instructionHash = sha256Text(normalizeInstruction(payload.instructions));
    const evidenceHash = sha256Json(payload.evidence);
    sql = candidateSql(id, actor, instructionHash, checklist, payload.evidence, payload.reviewer, nonce);
    readbackOperation = "candidate";
    expected = { instructionHash, checklistHash: sha256Json(checklist), evidenceHash, reviewer: payload.reviewer };
  } else if (operation === "accept") {
    const verdicts = await jsonFile<ReviewerVerdict[]>(required(input, "verdicts-file"));
    const evidenceHash = required(input, "evidence-hash");
    sql = acceptSql(id, actor, evidenceHash, verdicts, nonce);
    readbackOperation = "accepted";
    expected = { evidenceHash, reviewer: verdicts.find((verdict) => verdict.role === "functional_coverage")?.reviewer };
  } else if (operation === "promote") {
    const instructionHash = required(input, "instruction-hash");
    const evidenceHash = required(input, "evidence-hash");
    const reviewer = required(input, "functional-reviewer");
    sql = promoteSql(id, actor, instructionHash, evidenceHash, nonce);
    readbackOperation = "promoted";
    expected = { instructionHash, evidenceHash, reviewer };
  } else if (operation === "release") {
    const instructionHash = required(input, "instruction-hash");
    sql = releaseSql(id, actor, instructionHash, required(input, "reason"), nonce);
    readbackOperation = "released";
    expected = { instructionHash };
  } else {
    throw new Error("Operation must be preflight, claim, status, candidate, accept, promote, or release");
  }
  await runAdminQuery(sql);
  const readback = exactReadback(await runAdminQuery(readbackSql(id, readbackOperation, nonce)));
  assertMutation(readbackOperation, readback, actor, expected);
  console.log(JSON.stringify({ operation: readbackOperation, id, verified: true, readback }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

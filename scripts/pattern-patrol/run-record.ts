import { createHash } from "node:crypto";

export const PATROL_RUN_STATES = [
  "discovered",
  "awaiting_approval",
  "fixing",
  "certifying",
  "certified",
  "rejected",
  "infrastructure_blocked",
  "delivery_queued",
  "delivered",
  "reversed",
  "closed",
] as const;

export type PatrolRunState = (typeof PATROL_RUN_STATES)[number];

export interface PatrolCertification {
  verdict: "CERTIFIED";
  certifierTaskId: string;
  candidateSha: string;
  checks: string[];
}

export interface PatrolBlocker {
  prerequisite: string;
  preservedRef?: string;
  preservedSha?: string;
}

export interface PatrolDelivery {
  candidateSha: string;
  preservedRef?: string;
  integratedSha?: string;
  release?: string;
}

export interface PatrolRunEvent {
  sequence: number;
  state: PatrolRunState;
  at: string;
  actor: string;
  summary: string;
  evidence: string[];
  certification?: PatrolCertification;
  blocker?: PatrolBlocker;
  delivery?: PatrolDelivery;
  previousEventHash: string | null;
  eventHash: string;
}

export interface PatrolRunRecord {
  schemaVersion: 1;
  patrolId: string;
  runId: string;
  baseSha: string;
  createdAt: string;
  events: PatrolRunEvent[];
}

export interface PatrolRunEventInput {
  state: PatrolRunState;
  at: string;
  actor: string;
  summary: string;
  evidence?: string[];
  certification?: PatrolCertification;
  blocker?: PatrolBlocker;
  delivery?: PatrolDelivery;
}

const TRANSITIONS: Record<PatrolRunState, readonly PatrolRunState[]> = {
  discovered: ["awaiting_approval", "fixing", "infrastructure_blocked", "closed"],
  awaiting_approval: ["fixing"],
  fixing: ["certifying", "rejected", "infrastructure_blocked"],
  certifying: ["certified", "rejected", "infrastructure_blocked"],
  certified: ["delivery_queued", "infrastructure_blocked", "reversed"],
  rejected: ["fixing"],
  infrastructure_blocked: ["fixing", "certifying", "delivery_queued"],
  delivery_queued: ["delivered", "infrastructure_blocked", "reversed"],
  delivered: ["reversed", "closed"],
  reversed: ["fixing", "closed"],
  closed: [],
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
}

function eventPayload(event: Omit<PatrolRunEvent, "eventHash">): string {
  return canonicalize(event);
}

function hashEvent(event: Omit<PatrolRunEvent, "eventHash">): string {
  return createHash("sha256").update(eventPayload(event)).digest("hex");
}

function nonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be blank`);
}

function validIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function latestCertificationForCandidate(
  events: readonly PatrolRunEvent[],
  candidateSha: string,
): PatrolCertification | undefined {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.state === "certified" && event.certification?.candidateSha === candidateSha,
    )?.certification;
}

function validateEventRequirements(
  event: PatrolRunEventInput,
  priorEvents: readonly PatrolRunEvent[],
): void {
  nonEmpty(event.actor, "event actor");
  nonEmpty(event.summary, "event summary");
  if (!validIsoDate(event.at)) throw new Error(`event timestamp is not ISO-compatible: ${event.at}`);

  if (event.state === "certified") {
    const certification = event.certification;
    if (!certification || certification.verdict !== "CERTIFIED") {
      throw new Error("certified events require a CERTIFIED certification object");
    }
    nonEmpty(certification.certifierTaskId, "certifier task id");
    nonEmpty(certification.candidateSha, "certified candidate SHA");
    if (certification.checks.length === 0) {
      throw new Error("certified events require at least one recorded check");
    }
    if (certification.checks.some((check) => !check.trim())) {
      throw new Error("certification checks must not be blank");
    }
    const fixingActors = new Set(
      priorEvents.filter((prior) => prior.state === "fixing").map((prior) => prior.actor),
    );
    if (fixingActors.has(certification.certifierTaskId) || fixingActors.has(event.actor)) {
      throw new Error("certifier identity must be independent from every fixing actor");
    }
  }

  if (event.state === "infrastructure_blocked") {
    if (!event.blocker) throw new Error("infrastructure_blocked events require a blocker");
    nonEmpty(event.blocker.prerequisite, "blocked prerequisite");
    if (event.blocker.preservedRef || event.blocker.preservedSha) {
      if (!event.blocker.preservedRef || !event.blocker.preservedSha) {
        throw new Error("blocked-work preservation requires both preservedRef and preservedSha");
      }
    }
  }

  if (event.state === "delivery_queued" || event.state === "delivered") {
    if (!event.delivery) throw new Error(`${event.state} events require delivery details`);
    nonEmpty(event.delivery.candidateSha, "delivery candidate SHA");
    if (!latestCertificationForCandidate(priorEvents, event.delivery.candidateSha)) {
      throw new Error(
        `candidate ${event.delivery.candidateSha} has no prior CERTIFIED event; delivery is forbidden`,
      );
    }
    if (event.state === "delivery_queued" && !event.delivery.preservedRef) {
      throw new Error("delivery_queued events require a durable preservedRef");
    }
    if (event.state === "delivered") {
      nonEmpty(event.delivery.integratedSha ?? "", "integrated SHA");
      nonEmpty(event.delivery.release ?? "", "release identifier");
    }
  }
}

export function createPatrolRunRecord(input: {
  patrolId: string;
  runId: string;
  baseSha: string;
  createdAt: string;
  actor: string;
  summary: string;
  evidence?: string[];
}): PatrolRunRecord {
  nonEmpty(input.patrolId, "patrol id");
  nonEmpty(input.runId, "run id");
  nonEmpty(input.baseSha, "base SHA");
  if (!validIsoDate(input.createdAt)) {
    throw new Error(`createdAt is not ISO-compatible: ${input.createdAt}`);
  }
  const record: PatrolRunRecord = {
    schemaVersion: 1,
    patrolId: input.patrolId,
    runId: input.runId,
    baseSha: input.baseSha,
    createdAt: input.createdAt,
    events: [],
  };
  const discovery: PatrolRunEventInput = {
    state: "discovered",
    at: input.createdAt,
    actor: input.actor,
    summary: input.summary,
    evidence: input.evidence,
  };
  validateEventRequirements(discovery, []);
  const withoutHash: Omit<PatrolRunEvent, "eventHash"> = {
    sequence: 1,
    state: "discovered",
    at: discovery.at,
    actor: discovery.actor,
    summary: discovery.summary,
    evidence: discovery.evidence ?? [],
    previousEventHash: null,
  };
  return {
    ...record,
    events: [{ ...withoutHash, eventHash: hashEvent(withoutHash) }],
  };
}

export function appendPatrolRunEvent(
  record: PatrolRunRecord,
  input: PatrolRunEventInput,
): PatrolRunRecord {
  const problems = validatePatrolRunRecord(record);
  if (problems.length > 0) throw new Error(`invalid patrol run record: ${problems.join("; ")}`);

  const previous = record.events.at(-1);
  if (!previous) throw new Error("patrol run record has no discovery event");
  if (!TRANSITIONS[previous.state].includes(input.state)) {
    throw new Error(`invalid patrol transition: ${previous.state} -> ${input.state}`);
  }
  validateEventRequirements(input, record.events);

  const withoutHash: Omit<PatrolRunEvent, "eventHash"> = {
    sequence: previous.sequence + 1,
    state: input.state,
    at: input.at,
    actor: input.actor,
    summary: input.summary,
    evidence: input.evidence ?? [],
    certification: input.certification,
    blocker: input.blocker,
    delivery: input.delivery,
    previousEventHash: previous.eventHash,
  };
  const event: PatrolRunEvent = { ...withoutHash, eventHash: hashEvent(withoutHash) };
  return { ...record, events: [...record.events, event] };
}

export function validatePatrolRunRecord(record: PatrolRunRecord): string[] {
  const problems: string[] = [];
  if (record.schemaVersion !== 1) problems.push(`unsupported schemaVersion ${record.schemaVersion}`);
  for (const [label, value] of [
    ["patrolId", record.patrolId],
    ["runId", record.runId],
    ["baseSha", record.baseSha],
  ] as const) {
    if (!value?.trim()) problems.push(`${label} is blank`);
  }
  if (!validIsoDate(record.createdAt)) problems.push("createdAt is invalid");
  if (record.events.length === 0) problems.push("events are empty");

  let prior: PatrolRunEvent | undefined;
  for (const event of record.events) {
    const expectedSequence = prior ? prior.sequence + 1 : 1;
    const expectedPreviousHash = prior?.eventHash ?? null;
    if (event.sequence !== expectedSequence) problems.push(`event ${event.sequence}: sequence gap`);
    if (event.previousEventHash !== expectedPreviousHash) {
      problems.push(`event ${event.sequence}: previous hash mismatch`);
    }
    const { eventHash, ...withoutHash } = event;
    if (hashEvent(withoutHash) !== eventHash) problems.push(`event ${event.sequence}: hash mismatch`);
    if (!prior && event.state !== "discovered") problems.push("first event must be discovered");
    if (prior && !TRANSITIONS[prior.state].includes(event.state)) {
      problems.push(`event ${event.sequence}: invalid transition ${prior.state} -> ${event.state}`);
    }
    try {
      validateEventRequirements(event, record.events.slice(0, event.sequence - 1));
    } catch (error) {
      problems.push(`event ${event.sequence}: ${(error as Error).message}`);
    }
    prior = event;
  }
  return problems;
}

export function currentPatrolRunState(record: PatrolRunRecord): PatrolRunState {
  const event = record.events.at(-1);
  if (!event) throw new Error("patrol run record has no events");
  return event.state;
}

export function certifiedCandidate(record: PatrolRunRecord): string | undefined {
  return [...record.events]
    .reverse()
    .find((event) => event.state === "certified")
    ?.certification?.candidateSha;
}

export function canQueuePatrolDelivery(
  record: PatrolRunRecord,
  candidateSha: string,
): { allowed: true } | { allowed: false; reason: string } {
  const problems = validatePatrolRunRecord(record);
  if (problems.length > 0) return { allowed: false, reason: problems.join("; ") };
  const latest = record.events.at(-1);
  if (!latest) return { allowed: false, reason: "run has no events" };
  if (!["certified", "infrastructure_blocked"].includes(latest.state)) {
    return { allowed: false, reason: `run is ${latest.state}, not ready for delivery` };
  }
  const certification = latestCertificationForCandidate(record.events, candidateSha);
  if (!certification) {
    return { allowed: false, reason: `candidate ${candidateSha} has not been certified` };
  }
  const rejectionAfterCertification = record.events
    .slice(record.events.findIndex((event) => event.certification === certification) + 1)
    .some((event) => event.state === "rejected" || event.state === "reversed");
  if (rejectionAfterCertification) {
    return { allowed: false, reason: `candidate ${candidateSha} was rejected or reversed after certification` };
  }
  return { allowed: true };
}

export function isPrivilegedPatrolState(state: PatrolRunState): boolean {
  return ["certified", "delivery_queued", "delivered", "reversed"].includes(state);
}

export function canonicalPatrolRecordJson(record: PatrolRunRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

import {
  appendPatrolRunEvent,
  canQueuePatrolDelivery,
  createPatrolRunRecord,
  isPrivilegedPatrolState,
  validatePatrolRunRecord,
} from "./run-record";

const CREATED = "2026-08-14T12:00:00.000Z";
const CANDIDATE = "a".repeat(40);

function run() {
  return createPatrolRunRecord({
    patrolId: "P9",
    runId: "run-1",
    baseSha: "b".repeat(40),
    createdAt: CREATED,
    actor: "patrol-worker",
    summary: "Coming Soon scan started",
  });
}

function certifiedRun() {
  const fixing = appendPatrolRunEvent(run(), {
    state: "fixing",
    at: "2026-08-14T12:01:00.000Z",
    actor: "patrol-worker",
    summary: "Repairing verified promises",
  });
  const certifying = appendPatrolRunEvent(fixing, {
    state: "certifying",
    at: "2026-08-14T12:02:00.000Z",
    actor: "patrol-worker",
    summary: "Independent review started",
  });
  return appendPatrolRunEvent(certifying, {
    state: "certified",
    at: "2026-08-14T12:03:00.000Z",
    actor: "certifier-task",
    summary: "No batch-caused defect found",
    certification: {
      verdict: "CERTIFIED",
      certifierTaskId: "certifier-task",
      candidateSha: CANDIDATE,
      checks: ["focused tests", "representative browser proof"],
    },
  });
}

describe("Pattern Patrol permanent run record", () => {
  it("builds a hash-chained valid history", () => {
    const record = certifiedRun();
    expect(validatePatrolRunRecord(record)).toEqual([]);
    expect(record.events).toHaveLength(4);
    expect(record.events[3].previousEventHash).toBe(record.events[2].eventHash);
  });

  it("detects rewritten history", () => {
    const record = certifiedRun();
    const tampered = structuredClone(record);
    tampered.events[1].summary = "quietly changed later";
    expect(validatePatrolRunRecord(tampered)).toContain("event 2: hash mismatch");
  });

  it("forbids delivery without independent certification", () => {
    expect(canQueuePatrolDelivery(run(), CANDIDATE)).toEqual({
      allowed: false,
      reason: "run is discovered, not ready for delivery",
    });
  });

  it("permits only the exact certified candidate", () => {
    const record = certifiedRun();
    expect(canQueuePatrolDelivery(record, CANDIDATE)).toEqual({ allowed: true });
    expect(canQueuePatrolDelivery(record, "c".repeat(40))).toEqual({
      allowed: false,
      reason: `candidate ${"c".repeat(40)} has not been certified`,
    });
  });

  it("requires a durable ref before queueing delivery", () => {
    expect(() =>
      appendPatrolRunEvent(certifiedRun(), {
        state: "delivery_queued",
        at: "2026-08-14T12:04:00.000Z",
        actor: "delivery-controller",
        summary: "Queued",
        delivery: { candidateSha: CANDIDATE },
      }),
    ).toThrow("durable preservedRef");
  });

  it("records delivery only after the exact certified candidate is queued", () => {
    const queued = appendPatrolRunEvent(certifiedRun(), {
      state: "delivery_queued",
      at: "2026-08-14T12:04:00.000Z",
      actor: "delivery-controller",
      summary: "Queued",
      delivery: {
        candidateSha: CANDIDATE,
        preservedRef: "refs/heads/patrol-runs/P9/run-1",
      },
    });
    const delivered = appendPatrolRunEvent(queued, {
      state: "delivered",
      at: "2026-08-14T12:05:00.000Z",
      actor: "delivery-controller",
      summary: "Delivered",
      delivery: {
        candidateSha: CANDIDATE,
        preservedRef: "refs/heads/patrol-runs/P9/run-1",
        integratedSha: "d".repeat(40),
        release: "v0.4.700",
      },
    });

    expect(validatePatrolRunRecord(delivered)).toEqual([]);
    expect(delivered.events.at(-1)?.delivery?.candidateSha).toBe(CANDIDATE);
  });

  it("keeps certification and delivery out of generic worker transitions", () => {
    expect(isPrivilegedPatrolState("certified")).toBe(true);
    expect(isPrivilegedPatrolState("delivery_queued")).toBe(true);
    expect(isPrivilegedPatrolState("fixing")).toBe(false);
  });

  it("refuses a certifier identity that also performed the fix", () => {
    const fixing = appendPatrolRunEvent(run(), {
      state: "fixing",
      at: "2026-08-14T12:01:00.000Z",
      actor: "same-task",
      summary: "Fixed the candidate",
    });
    const certifying = appendPatrolRunEvent(fixing, {
      state: "certifying",
      at: "2026-08-14T12:02:00.000Z",
      actor: "same-task",
      summary: "Started review",
    });
    expect(() =>
      appendPatrolRunEvent(certifying, {
        state: "certified",
        at: "2026-08-14T12:03:00.000Z",
        actor: "same-task",
        summary: "Self-certified",
        certification: {
          verdict: "CERTIFIED",
          certifierTaskId: "same-task",
          candidateSha: CANDIDATE,
          checks: ["claimed proof"],
        },
      }),
    ).toThrow("independent");
  });
});

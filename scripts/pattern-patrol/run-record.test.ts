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

function escapedDeliveredClosedRun() {
  const fixing = appendPatrolRunEvent(run(), {
    state: "fixing",
    at: "2026-08-14T12:01:00.000Z",
    actor: "patrol-worker",
    summary: "Repairing verified promises",
  });
  const blocked = appendPatrolRunEvent(fixing, {
    state: "infrastructure_blocked",
    at: "2026-08-14T12:02:00.000Z",
    actor: "patrol-worker",
    summary: "Preview unavailable",
    blocker: {
      prerequisite: "exact-checkout browser proof",
      preservedRef: "refs/heads/patrol-runs/P9/run-1",
      preservedSha: CANDIDATE,
    },
  });
  const escaped = appendPatrolRunEvent(blocked, {
    state: "escaped_delivery",
    at: "2026-08-14T12:03:00.000Z",
    actor: "delivery-controller",
    summary: "Release ordering escaped",
    escape: {
      candidateSha: CANDIDATE,
      integratedSha: "d".repeat(40),
      release: "v0.4.700",
      reason: "release gate was advisory",
    },
  });
  const certifying = appendPatrolRunEvent(escaped, {
    state: "certifying",
    at: "2026-08-14T12:04:00.000Z",
    actor: "certifier-task",
    summary: "Exact candidate review started",
  });
  const certified = appendPatrolRunEvent(certifying, {
    state: "certified",
    at: "2026-08-14T12:05:00.000Z",
    actor: "certifier-task",
    summary: "Exact candidate certified",
    certification: {
      verdict: "CERTIFIED",
      certifierTaskId: "certifier-task",
      candidateSha: CANDIDATE,
      checks: ["focused tests"],
    },
  });
  const delivered = appendPatrolRunEvent(certified, {
    state: "delivered",
    at: "2026-08-14T12:06:00.000Z",
    actor: "delivery-controller",
    summary: "Existing release recorded",
    delivery: {
      candidateSha: CANDIDATE,
      preservedRef: "refs/heads/patrol-runs/P9/run-1",
      integratedSha: "d".repeat(40),
      release: "v0.4.700",
    },
  });
  return appendPatrolRunEvent(delivered, {
    state: "closed",
    at: "2026-08-14T12:07:00.000Z",
    actor: "delivery-controller",
    summary: "Closed before missing proof was recovered",
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
    expect(isPrivilegedPatrolState("reconciled")).toBe(true);
    expect(isPrivilegedPatrolState("fixing")).toBe(false);
  });

  it("appends proof reconciliation without rewriting the escaped ordering", () => {
    const closed = escapedDeliveredClosedRun();
    const escaped = closed.events.find((event) => event.state === "escaped_delivery");
    const reconciled = appendPatrolRunEvent(closed, {
      state: "reconciled",
      at: "2026-08-14T12:08:00.000Z",
      actor: "fleet-health",
      summary: "Recovered exact-checkout representative proof",
      reconciliation: {
        candidateSha: CANDIDATE,
        escapedEventHash: escaped!.eventHash,
        checks: ["exact checkout at 375x812", "desktop behavior unchanged"],
      },
    });

    expect(validatePatrolRunRecord(reconciled)).toEqual([]);
    expect(reconciled.events.map((event) => event.state)).toContain("escaped_delivery");
    expect(reconciled.events.at(-1)?.state).toBe("reconciled");
  });

  it("refuses reconciliation that does not name the exact escaped event", () => {
    expect(() =>
      appendPatrolRunEvent(escapedDeliveredClosedRun(), {
        state: "reconciled",
        at: "2026-08-14T12:08:00.000Z",
        actor: "fleet-health",
        summary: "Claimed reconciliation",
        reconciliation: {
          candidateSha: CANDIDATE,
          escapedEventHash: "0".repeat(64),
          checks: ["claimed proof"],
        },
      }),
    ).toThrow("exact prior escaped-delivery event");
  });

  it("reconciles an escaped candidate that was rejected and replaced", () => {
    const escaped = appendPatrolRunEvent(
      appendPatrolRunEvent(run(), {
        state: "fixing",
        at: "2026-08-14T12:01:00.000Z",
        actor: "worker",
        summary: "Prepared candidate",
      }),
      {
        state: "infrastructure_blocked",
        at: "2026-08-14T12:02:00.000Z",
        actor: "worker",
        summary: "Preview blocked",
        blocker: { prerequisite: "preview" },
      },
    );
    const escapedCandidate = appendPatrolRunEvent(escaped, {
      state: "escaped_delivery",
      at: "2026-08-14T12:03:00.000Z",
      actor: "controller",
      summary: "Candidate escaped",
      escape: {
        candidateSha: CANDIDATE,
        integratedSha: CANDIDATE,
        release: "v0.4.1",
        reason: "released before certification",
      },
    });
    const escapeEvent = escapedCandidate.events.at(-1)!;
    const certifying = appendPatrolRunEvent(escapedCandidate, {
      state: "certifying",
      at: "2026-08-14T12:04:00.000Z",
      actor: "certifier",
      summary: "Reviewing escaped candidate",
      evidence: [`candidate:${CANDIDATE}`],
    });
    const rejected = appendPatrolRunEvent(certifying, {
      state: "rejected",
      at: "2026-08-14T12:05:00.000Z",
      actor: "certifier",
      summary: "Escaped candidate had a concrete defect",
    });
    const replacement = "b".repeat(40);
    const refixing = appendPatrolRunEvent(rejected, {
      state: "fixing",
      at: "2026-08-14T12:06:00.000Z",
      actor: "worker",
      summary: "Prepared replacement",
    });
    const recertifying = appendPatrolRunEvent(refixing, {
      state: "certifying",
      at: "2026-08-14T12:07:00.000Z",
      actor: "replacement-certifier",
      summary: "Reviewing replacement",
    });
    const certified = appendPatrolRunEvent(recertifying, {
      state: "certified",
      at: "2026-08-14T12:08:00.000Z",
      actor: "replacement-certifier",
      summary: "Replacement certified",
      certification: {
        verdict: "CERTIFIED",
        certifierTaskId: "replacement-certifier",
        candidateSha: replacement,
        checks: ["focused interaction"],
      },
    });
    const queued = appendPatrolRunEvent(certified, {
      state: "delivery_queued",
      at: "2026-08-14T12:09:00.000Z",
      actor: "controller",
      summary: "Replacement queued",
      delivery: { candidateSha: replacement, preservedRef: "refs/test" },
    });
    const delivered = appendPatrolRunEvent(queued, {
      state: "delivered",
      at: "2026-08-14T12:10:00.000Z",
      actor: "controller",
      summary: "Replacement delivered",
      delivery: {
        candidateSha: replacement,
        preservedRef: "refs/test",
        integratedSha: replacement,
        release: "v0.4.2",
      },
    });
    const closed = appendPatrolRunEvent(delivered, {
      state: "closed",
      at: "2026-08-14T12:11:00.000Z",
      actor: "controller",
      summary: "Replacement delivery closed",
    });
    const reconciled = appendPatrolRunEvent(closed, {
      state: "reconciled",
      at: "2026-08-14T12:12:00.000Z",
      actor: "controller",
      summary: "Rejected escape reconciled to replacement",
      reconciliation: {
        candidateSha: CANDIDATE,
        escapedEventHash: escapeEvent.eventHash,
        outcome: "exact_candidate_rejected",
        replacementCandidateSha: replacement,
        checks: ["exact candidate rejected", "replacement delivered"],
      },
    });

    expect(validatePatrolRunRecord(reconciled)).toEqual([]);
  });

  it.each([
    {
      name: "accepts a blocked exact attempt followed by a rejected exact retry",
      retryCandidate: CANDIDATE,
      accepted: true,
    },
    {
      name: "refuses to borrow a later candidate's rejection",
      retryCandidate: "c".repeat(40),
      accepted: false,
    },
  ])("$name", ({ retryCandidate, accepted }) => {
    let record = appendPatrolRunEvent(run(), {
      state: "fixing",
      at: "2026-08-14T12:01:00.000Z",
      actor: "worker",
      summary: "Prepared escaped candidate",
    });
    record = appendPatrolRunEvent(record, {
      state: "infrastructure_blocked",
      at: "2026-08-14T12:02:00.000Z",
      actor: "worker",
      summary: "Preview blocked",
      blocker: { prerequisite: "preview" },
    });
    record = appendPatrolRunEvent(record, {
      state: "escaped_delivery",
      at: "2026-08-14T12:03:00.000Z",
      actor: "controller",
      summary: "Candidate escaped",
      escape: {
        candidateSha: CANDIDATE,
        integratedSha: CANDIDATE,
        release: "v0.4.1",
        reason: "released before certification",
      },
    });
    const escapedEventHash = record.events.at(-1)!.eventHash;
    record = appendPatrolRunEvent(record, {
      state: "certifying",
      at: "2026-08-14T12:04:00.000Z",
      actor: "certifier",
      summary: "Reviewing exact escaped candidate",
      evidence: [`candidate:${CANDIDATE}`],
    });
    record = appendPatrolRunEvent(record, {
      state: "infrastructure_blocked",
      at: "2026-08-14T12:05:00.000Z",
      actor: "certifier",
      summary: "Exact attempt blocked without a verdict",
      blocker: { prerequisite: "stable browser" },
    });
    record = appendPatrolRunEvent(record, {
      state: "certifying",
      at: "2026-08-14T12:06:00.000Z",
      actor: "other-certifier",
      summary: "Reviewing a retry candidate",
      evidence: [`candidate:${retryCandidate}`],
    });
    record = appendPatrolRunEvent(record, {
      state: "rejected",
      at: "2026-08-14T12:07:00.000Z",
      actor: "other-certifier",
      summary: "Different candidate rejected",
    });
    record = appendPatrolRunEvent(record, {
      state: "fixing",
      at: "2026-08-14T12:08:00.000Z",
      actor: "worker",
      summary: "Prepared replacement",
    });
    const replacement = "d".repeat(40);
    record = appendPatrolRunEvent(record, {
      state: "certifying",
      at: "2026-08-14T12:09:00.000Z",
      actor: "replacement-certifier",
      summary: "Reviewing replacement",
    });
    record = appendPatrolRunEvent(record, {
      state: "certified",
      at: "2026-08-14T12:10:00.000Z",
      actor: "replacement-certifier",
      summary: "Replacement certified",
      certification: {
        verdict: "CERTIFIED",
        certifierTaskId: "replacement-certifier",
        candidateSha: replacement,
        checks: ["focused interaction"],
      },
    });
    record = appendPatrolRunEvent(record, {
      state: "delivery_queued",
      at: "2026-08-14T12:11:00.000Z",
      actor: "controller",
      summary: "Replacement queued",
      delivery: { candidateSha: replacement, preservedRef: "refs/test" },
    });
    record = appendPatrolRunEvent(record, {
      state: "delivered",
      at: "2026-08-14T12:12:00.000Z",
      actor: "controller",
      summary: "Replacement delivered",
      delivery: {
        candidateSha: replacement,
        preservedRef: "refs/test",
        integratedSha: replacement,
        release: "v0.4.2",
      },
    });
    record = appendPatrolRunEvent(record, {
      state: "closed",
      at: "2026-08-14T12:13:00.000Z",
      actor: "controller",
      summary: "Replacement delivery closed",
    });

    const reconcile = () =>
      appendPatrolRunEvent(record, {
        state: "reconciled",
        at: "2026-08-14T12:14:00.000Z",
        actor: "controller",
        summary: "Claimed escaped-candidate rejection",
        reconciliation: {
          candidateSha: CANDIDATE,
          escapedEventHash,
          outcome: "exact_candidate_rejected",
          replacementCandidateSha: replacement,
          checks: ["claimed rejection", "replacement delivered"],
        },
      });

    if (accepted) expect(reconcile).not.toThrow();
    else
      expect(reconcile).toThrow(
        "exact-candidate certification attempt and rejection",
      );
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

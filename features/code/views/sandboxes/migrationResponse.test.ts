import {
  classifySandboxMigrationFailure,
  canStartSandboxMigration,
  isLiveMigrationOutcome,
  parseSandboxMigrationStatus,
  sandboxMigrationMessage,
} from "./migrationResponse";

test("classifies a structured idle refusal as expected control flow", () => {
  const result = classifySandboxMigrationFailure(
    {
      error:
        "Sandbox update deferred: in-flight tool calls did not drain; retry later. No update was made.",
      status: "busy_deferred",
      details: {
        status: "busy_deferred",
        sandbox_id: "sbx-1",
        reason: "in-flight tool calls did not drain; retry later",
      },
    },
    409,
  );

  expect(result).toEqual({
    kind: "busy_deferred",
    message:
      "Sandbox update deferred: in-flight tool calls did not drain; retry later. No update was made.",
    code: "busy_deferred",
  });
});

test("retains the nested orchestrator reason when an older proxy has no error", () => {
  expect(
    sandboxMigrationMessage(
      {
        details: {
          detail: {
            status: "recovery_required",
            reason: "migration journal needs recovery",
          },
        },
      },
      "fallback",
    ),
  ).toBe("migration journal needs recovery");
});

test("prefers a structured reason over the proxy's generic error label", () => {
  expect(
    sandboxMigrationMessage(
      {
        error: "Sandbox image update failed",
        details: {
          detail: {
            status: "recovery_required",
            reason: "migration journal needs recovery",
          },
        },
      },
      "fallback",
    ),
  ).toBe("migration journal needs recovery");
});

test("keeps an unknown HTTP failure actionable by status", () => {
  expect(classifySandboxMigrationFailure({}, 502)).toEqual({
    kind: "failure",
    message: "Sandbox image update failed.",
    code: "http_502",
  });
});

test("does not hide a busy-shaped payload delivered as a server failure", () => {
  expect(
    classifySandboxMigrationFailure(
      {
        error: "Sandbox image update failed",
        details: {
          detail: {
            status: "busy_deferred",
            reason: "upstream returned the wrong transport status",
          },
        },
      },
      502,
    ),
  ).toEqual({
    kind: "failure",
    message: "upstream returned the wrong transport status",
    code: "busy_deferred",
  });
});

test("refuses a stale committed operation when reconnecting an exact operation", () => {
  expect(
    parseSandboxMigrationStatus(
      {
        sandbox_id: "sbx-1",
        operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "migrated",
        execution_state: "done",
        phase: "cleanup_complete",
      },
      { sandboxId: "sbx-1", operationId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    ),
  ).toBeNull();
});

test("only admits a discovered operation when it is still live", () => {
  const completed = parseSandboxMigrationStatus(
    {
      sandbox_id: "sbx-1",
      operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      outcome: "migrated",
      execution_state: "done",
      phase: "cleanup_complete",
    },
    { sandboxId: "sbx-1" },
  );
  const live = parseSandboxMigrationStatus(
    {
      sandbox_id: "sbx-1",
      operation_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      outcome: "recovering",
      execution_state: "running",
      phase: "rollback",
    },
    { sandboxId: "sbx-1" },
  );

  expect(completed && isLiveMigrationOutcome(completed.outcome)).toBe(false);
  expect(live && isLiveMigrationOutcome(live.outcome)).toBe(true);
});

test("blocks a second migration POST while an exact operation is already starting", () => {
  expect(canStartSandboxMigration(null, null)).toBe(true);
  expect(
    canStartSandboxMigration("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", null),
  ).toBe(false);
  expect(
    canStartSandboxMigration(null, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
  ).toBe(false);
});

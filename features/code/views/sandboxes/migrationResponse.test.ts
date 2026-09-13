import {
  classifySandboxMigrationFailure,
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

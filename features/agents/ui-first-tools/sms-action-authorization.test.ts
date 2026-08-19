import {
  parseSmsActionAuthorization,
  redactSmsActionArguments,
} from "./sms-action-authorization";

describe("SMS exact-action authorization", () => {
  it("accepts only the versioned exact-action envelope", () => {
    expect(
      parseSmsActionAuthorization({
        kind: "sms_consequential_action",
        version: 1,
        action_digest: "a".repeat(64),
        side_effect_class: "db_write",
        tool_name: "task_update",
        requested_at: "2026-08-18T00:00:00Z",
        expires_at: "2026-08-18T00:15:00Z",
      }),
    ).not.toBeNull();
    expect(
      parseSmsActionAuthorization({
        kind: "sms_consequential_action",
        version: 2,
        action_digest: "a".repeat(64),
      }),
    ).toBeNull();
  });

  it("never displays secret-bearing argument values", () => {
    expect(
      redactSmsActionArguments({
        task_id: "task-1",
        nested: { api_key: "raw-key", title: "Ship it" },
        authorization: "Bearer raw-token",
      }),
    ).toEqual({
      task_id: "task-1",
      nested: { api_key: "[sensitive value hidden]", title: "Ship it" },
      authorization: "[sensitive value hidden]",
    });
  });
});

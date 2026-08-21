import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

import {
  cloudBrowserAction,
  cloudBrowserActivity,
  cloudBrowserRunId,
  isCloudBrowserRun,
} from "./cloudBrowserRun";

function entry(
  partial: Partial<ToolLifecycleEntry> & { callId: string; toolName: string },
): ToolLifecycleEntry {
  return {
    displayName: partial.toolName,
    status: "completed",
    arguments: {},
    startedAt: "2026-08-21T10:00:00.000Z",
    completedAt: "2026-08-21T10:00:01.000Z",
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
    ...partial,
  };
}

describe("cloudBrowserRun", () => {
  test.each([
    "navigate",
    "click",
    "type_text",
    "select_option",
    "wait_for",
    "get_element",
    "scroll",
    "screenshot",
    "close",
  ])("recognizes the unified cloud_browser %s action", (action) => {
    expect(
      cloudBrowserAction(
        entry({
          callId: action,
          toolName: "cloud_browser",
          arguments: { action },
        }),
      ),
    ).toBe(action);
  });

  test.each(["list", "auto", "discover", "attempt", "authenticator", "report"])(
    "recognizes the Credential Login %s action",
    (action) => {
      expect(
        cloudBrowserAction(
          entry({
            callId: action,
            toolName: "credential_login",
            arguments: { action },
          }),
        ),
      ).toBe(`credential:${action}`);
    },
  );

  it("keeps Cloud Browser and Credential Login in one run", () => {
    expect(
      isCloudBrowserRun([
        entry({ callId: "nav", toolName: "cloud_browser_navigate" }),
        entry({ callId: "login", toolName: "credential_login" }),
        entry({ callId: "click", toolName: "cloud_browser_click" }),
      ]),
    ).toBe(true);
  });

  it("never repeats typed text in the compact activity label", () => {
    const activity = cloudBrowserActivity(
      entry({
        callId: "type",
        toolName: "cloud_browser",
        arguments: {
          action: "type_text",
          selector: "#password",
          text: "value-that-must-not-appear",
        },
        result: { selector: "#password", typed: "value-that-must-not-appear" },
      }),
    );

    expect(activity.label).toBe("Entered text in “#password”");
    expect(activity.label).not.toContain("value-that-must-not-appear");
  });

  it("promotes a screenshot media_ref into visual media", () => {
    const activity = cloudBrowserActivity(
      entry({
        callId: "shot",
        toolName: "cloud_browser",
        arguments: { action: "screenshot", session_id: "run-1" },
        result: {
          kind: "image_ref",
          media_ref: { file_id: "file-shot-1", mime_type: "image/png" },
          session_id: "run-1",
        },
      }),
    );

    expect(activity.label).toBe("Captured a screenshot");
    expect(activity.media).toEqual({
      file_id: "file-shot-1",
      mime_type: "image/png",
    });
  });

  it("derives the live browser run from results before later arguments", () => {
    expect(
      cloudBrowserRunId([
        entry({
          callId: "nav",
          toolName: "cloud_browser",
          arguments: { action: "navigate" },
          result: { session_id: "run-from-navigation" },
        }),
        entry({
          callId: "click",
          toolName: "cloud_browser",
          arguments: { action: "click", session_id: "run-from-navigation" },
        }),
      ]),
    ).toBe("run-from-navigation");
  });

  it("humanizes Credential Login outcomes without exposing credential ids", () => {
    const activity = cloudBrowserActivity(
      entry({
        callId: "login",
        toolName: "credential_login",
        arguments: {
          action: "authenticator",
          credential_item_id: "credential-item-private-id",
        },
        result: { status: "authenticated" },
      }),
    );

    expect(activity.label).toBe("Signed in securely");
    expect(activity.label).not.toContain("credential-item-private-id");
  });
});

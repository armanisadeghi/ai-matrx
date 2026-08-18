import { captureApiError } from "@/lib/diagnostics/captureApiError";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

describe("captureApiError", () => {
  beforeEach(() => {
    clearCapturedErrors();
    window.history.replaceState({}, "", "/");
  });

  it.each([
    "/audio/transcribe",
    "/audio/transcribe-url",
    "/vision-interview/sessions/{session_id}/start",
  ])(
    "keeps recoverable vision-interview Load failed diagnostics out of persistence for %s",
    (path) => {
      window.history.replaceState(
        {},
        "",
        "/vision-interview/72175649-568b-45e1-95d0-a5fb638af20b",
      );

      captureApiError(
        {
          type: "network_error",
          message: "Load failed",
          name: "TypeError",
          raw: { name: "TypeError", message: "Load failed" },
        },
        {
          url: `https://server.app.matrxserver.com${path}`,
          method: "POST",
          path,
        },
      );

      expect(getSnapshot()[0]).toMatchObject({
        source: "api-network",
        tier: "yellow",
        tierRuleId: "vision-interview-deploy-transport-loss",
        route: "/vision-interview/72175649-568b-45e1-95d0-a5fb638af20b",
        relation: `POST ${path}`,
        code: "network_error",
        message: "Load failed",
      });
    },
  );

  it("keeps a content-plan reconcile fetch outage out of persistence", () => {
    const siteId = "8cc4ba7b-2817-47f4-aef6-8b6b2028dd7d";
    const path = `/content-plan/sites/${siteId}/reconcile`;
    window.history.replaceState({}, "", `/marketing/content-plan/${siteId}`);

    captureApiError(
      {
        type: "network_error",
        message: "Failed to fetch",
        name: "TypeError",
        raw: { name: "TypeError", message: "Failed to fetch" },
      },
      {
        url: `https://server.app.matrxserver.com${path}`,
        method: "POST",
        path,
      },
    );

    expect(getSnapshot()[0]).toMatchObject({
      source: "api-network",
      tier: "yellow",
      tierRuleId: "content-plan-reconcile-transport-loss",
      route: `/marketing/content-plan/${siteId}`,
      relation: `POST ${path}`,
      code: "network_error",
      name: "TypeError",
      message: "Failed to fetch",
    });
  });

  it("keeps a retryable Mandate code-truth outage out of persistence", () => {
    window.history.replaceState({}, "", "/administration/agents/mandates");

    captureApiError(
      {
        type: "network_error",
        message: "Failed to fetch",
        name: "TypeError",
        raw: { name: "TypeError", message: "Failed to fetch" },
      },
      {
        url: "https://server.app.matrxserver.com/mandates/code-truth",
        method: "GET",
        path: "/mandates/code-truth",
      },
    );

    expect(getSnapshot()[0]).toMatchObject({
      source: "api-network",
      tier: "yellow",
      tierRuleId: "mandate-code-truth-read-transport-loss",
      route: "/administration/agents/mandates",
      relation: "GET /mandates/code-truth",
      code: "network_error",
      message: "Failed to fetch",
    });
  });
});

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

  it("keeps a structured CMS-unavailable refusal local at the API capture boundary", () => {
    const siteId = "8cc4ba7b-2817-47f4-aef6-8b6b2028dd7d";
    const cmsSiteId = "4d536826-9795-4788-bbfa-3fc77a59767a";
    const path = `/content-plan/sites/${siteId}/cms-pages`;
    window.history.replaceState({}, "", `/marketing/content-plan/${siteId}`);

    captureApiError(
      {
        type: "validation_error",
        message:
          "CMS database is not configured on this server. Set the SUPABASE_CMS_* environment variables (Supavisor pooler form) and retry.",
        status: 400,
        serverDetail: {
          error: "cms_unavailable",
          user_message: "The CMS is temporarily unavailable.",
          request_id: "180c9f9587d4428289a1f02487ea321b",
        },
      },
      {
        url: `https://server.app.matrxserver.com${path}?cms_site=${cmsSiteId}`,
        method: "GET",
        path,
      },
    );

    expect(getSnapshot()[0]).toMatchObject({
      source: "api-http",
      tier: "yellow",
      tierRuleId: "cms-unavailable-capability-refusal",
      route: `/marketing/content-plan/${siteId}`,
      relation: `GET ${path}`,
      code: "cms_unavailable",
      status: 400,
      requestId: "180c9f9587d4428289a1f02487ea321b",
      userMessage: "The CMS is temporarily unavailable.",
    });
  });

  it.each(["conflict", "unresolved_variables"])(
    "keeps an outreach merge-field refusal local at the API capture boundary for %s",
    (backendCode) => {
      const outreachListId = "7888326d-06e2-4c6d-8690-088a872aad1b";
      const message =
        "This message still has unresolved variables: case.missing_field. Fill them from the target record before sending.";
      window.history.replaceState(
        {},
        "",
        `/crm/outreach-lists/${outreachListId}`,
      );

      captureApiError(
        {
          type: "validation_error",
          message,
          status: 409,
          serverDetail: {
            error: backendCode,
            message,
            user_message: message,
            request_id: "7f07da9754cd4e4bad672e8ff90b916a",
            details: {
              code: "unresolved_variables",
              message,
              fix: "Fill every named field on the real target record or edit the template.",
              unresolved: ["case.missing_field"],
            },
          },
        },
        {
          url: "https://server.app.matrxserver.com/outreach/single/drafts",
          method: "POST",
          path: "/outreach/single/drafts",
        },
      );

      expect(getSnapshot()[0]).toMatchObject({
        source: "api-http",
        tier: "yellow",
        tierRuleId: "outreach-draft-unresolved-variables",
        route: `/crm/outreach-lists/${outreachListId}`,
        relation: "POST /outreach/single/drafts",
        code: backendCode,
        status: 409,
        message,
        requestId: "7f07da9754cd4e4bad672e8ff90b916a",
      });
    },
  );

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

  it("keeps a retryable browser-worker restart out of persistence", () => {
    captureApiError(
      {
        type: "http_error",
        status: 503,
        message: "The browser worker is restarting. Retry this action shortly.",
        name: "BackendApiError",
        raw: {},
        serverDetail: {
          error: "worker_unreachable",
          message: "The browser worker is restarting. Retry this action shortly.",
          user_message: "The browser worker is restarting. Retry this action shortly.",
          details: { retryable: true },
        },
      },
      {
        url: "https://server.app.matrxserver.com/browser-manager/runs/run-id/claim-control",
        method: "POST",
        path: "/browser-manager/runs/run-id/claim-control",
      },
    );

    expect(getSnapshot()).toHaveLength(0);
  });
});

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
});

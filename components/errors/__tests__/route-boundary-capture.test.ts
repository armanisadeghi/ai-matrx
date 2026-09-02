import fs from "node:fs";
import path from "node:path";

describe("route error boundary diagnostics", () => {
  it("mirrors an already captured render failure without creating a console-error duplicate", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/errors/ErrorBoundaryView.tsx"),
      "utf8",
    );

    expect(source).toContain("captureReactRenderError(error");
    expect(source).toContain("mirrorCapturedErrorToConsole(");
    expect(source).not.toContain(
      "console.error(`[ErrorBoundary${context ? ` — ${context}` : \"\"}]`, error)",
    );
  });
});

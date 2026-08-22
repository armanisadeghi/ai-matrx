import fs from "node:fs";
import path from "node:path";

describe("CloudBrowserBody control failure boundary", () => {
  it("handles control rejections without filing duplicate toast errors", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "CloudBrowserBody.tsx"),
      "utf8",
    );

    const controlHandlers = source.slice(
      source.indexOf("const claimControl"),
      source.indexOf("// The agent-raised capture card"),
    );

    expect(controlHandlers.match(/catch \(error\)/g)).toHaveLength(3);
    expect(controlHandlers.match(/toastErrorAlreadyCaptured\(/g)).toHaveLength(3);
    expect(controlHandlers).not.toContain("toast.error(");
  });
});

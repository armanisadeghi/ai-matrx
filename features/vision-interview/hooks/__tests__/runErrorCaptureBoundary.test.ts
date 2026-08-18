import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("vision interview run error capture boundary", () => {
  const source = readFileSync(
    resolve(process.cwd(), "features/vision-interview/hooks/useInterviewRun.ts"),
    "utf8",
  );

  it("renders returned callApi failures without filing a duplicate toast row", () => {
    expect(source).toContain(
      'import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";',
    );
    expect(source).toContain("toastErrorAlreadyCaptured(message);");
    expect(source).not.toContain(
      'toast.error(error.message ?? "The interview run could not start.")',
    );
  });
});

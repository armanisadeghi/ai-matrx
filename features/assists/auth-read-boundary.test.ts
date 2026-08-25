import fs from "node:fs";
import path from "node:path";

describe("assist authenticated read boundary", () => {
  const featureRoot = path.resolve(__dirname);

  it.each(["components/AssistsDock.tsx", "components/AssistStrip.tsx"])(
    "%s waits for a ready authenticated Supabase session",
    (relativePath) => {
      const source = fs.readFileSync(path.join(featureRoot, relativePath), "utf8");

      expect(source).toContain("selectAuthReady");
      expect(source).toContain("selectAccessToken");
      expect(source).toMatch(/authReady[\s\S]*userId[\s\S]*accessToken/);
      expect(source).toMatch(/dispatch\(fetchMyAssists\(\{ userId \}\)\)/);
    },
  );
});

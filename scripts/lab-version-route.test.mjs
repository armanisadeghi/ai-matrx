import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { findPageFile } = require("next/dist/server/lib/find-page-file");
const root = fileURLToPath(new URL("../", import.meta.url));

for (const profile of ["lab", "slim", "admin", "demos"]) {
  test(`${profile} production exposes the deployment identity route`, async () => {
    const output = execFileSync(process.execPath, ["-e", `
      const loadConfig = require("next/dist/server/config").default;
      loadConfig("phase-production-build", process.cwd()).then(config => {
        console.log("EXTENSIONS=" + JSON.stringify(config.pageExtensions));
      });
    `], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", MATRX_PROFILE: profile, VERCEL: "" },
    });
    const extensions = JSON.parse(output.split("EXTENSIONS=")[1].trim());
    assert.equal(
      await findPageFile(`${root}app`, "/api/version/route", extensions, true),
      profile === "lab" ? "/api/version/route.labroot.tsx" : "/api/version/route.ts",
    );
  });
}

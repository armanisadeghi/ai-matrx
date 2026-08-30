import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { generateRouteManifest } from "./generate";

describe("route manifest PageShell classification", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "route-manifest-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function page(route: string, source: string): void {
    const dir = path.join(repoRoot, "app", route);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "page.tsx"), source);
  }

  it("only marks PageShell routes as placeholders when they carry a promiseKey", async () => {
    page("files/live", 'export default () => <PageShell section="all" />;');
    page(
      "files/requests",
      'export default () => <PageShell section="requests" promiseKey="files.file-requests" />;',
    );

    const manifest = await generateRouteManifest(repoRoot);

    expect(manifest.routes).toEqual([
      expect.objectContaining({ pattern: "/files/live", status: "live" }),
      expect.objectContaining({
        pattern: "/files/requests",
        status: "placeholder",
        promiseKey: "files.file-requests",
      }),
    ]);
  });
});

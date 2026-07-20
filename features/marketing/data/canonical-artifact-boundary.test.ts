import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MARKETING_ROOTS = [
  join(process.cwd(), "features", "marketing"),
  join(process.cwd(), "app", "(core)", "marketing"),
];
const THIS_FILE = "canonical-artifact-boundary.test.ts";

function runtimeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeFiles(path);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx"))
      return [];
    return entry.name === THIS_FILE ? [] : [path];
  });
}

test("Marketing has no Supabase Storage crawler compatibility lane", () => {
  const forbidden = [
    "user-public-assets",
    "supabase://",
    "body_ref",
    "markdown_ref",
    "storage_bucket",
    "storage_path",
    "/storage/v1/object",
    "getPublicUrl(",
  ];
  const violations = MARKETING_ROOTS.flatMap(runtimeFiles).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return forbidden
      .filter((token) => source.includes(token))
      .map((token) => `${path}: ${token}`);
  });

  expect(violations).toEqual([]);
});

test("crawler artifact migrations replay in a safe lexical order", () => {
  const migrationRoot = join(process.cwd(), "migrations");
  const names = readdirSync(migrationRoot)
    .filter((name) => name.startsWith("web_crawl_artifact"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const position = (name: string) => {
    const index = names.indexOf(name);
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
  };

  expect(position("web_crawl_artifact_00_bootstrap.sql")).toBeLessThan(
    position("web_crawl_artifact_access_finalize.sql"),
  );
  expect(position("web_crawl_artifacts_files_only.sql")).toBeLessThan(
    position("web_crawl_artifacts_replay_bridge.sql"),
  );
  expect(position("web_crawl_artifacts_replay_bridge.sql")).toBeLessThan(
    position("web_crawl_artifacts_use_files.sql"),
  );
  expect(position("web_crawl_artifacts_use_files.sql")).toBeLessThan(
    position("web_crawl_artifacts_zz_canonical_finalize.sql"),
  );
  expect(names.at(-1)).toBe(
    "web_crawl_artifacts_zz_canonical_finalize.sql",
  );
});

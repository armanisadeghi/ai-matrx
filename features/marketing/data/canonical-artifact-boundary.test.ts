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

test("Marketing uses canonical Files UUIDs without crawler compatibility lanes", () => {
  const forbidden = [
    "body_ref",
    "markdown_ref",
    "storage_bucket",
    "storage_path",
  ];
  const violations = MARKETING_ROOTS.flatMap(runtimeFiles).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return forbidden
      .filter((token) => source.includes(token))
      .map((token) => `${path}: ${token}`);
  });

  expect(violations).toEqual([]);
});

test("the direct Files relationship migration supersedes association access", () => {
  const migrationRoot = join(process.cwd(), "migrations");
  const names = readdirSync(migrationRoot)
    .filter((name) => name.startsWith("web_crawl_artifact"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const finalName = names.at(-1);
  expect(finalName).toBe("web_crawl_artifacts_zzz_direct_file_access.sql");
  if (!finalName) throw new Error("Crawler artifact migration is missing");
  const finalSql = readFileSync(join(migrationRoot, finalName), "utf8");
  expect(finalSql).toContain("from web.snapshot");
  expect(finalSql).toContain("from web.screenshot");
  expect(finalSql).toContain("delete from platform.associations");
  expect(finalSql).not.toContain("join platform.associations");
});

#!/usr/bin/env tsx
/**
 * Enforce the scraper's single browser transport boundary.
 *
 * Every consumer imports useScraperApi. Only that hook may select the scraper
 * service or combine scraper endpoint constants with a transport. A Next.js
 * scraper proxy, a direct fetch, or a second service-owning hook is a defect.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SCAN_DIRS = ["app", "components", "features", "hooks", "lib"];
const CANONICAL_CLIENT = "features/scraper/hooks/useScraperApi.ts";
const SCRAPER_ENDPOINT =
  /\/(?:api\/)?scraper\/(?:quick-scrape|search|search-and-scrape|search-and-scrape-limited|mic-check)/;
const TRANSPORT =
  /\b(?:fetch|requestRaw)\s*\(|\b(?:api|client)\.(?:get|post|put|patch|delete)\s*\(/;
const ENDPOINT_CONSTANT = /\bENDPOINTS\.scraper\b/;
const SCRAPER_SERVICE = /\buseBackendApi\s*\(\s*["']scraper["']\s*\)/;

function executableSource(source: string): string {
  const blank = (value: string) => value.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^\s*\/\/.*$/gm, blank);
}

function walk(directory: string, files: string[]): void {
  for (const name of readdirSync(directory, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name.startsWith(".next")) continue;
    const path = join(directory, name.name);
    if (name.isDirectory()) walk(path, files);
    else if (name.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(name.name)) {
      files.push(path);
    }
  }
}

const files: string[] = [];
for (const directory of SCAN_DIRS) {
  const path = join(ROOT, directory);
  if (statSync(path).isDirectory()) walk(path, files);
}

const violations: string[] = [];
for (const path of files) {
  const file = relative(ROOT, path).replace(/\\/g, "/");
  const code = executableSource(readFileSync(path, "utf8"));

  if (file.startsWith("app/api/scraper/") && file.endsWith("/route.ts")) {
    violations.push(`${file}: Next.js scraper proxies are forbidden`);
  }
  if (file === CANONICAL_CLIENT) continue;
  if (ENDPOINT_CONSTANT.test(code)) {
    violations.push(
      `${file}: imports or reads ENDPOINTS.scraper outside the canonical hook`,
    );
  }
  if (SCRAPER_SERVICE.test(code)) {
    violations.push(
      `${file}: selects the scraper service outside the canonical hook`,
    );
  }
  if (SCRAPER_ENDPOINT.test(code) && TRANSPORT.test(code)) {
    violations.push(
      `${file}: transports a scraper endpoint outside the canonical hook`,
    );
  }
}

if (violations.length > 0) {
  console.error("check:scraper-routing FAILED\n");
  for (const violation of violations) console.error(`- ${violation}`);
  console.error(
    "\nAll browser callers must use features/scraper/hooks/useScraperApi.ts.",
  );
  process.exit(1);
}

console.log(
  "check:scraper-routing — OK. One scraper service owner, no direct transports or Next.js proxies.",
);

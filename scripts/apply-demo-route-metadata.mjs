/**
 * One-off: add createRouteMetadata to demo route pages (and client-only layouts).
 * Run: node scripts/apply-demo-route-metadata.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const TREES = [
  { relDir: "app/(dev)/demos/general", baseUrl: "/demos/general" },
  { relDir: "app/(dev)/demos", baseUrl: "/demos" },
];

const META_IMPORT = `import { createRouteMetadata } from "@/utils/route-metadata";`;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name === "page.tsx" || name === "page.dev.tsx") out.push(p);
  }
  return out;
}

function urlPathForPage(pageFile, absBaseDir, baseUrl) {
  const dir = path.dirname(pageFile);
  const rel = path.relative(absBaseDir, dir).replace(/\\/g, "/");
  if (!rel || rel === ".") return baseUrl;
  return `${baseUrl}/${rel}`;
}

function humanTitle(urlPath, baseUrl) {
  const rest = urlPath === baseUrl ? "" : urlPath.slice(baseUrl.length + 1);
  if (!rest) {
    if (baseUrl === "/demo") return "Demo";
    if (baseUrl === "/demos") return "Demos";
    return "Demo";
  }
  return rest
    .split("/")
    .map((seg) =>
      seg
        .split("-")
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" "),
    )
    .join(" ");
}

function isClientPage(src) {
  return /^['"]use client['"]\s*;?\s*$/m.test(src);
}

function hasGenerateMetadata(src) {
  return /export\s+async\s+function\s+generateMetadata\b/.test(src);
}

function hasCreateRouteMetadata(src) {
  return /createRouteMetadata\s*\(/.test(src);
}

function findInsertIndex(lines) {
  let i = 0;
  if (i < lines.length && /^['"]use client['"]\s*;?\s*$/.test(lines[i].trim())) {
    i++;
  }
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("//")) {
      i++;
      continue;
    }
    if (t.startsWith("import ") || t.startsWith("import type ")) {
      while (i < lines.length && !/from\s+['"][^'"]+['"]\s*;?\s*$/.test(lines[i])) {
        i++;
      }
      i++;
      continue;
    }
    break;
  }
  return i;
}

function escapeString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function makeMetadataBlock(urlPath, title, description) {
  return `export const metadata = createRouteMetadata("${urlPath}", {
  title: "${escapeString(title)}",
  description: "${escapeString(description)}",
});
`;
}

function ensureImport(lines) {
  const text = lines.join("\n");
  if (text.includes('@/utils/route-metadata"') || text.includes("@/utils/route-metadata'")) {
    return lines;
  }
  const idx = findInsertIndex(lines);
  lines.splice(idx, 0, META_IMPORT, "");
  return lines;
}

/** Remove export const metadata = ... ; */
function stripMetadataExport(src) {
  return src.replace(/export\s+const\s+metadata[\s\S]*?\n\};\s*\n?/m, "");
}

function processServerPage(filePath, urlPath, title, description) {
  const layoutPath = path.join(path.dirname(filePath), "layout.tsx");
  if (fs.existsSync(layoutPath)) {
    const lay = fs.readFileSync(layoutPath, "utf8");
    if (hasCreateRouteMetadata(lay)) {
      return "skip:layoutHasCRM";
    }
  }

  let src = fs.readFileSync(filePath, "utf8");
  if (hasGenerateMetadata(src)) return "skip:generateMetadata";
  if (hasCreateRouteMetadata(src)) return "skip:pageHasCRM";

  const block = makeMetadataBlock(urlPath, title, description);
  if (/export\s+const\s+metadata\b/.test(src)) {
    src = stripMetadataExport(src);
  }

  let lines = src.split("\n");
  lines = ensureImport(lines);
  const insertAt = findInsertIndex(lines);
  const metaLines = block.trimEnd().split("\n");
  lines.splice(insertAt, 0, ...metaLines, "");
  fs.writeFileSync(filePath, lines.join("\n"));

  if (fs.existsSync(layoutPath)) {
    let lay = fs.readFileSync(layoutPath, "utf8");
    if (/export\s+const\s+metadata\b/.test(lay)) {
      lay = stripMetadataExport(lay);
      lay = lay.replace(/\n{3,}/g, "\n\n");
      fs.writeFileSync(layoutPath, lay);
    }
  }

  return "updated:page";
}

const LAYOUT_TEMPLATE = (urlPath, title, description) => `${META_IMPORT}

${makeMetadataBlock(urlPath, title, description)}
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
`;

function processClientPage(pageFile, urlPath, title, description) {
  const dir = path.dirname(pageFile);
  const layoutPath = path.join(dir, "layout.tsx");
  const desc = `Interactive demo: ${title}. AI Matrx demo route.`;

  if (fs.existsSync(layoutPath)) {
    let lay = fs.readFileSync(layoutPath, "utf8");
    if (hasCreateRouteMetadata(lay)) return "skip:layoutCRM";
    if (/export\s+const\s+metadata\b/.test(lay)) {
      lay = stripMetadataExport(lay);
    }
    let lines = lay.split("\n");
    lines = ensureImport(lines);
    const insertAt = findInsertIndex(lines);
    const metaLines = makeMetadataBlock(urlPath, title, desc).trimEnd().split("\n");
    lines.splice(insertAt, 0, ...metaLines, "");
    fs.writeFileSync(layoutPath, lines.join("\n"));
    return "updated:layout";
  }

  fs.writeFileSync(layoutPath, LAYOUT_TEMPLATE(urlPath, title, desc));
  return "created:layout";
}

const stats = {};

function bump(k) {
  stats[k] = (stats[k] || 0) + 1;
}

for (const { relDir, baseUrl } of TREES) {
  const absBase = path.join(ROOT, relDir);
  const pages = walk(absBase);

  for (const pageFile of pages) {
    const urlPath = urlPathForPage(pageFile, absBase, baseUrl);
    const title = humanTitle(urlPath, baseUrl);
    const description = `Interactive demo: ${title}. AI Matrx demo route.`;

    const src = fs.readFileSync(pageFile, "utf8");

    if (isClientPage(src)) {
      bump(processClientPage(pageFile, urlPath, title, description));
    } else {
      bump(processServerPage(pageFile, urlPath, title, description));
    }
  }
}

console.log(JSON.stringify(stats, null, 2));

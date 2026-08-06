#!/usr/bin/env tsx
/**
 * ⛔ RETIRED (2026-07-26, doc-consolidation Wave 5) — DO NOT RUN.
 * The type-drift campaign is complete and its output directory
 * (docs/type-drift/generated/) was ARCHIVED in Wave 2 (see
 * docs/archive/2026/handoff__doc-consolidation-campaign.md). Re-running this script would
 * recreate the archived directory and regrow the doc jungle. The script is
 * kept for reference only; it exits with a loud error below. If a new
 * type-drift campaign ever starts, retarget OUT_DIR to a live location and
 * remove the guard.
 *
 * Type-drift hitlist generator — finds hand-written types that duplicate names
 * already defined in types/python-generated/.
 *
 * Usage:
 *   pnpm generate:type-drift-hitlists
 *
 * Outputs (regenerated, do not hand-edit):
 *   docs/type-drift/generated/summary.md
 *   docs/type-drift/generated/all-offenders.md
 *   docs/type-drift/generated/wave-1-priority.md
 *   docs/type-drift/generated/by-feature/<feature>.md
 *
 * Fix doctrine: .claude/skills/type-fixing-agent/SKILL.md
 * Worked example: docs/type-drift-openapi-alias-example.md
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ⛔ Wave-5 guard: campaign complete, output dir archived. See banner above.
// Escape hatch (deliberate friction): set MATRX_ALLOW_ARCHIVED_REGENERATOR=1
// only after retargeting OUT_DIR to a live, non-archived location.
if (process.env.MATRX_ALLOW_ARCHIVED_REGENERATOR !== "1") {
console.error("");
console.error("============================================================");
console.error("  [FAIL] generate-type-drift-hitlists.ts is RETIRED");
console.error("============================================================");
console.error("  The type-drift campaign is COMPLETE and its output directory");
console.error("  (docs/type-drift/generated/) was ARCHIVED in the doc-consolidation");
console.error("  campaign, Wave 2. Running this script would recreate the archived");
console.error("  directory and regrow the doc jungle.");
console.error("");
console.error("  See: docs/archive/2026/handoff__doc-consolidation-campaign.md (Regenerator hazard)");
console.error("  If you truly need a new campaign, retarget OUT_DIR to a live");
console.error("  location and remove this guard in the same PR.");
console.error("");
process.exit(1);
}

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "docs/type-drift/generated");
const API_TYPES_PATH = join(ROOT, "types/python-generated/api-types.ts");
const STREAM_EVENTS_PATH = join(
  ROOT,
  "types/python-generated/stream-events.ts",
);

type GeneratedSource = "api-types" | "stream-events";
type OffenderKind = "interface" | "type";
type Status = "duplicate" | "derived-ok" | "alias-ok" | "name-collision";

interface Offender {
  name: string;
  kind: OffenderKind;
  source: GeneratedSource;
  file: string;
  line: number;
  feature: string;
  status: Status;
  notes?: string;
}

function extractOpenApiSchemaNames(content: string): Set<string> {
  const match = content.match(
    /schemas:\s*\{([\s\S]*?)\n\s{4}\};\n\s{4}responses:/,
  );
  if (!match) throw new Error("Could not parse schemas block in api-types.ts");
  const names = new Set<string>();
  for (const m of match[1].matchAll(
    /^\s{8}([A-Za-z][A-Za-z0-9_]*):\s*(?:\{|components)/gm,
  )) {
    names.add(m[1]);
  }
  return names;
}

function extractStreamEventTypeNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const m of content.matchAll(/^export (?:interface|type) (\w+)/gm)) {
    names.add(m[1]);
  }
  return names;
}

function listFeatureTypeFiles(): string[] {
  const out = execSync(
    `git ls-files 'features/**/*.ts' 'features/**/*.tsx' 'types/**/*.ts' 'types/**/*.tsx' 'components/**/*.ts' 'components/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx' 'app/**/*.ts' 'app/**/*.tsx'`,
    { encoding: "utf8", cwd: ROOT },
  );
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter(
      (f) =>
        !f.startsWith("types/python-generated/") &&
        !f.startsWith("types/generated/") &&
        !f.endsWith(".test.ts") &&
        !f.endsWith(".test.tsx") &&
        !f.includes("/__tests__/") &&
        !f.endsWith(".generated.ts"),
    );
}

function classifyExport(
  content: string,
  name: string,
  kind: OffenderKind,
  lineIndex: number,
): Status {
  const window = content
    .split("\n")
    .slice(lineIndex, lineIndex + 8)
    .join("\n");

  if (
    kind === "type" &&
    /export type \w+\s*=\s*components\[/.test(window.replace(name, name))
  ) {
    if (/NonNullableFields\s*</.test(window)) return "derived-ok";
    return "alias-ok";
  }

  if (kind === "type" && /NonNullableFields\s*<\s*components\[/.test(window)) {
    return "derived-ok";
  }

  // Internal camelCase vs wire snake_case — same schema name, different convention
  if (name === "ClientToolResult" && /callId|toolName/.test(window)) {
    return "name-collision";
  }

  return "duplicate";
}

function scanFile(
  file: string,
  schemaNames: Set<string>,
  streamNames: Set<string>,
): Offender[] {
  const content = readFileSync(join(ROOT, file), "utf8");
  const lines = content.split("\n");
  const feature = file.match(/^features\/([^/]+)/)?.[1] ?? "(non-feature)";
  const offenders: Offender[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^export (interface|type) (\w+)/);
    if (!m) continue;

    const kind = m[1] as OffenderKind;
    const name = m[2];

    const inApi = schemaNames.has(name);
    const inStream = streamNames.has(name);
    if (!inApi && !inStream) continue;

    const source: GeneratedSource = inApi ? "api-types" : "stream-events";
    const status = classifyExport(content, name, kind, i);

    offenders.push({
      name,
      kind,
      source,
      file,
      line: i + 1,
      feature,
      status,
      notes:
        status === "name-collision"
          ? "Same name as wire type; internal shape differs — rename local type, alias wire separately"
          : undefined,
    });
  }

  return offenders;
}

function priorityScore(o: Offender): number {
  let s = 0;
  if (o.status === "duplicate") s += 20;
  if (o.status === "name-collision") s += 15;
  if (o.feature === "agents") s += 12;
  if (o.source === "api-types") s += 8;
  if (o.kind === "interface") s += 5;
  if (o.file.includes("agent-api-types") || o.file.includes("message-types"))
    s += 10;
  if (o.file.includes("agentService.types")) s += 8;
  if (o.file === "features/pdf-extractor/types.ts") s += 6;
  return s;
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "_None._\n";
  const header = rows[0];
  const sep = header.map(() => "---");
  const body = rows.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

function writeSummary(all: Offender[]): void {
  const duplicates = all.filter((o) => o.status === "duplicate");
  const byStatus = Object.groupBy(all, (o) => o.status);
  const byFeature = Object.groupBy(duplicates, (o) => o.feature);
  const bySource = Object.groupBy(duplicates, (o) => o.source);

  const featureRows = Object.entries(byFeature ?? {})
    .sort((a, b) => b[1]!.length - a[1]!.length)
    .map(([f, items]) => [String(items!.length), f]);

  const lines = [
    "# Type drift — generated summary",
    "",
    `_Generated: ${new Date().toISOString()}_`,
    "",
    "Regenerate: `pnpm generate:type-drift-hitlists`",
    "",
    "## Counts",
    "",
    mdTable([
      ["Category", "Count"],
      ["Total name matches scanned", String(all.length)],
      ["Actionable duplicates", String(duplicates.length)],
      ["Proper aliases (skip)", String(byStatus["alias-ok"]?.length ?? 0)],
      ["Derived wrappers (skip)", String(byStatus["derived-ok"]?.length ?? 0)],
      [
        "Name collisions (rename)",
        String(byStatus["name-collision"]?.length ?? 0),
      ],
      ["OpenAPI (`api-types`)", String(bySource["api-types"]?.length ?? 0)],
      [
        "Stream (`stream-events`)",
        String(bySource["stream-events"]?.length ?? 0),
      ],
    ]),
    "",
    "## Duplicates by feature",
    "",
    mdTable([["Count", "Feature"], ...featureRows]),
    "",
    "## Per-feature hitlists",
    "",
    ...Object.keys(byFeature ?? {})
      .sort()
      .map((f) => {
        const link =
          f === "(non-feature)"
            ? "_non-feature_"
            : f.replace(/[^a-zA-Z0-9_-]+/g, "_");
        return `- [${f}.md](./by-feature/${link}.md)`;
      }),
    "",
  ];

  writeFileSync(join(OUT_DIR, "summary.md"), lines.join("\n"));
}

function writeAllOffenders(all: Offender[]): void {
  const rows = all
    .filter((o) => o.status === "duplicate" || o.status === "name-collision")
    .sort(
      (a, b) =>
        a.feature.localeCompare(b.feature) ||
        a.file.localeCompare(b.file) ||
        a.line - b.line,
    )
    .map((o) => [
      o.name,
      o.kind,
      o.source,
      o.status,
      `\`${o.file}:${o.line}\``,
      o.notes ?? "",
    ]);

  const content = [
    "# Type drift — all actionable offenders",
    "",
    `_Generated: ${new Date().toISOString()}_`,
    "",
    "Regenerate: `pnpm generate:type-drift-hitlists`",
    "",
    mdTable([
      ["Type", "Kind", "Source", "Status", "Location", "Notes"],
      ...rows,
    ]),
    "",
  ].join("\n");

  writeFileSync(join(OUT_DIR, "all-offenders.md"), content);
}

function writeWave1(all: Offender[]): void {
  const priority = all
    .filter((o) => o.status === "duplicate" || o.status === "name-collision")
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, 40);

  const rows = priority.map((o, i) => [
    String(i + 1),
    o.name,
    o.source,
    o.status,
    `\`${o.file}:${o.line}\``,
    o.notes ?? "",
  ]);

  const content = [
    "# Type drift — wave 1 priority (top 40)",
    "",
    `_Generated: ${new Date().toISOString()}_`,
    "",
    "Ordered by estimated blast radius (agents wire boundary > interfaces > feature concentration).",
    "",
    "Regenerate: `pnpm generate:type-drift-hitlists`",
    "",
    mdTable([["#", "Type", "Source", "Status", "Location", "Notes"], ...rows]),
    "",
  ].join("\n");

  writeFileSync(join(OUT_DIR, "wave-1-priority.md"), content);
}

function writeByFeature(all: Offender[]): void {
  const byFeature = Object.groupBy(
    all.filter(
      (o) => o.status === "duplicate" || o.status === "name-collision",
    ),
    (o) => o.feature,
  );

  const featureDir = join(OUT_DIR, "by-feature");
  mkdirSync(featureDir, { recursive: true });

  for (const [feature, items] of Object.entries(byFeature ?? {}).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const sorted = items!.sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    );

    const byFile = Object.groupBy(sorted, (o) => o.file);

    const sections: string[] = [
      `# ${feature} — type drift hitlist`,
      "",
      `_Generated: ${new Date().toISOString()}_`,
      "",
      `**${sorted.length}** actionable duplicates in this feature.`,
      "",
      "Regenerate: `pnpm generate:type-drift-hitlists`",
      "",
    ];

    for (const [file, fileItems] of Object.entries(byFile ?? {}).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      sections.push(`## \`${file}\` (${fileItems!.length})`, "");
      sections.push(
        mdTable([
          ["Type", "Kind", "Source", "Line", "Status", "Notes"],
          ...fileItems!.map((o) => [
            o.name,
            o.kind,
            o.source,
            String(o.line),
            o.status,
            o.notes ?? "",
          ]),
        ]),
      );
      sections.push("");
    }

    const safeName =
      feature === "(non-feature)"
        ? "_non-feature_"
        : feature.replace(/[^a-zA-Z0-9_-]+/g, "_");
    writeFileSync(join(featureDir, `${safeName}.md`), sections.join("\n"));
  }
}

function main(): void {
  const apiContent = readFileSync(API_TYPES_PATH, "utf8");
  const streamContent = readFileSync(STREAM_EVENTS_PATH, "utf8");
  const schemaNames = extractOpenApiSchemaNames(apiContent);
  const streamNames = extractStreamEventTypeNames(streamContent);

  const files = listFeatureTypeFiles();
  const all: Offender[] = [];
  for (const file of files) {
    all.push(...scanFile(file, schemaNames, streamNames));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(join(OUT_DIR, "by-feature"), { recursive: true });

  writeSummary(all);
  writeAllOffenders(all);
  writeWave1(all);
  writeByFeature(all);

  const dupes = all.filter((o) => o.status === "duplicate").length;
  console.log(`Scanned ${files.length} files`);
  console.log(`OpenAPI schemas: ${schemaNames.size}`);
  console.log(`Stream types: ${streamNames.size}`);
  console.log(`Name matches: ${all.length}`);
  console.log(`Actionable duplicates: ${dupes}`);
  console.log(`Output: docs/type-drift/generated/`);
}

main();

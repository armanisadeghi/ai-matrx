#!/usr/bin/env node
/**
 * Fast one-pass index file audit. Writes docs/INDEX_FILES_AUDIT.md
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const SKIP = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage']);
const SKIP_PREFIX = ['.next', '.claude/worktrees'];

function shouldSkip(name, rel = '') {
  if (SKIP.has(name)) return true;
  if (name.startsWith('.next')) return true;
  if (rel.startsWith('.claude/worktrees')) return true;
  return false;
}

function walk(dir, match, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(root, path.join(dir, ent.name)).replace(/\\/g, '/');
    if (shouldSkip(ent.name, rel)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, match, out);
    else if (match.test(ent.name)) out.push(full);
  }
  return out;
}

function classify(content) {
  const reExports = (content.match(/^export\s+.*from\s+['"]/gm) || []).length;
  const hasComponent =
    /\b(function|const|class)\s+[A-Z]/.test(content) ||
    /export\s+default\s+function/.test(content);
  const totalExports = (content.match(/^export /gm) || []).length;
  if (reExports > 0 && reExports >= totalExports * 0.5 && !hasComponent) return 'barrel';
  if (reExports > 0 && hasComponent) return 'mixed';
  if (reExports > 0) return 'barrel';
  if (hasComponent) return 'component-entry';
  return 'other';
}

// 1) All index files
const indexAbs = walk(root, /^index\.(ts|tsx|js|jsx)$/);
const indexEntries = indexAbs.map((abs) => {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  const content = fs.readFileSync(abs, 'utf8');
  const dir = path.dirname(rel);
  return {
    rel,
    dir,
    kind: classify(content),
    lines: content.split('\n').length,
    reExportCount: (content.match(/^export\s+.*from\s+['"]/gm) || []).length,
    importers: /** @type {string[]} */ ([]),
  };
});

// 2) Build alias -> index map
/** @type {Map<string, string>} longest-prefix wins handled below */
const aliasToIndex = new Map();
for (const e of indexEntries) {
  if (e.dir !== '.') aliasToIndex.set(`@/${e.dir}`, e.rel);
  if (e.rel.startsWith('packages/matrx-agents/src/index.')) aliasToIndex.set('@matrx/agents', e.rel);
  const sub = e.rel.replace(/^packages\/matrx-agents\/src\//, '').replace(/\/index\.(tsx?)$/, '');
  if (e.rel.startsWith('packages/matrx-agents/src/') && sub !== 'index.ts') {
    aliasToIndex.set(`@matrx/agents/${sub}`, e.rel);
  }
}

// 3) Single rg: all static import specifiers with file + line
let rgOut = '';
try {
  rgOut = execSync(
    `rg --no-heading -n "(?:from|import\\()\\s*['\\"]([^'\\"]+)['\\"]" --glob '*.ts' --glob '*.tsx' --glob '!.next*' --glob '!node_modules' .`,
    { cwd: root, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 },
  );
} catch (e) {
  rgOut = e.stdout?.toString() ?? '';
}

/** @type {Map<string, Set<string>>} */
const importers = new Map(indexEntries.map((e) => [e.rel, new Set()]));

const importLineRe = /^(.+?):(\d+):(?:import|export).*from\s+['"]([^'"]+)['"]|^(.+?):(\d+):import\s*\(\s*['"]([^'"]+)['"]\s*\)/;

function addImporter(indexRel, fileRel) {
  if (fileRel === indexRel) return;
  importers.get(indexRel)?.add(fileRel.replace(/^\.\//, ''));
}

function resolveRelative(spec, fromFile) {
  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, spec)).replace(/\\/g, '/');
  if (!resolved.startsWith('.')) return resolved;
  // normalize to repo-relative
  resolved = path.relative(root, path.join(root, fromDir, spec)).replace(/\\/g, '/');
  return resolved;
}

for (const line of rgOut.split('\n')) {
  if (!line.trim()) continue;
  const m = line.match(/^(.+?):(\d+):(.+)$/);
  if (!m) continue;
  const fileRel = m[1].replace(/^\.\//, '');
  const rest = m[3];

  const fromM = rest.match(/from\s+['"]([^'"]+)['"]/);
  const dynM = rest.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  const spec = fromM?.[1] ?? dynM?.[1];
  if (!spec) continue;

  // @/ alias
  if (spec.startsWith('@/')) {
    // exact match
    const exact = aliasToIndex.get(spec);
    if (exact) addImporter(exact, fileRel);
    // prefix: find longest matching alias dir
    let best = '';
    let bestIdx = '';
    for (const [alias, idxRel] of aliasToIndex) {
      if (alias.startsWith('@/') && (spec === alias || spec.startsWith(alias + '/'))) {
        if (alias.length > best.length) {
          best = alias;
          bestIdx = idxRel;
        }
      }
    }
    if (bestIdx) addImporter(bestIdx, fileRel);
  }

  if (spec === '@matrx/agents' || spec.startsWith('@matrx/agents/')) {
    const hit = aliasToIndex.get(spec) ?? aliasToIndex.get('@matrx/agents');
    if (hit) addImporter(hit, fileRel);
  }

  // relative
  if (spec.startsWith('.')) {
    const resolved = resolveRelative(spec, fileRel);
    // direct index import
    for (const e of indexEntries) {
      const idxNoExt = e.rel.replace(/\.(tsx?|jsx?)$/, '');
      if (resolved === idxNoExt || resolved === e.dir || resolved + '/index' === idxNoExt) {
        addImporter(e.rel, fileRel);
      }
    }
  }
}

for (const e of indexEntries) {
  e.importers = [...(importers.get(e.rel) ?? [])].sort();
}

indexEntries.sort((a, b) => b.importers.length - a.importers.length);

const barrelCount = indexEntries.filter((e) => e.kind === 'barrel' || e.kind === 'mixed').length;
const totalImporters = new Set(indexEntries.flatMap((e) => e.importers)).size;

let md = `# Index Files Audit

> Generated: ${new Date().toISOString().slice(0, 10)}  
> Purpose: inventory every \`index.ts\` / \`index.tsx\` file and map consumers before barrel elimination.

## Summary

| Metric | Count |
|--------|------:|
| Total \`index.*\` files | ${indexEntries.length} |
| Barrel / mixed re-export files | ${barrelCount} |
| Component-entry (\`index.tsx\` implementations) | ${indexEntries.filter((e) => e.kind === 'component-entry').length} |
| Other | ${indexEntries.filter((e) => e.kind === 'other').length} |
| Unique files importing through an index | ${totalImporters} |

## ESLint / build context

- Rule: \`no-barrel-files/no-barrel-files\` (warn) in \`eslint.config.mjs\`
- \`next.config.js\`: the no-barrel-files plugin parses every imported module and adds **5–10+ min** to builds
- Project doctrine: **no new barrel \`index.ts\` files**; import directly from source

## Classification key

| Kind | Meaning | Action |
|------|---------|--------|
| \`barrel\` | Re-exports only | **Delete** + repoint imports to source files |
| \`mixed\` | Re-exports + local code | Split local code out, delete re-exports |
| \`component-entry\` | Real component in \`index.tsx\` | **Rename** to named \`.tsx\` (not a barrel) |
| \`other\` | Manual review needed | Inspect before changing |

---

## Annihilation priority (barrels by importer count)

| Priority | File | Kind | Importers | Lines | Re-exports |
|----------|------|------|----------:|------:|-----------:|
`;

const barrels = indexEntries.filter((e) => e.kind === 'barrel' || e.kind === 'mixed');
barrels.forEach((e, i) => {
  md += `| ${i + 1} | \`${e.rel}\` | ${e.kind} | ${e.importers.length} | ${e.lines} | ${e.reExportCount} |\n`;
});

md += `\n---\n\n## Full inventory (all index files)\n\n`;

for (const e of indexEntries) {
  md += `### \`${e.rel}\`\n\n`;
  md += `- **Kind:** ${e.kind}\n`;
  md += `- **Lines:** ${e.lines}\n`;
  md += `- **Re-export statements:** ${e.reExportCount}\n`;
  md += `- **Importer count:** ${e.importers.length}\n\n`;

  if (e.importers.length === 0) {
    md += `_No static importers found._\n\n`;
  } else {
    md += `<details>\n<summary>Importers (${e.importers.length})</summary>\n\n`;
    for (const imp of e.importers) md += `- \`${imp}\`\n`;
    md += `\n</details>\n\n`;
  }
}

md += `---\n\n## Component-entry \`index.tsx\` files (rename, don't delete)\n\n`;
for (const e of indexEntries.filter((x) => x.kind === 'component-entry')) {
  md += `- \`${e.rel}\` — ${e.importers.length} importers\n`;
}

const outPath = path.join(root, 'docs/INDEX_FILES_AUDIT.md');
fs.writeFileSync(outPath, md);
console.log(`Wrote ${outPath}`);
console.log(`Index files: ${indexEntries.length}, barrels: ${barrelCount}, unique importers: ${totalImporters}`);

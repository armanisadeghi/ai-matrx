#!/usr/bin/env node
// THE LATEST LAW + THE CATCH-UP RULE + ONE SYSTEM, ONE VERSION, enforced at release time.
//
// 🚨 THIS FILE IS THE ORIGIN. Every consumer repo carries a BYTE-IDENTICAL copy at
// its own `scripts/check-matrx-packages.mjs`. Edit it HERE, then re-sync with
//     node scripts/sync_ts_package_guard.mjs           # write the copies
//     node scripts/sync_ts_package_guard.mjs --check   # fail on drift
// Never hand-edit a copy: five of the six copies had already drifted apart by
// 2026-09-10, which is how one repo's fix stopped being every repo's fix.
//
// WHAT IT CHECKS — the INSTALLED GRAPH, not the declaration list:
//   1. SPEC — every @ai-matrx/* specifier this repo DECLARES (root manifest and
//      every workspace importer in the lockfile) is "latest" or workspace:*.
//      A pin quietly freezes this repo in the past; agents here then write
//      workarounds for bugs other repos already fixed forward. A pin is ALWAYS a
//      hard failure — no registry condition below ever excuses one.
//   2. CURRENCY — every @ai-matrx/* version present ANYWHERE in the install graph
//      equals npm's latest. Not just the declared deps: a package's own
//      @ai-matrx/* dependencies are installed too, and neither
//      `npm update "<pkg>"` nor `pnpm update "<pkg>"` moves a transitive. Before
//      2026-09-10 this guard only compared DECLARED deps, so matrx-vscode shipped
//      a vsix carrying @ai-matrx/data 0.6.2 and @ai-matrx/design-system 0.12.0
//      beside agents 0.10.0 — with the guard green. The graph is read from the
//      lockfile (pnpm-lock.yaml AND package-lock.json), from
//      node_modules/@ai-matrx/*, and from every nested copy under
//      node_modules/.pnpm/*/node_modules/@ai-matrx/* and
//      node_modules/*/node_modules/@ai-matrx/*.
//   3. UNIQUENESS — ONE SYSTEM, ONE VERSION: a package appears in the graph at
//      exactly ONE version. Two copies of @ai-matrx/design-system means two
//      token sheets, two component identities, and a bug fixed in one of them.
//   4. SERVABILITY — when the installed version is behind, is npm's `latest`
//      actually INSTALLABLE right now? npm moves the `latest` dist-tag the moment
//      it accepts a publish, but the tarball can 404 from the CDN for many minutes
//      afterwards. During that window "behind" is not a stale install and there is
//      NO consumer-side fix (pinning is banned) — so it is reported as a TRANSIENT
//      with a retry time, not as a failure. Beyond the bounded window it stops
//      being propagation and becomes a real registry defect: hard failure.
//      (2026-09-10: @ai-matrx/agents@0.10.0 held `latest` with a 404 tarball for
//      ~25 minutes and turned this guard red in three repos at once.)
//
// WORKSPACE SOURCE IS NOT A GRAPH ENTRY. In the aidream monorepo the @ai-matrx
// packages resolve to `link:`/symlinks into `apps/shared/*`. That is SOURCE, ahead
// of npm by design, and is skipped — only registry-installed copies are audited.
//
// Canonical policy: common-docs/policies/typescript-package-standard.md
//   § THE LATEST LAW · § THE CATCH-UP RULE (C28) · § ONE SYSTEM, ONE VERSION
//
//   --self-test   prove the classifier, the lockfile parsers, the graph audit and
//                 the whole run can go red — a stale transitive, a duplicated
//                 version, a pin, and a 404 tarball inside the window (runs in CI).

import { execFileSync } from 'node:child_process';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// How long after publication npm's CDN is allowed to still be catching up.
// Longer than the worst observed real propagation (~25 min) and short enough that
// a genuinely broken `latest` cannot hide behind it forever.
export const PROPAGATION_WINDOW_MINUTES = 45;

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const SCOPE = '@ai-matrx/';

/**
 * The specifier ruling, as one pure function. Everything else in this file is I/O.
 *
 * verdict: 'ok' | 'transient' | 'failure'
 */
export function classify({
    name,
    section,
    specifier,
    installedVersion,
    registryVersion,
    registryError,
    tarballReachable,
    publishedAt,
    now = new Date(),
    syncCommand = 'pnpm sync:matrx-packages',
}) {
    if (specifier === 'workspace:*') {
        return { verdict: 'ok', message: `${name} is workspace:* (always the local source).` };
    }
    // A pin can never be excused by anything the registry is doing.
    if (specifier !== 'latest') {
        return {
            verdict: 'failure',
            message: `${name} is pinned as ${specifier} in ${section}; declare it as latest.`,
        };
    }
    if (!registryVersion) {
        return {
            verdict: 'failure',
            message: `${name} latest could not be verified against npm${registryError ? ` (${registryError})` : ''}.`,
        };
    }
    if (!installedVersion) {
        return { verdict: 'failure', message: `${name} is not installed; run ${syncCommand}.` };
    }
    if (installedVersion === registryVersion) {
        return { verdict: 'ok', message: `✓ ${name}@${installedVersion} is npm latest.` };
    }

    // Behind npm latest. Is npm latest something anybody can actually install?
    if (tarballReachable !== false) {
        return {
            verdict: 'failure',
            message: `${name} is installed at ${installedVersion}; npm latest is ${registryVersion}.`,
        };
    }

    if (!publishedAt) {
        return {
            verdict: 'failure',
            message:
                `${name}@${registryVersion} holds the npm 'latest' dist-tag but its tarball is not fetchable, ` +
                `and npm reported no publish time for it, so this cannot be bounded as CDN propagation. ` +
                `Treat it as a broken release: verify the tarball at registry.npmjs.org before releasing.`,
        };
    }

    const ageMinutes = (now.getTime() - new Date(publishedAt).getTime()) / 60000;
    if (ageMinutes <= PROPAGATION_WINDOW_MINUTES) {
        // Retry soon, not at the far end of the window: the window is the ESCALATION
        // deadline (after it, this is a broken release), not an estimated wait.
        const retryIn = Math.max(1, Math.min(5, Math.ceil(PROPAGATION_WINDOW_MINUTES - ageMinutes)));
        const escalatesIn = Math.max(1, Math.ceil(PROPAGATION_WINDOW_MINUTES - ageMinutes));
        return {
            verdict: 'transient',
            message:
                `${name}@${registryVersion} took the npm 'latest' dist-tag ${Math.max(0, Math.round(ageMinutes))} min ago ` +
                `but its tarball is not fetchable yet (npm CDN propagation). Installed here: ${installedVersion}. ` +
                `This is NOT a stale install and there is nothing to fix in this repo. ` +
                `REMEDY: retry in ${retryIn} minutes, then run ${syncCommand}. Never pin to get past this. ` +
                `If it is still 404ing ${escalatesIn} min from now this guard turns RED and the release must be re-cut.`,
        };
    }

    return {
        verdict: 'failure',
        message:
            `${name}@${registryVersion} has held the npm 'latest' dist-tag for ${Math.round(ageMinutes)} min ` +
            `(window is ${PROPAGATION_WINDOW_MINUTES} min) and its tarball STILL 404s, so 'latest' is unservable ` +
            `and this is a broken release, not propagation. Installed here: ${installedVersion}. ` +
            `REMEDY: re-cut the release (a new patch version on top of ${registryVersion}); do not pin.`,
    };
}

// ── The installed graph ──────────────────────────────────────────────────────
//
// A graph is:
//   installed:  Map<name, Map<version, Set<evidence>>>   registry copies only
//   declared:   [{ name, section, specifier, source }]   specs THIS REPO controls
//   requiredBy: Map<`name@version`, Set<`owner@version` | 'the repo'>>
//
// `requiredBy` is what turns "kit 0.8.0 is stale" into an actionable sentence: a
// transitive nobody in this repo declared is upstream's to fix, and the remedy has
// to name the package that drags it in.

function emptyGraph() {
    return { installed: new Map(), declared: [], requiredBy: new Map() };
}

function addInstalled(graph, name, version, evidence) {
    if (!name?.startsWith(SCOPE) || !version) return;
    if (!graph.installed.has(name)) graph.installed.set(name, new Map());
    const byVersion = graph.installed.get(name);
    if (!byVersion.has(version)) byVersion.set(version, new Set());
    byVersion.get(version).add(evidence);
}

function addRequiredBy(graph, name, version, owner) {
    if (!name?.startsWith(SCOPE) || !version) return;
    const key = `${name}@${version}`;
    if (!graph.requiredBy.has(key)) graph.requiredBy.set(key, new Set());
    graph.requiredBy.get(key).add(owner);
}

function addDeclared(graph, name, section, specifier, source) {
    if (!name?.startsWith(SCOPE)) return;
    graph.declared.push({ name, section, specifier, source });
}

/** `@ai-matrx/kit@0.9.0(react@19.2.8)` → `{ name, version }`; anything else → null. */
export function splitPackageKey(key) {
    if (!key.startsWith(SCOPE)) return null;
    const at = key.indexOf('@', SCOPE.length);
    if (at === -1) return null;
    const name = key.slice(0, at);
    // Drop pnpm's peer-suffix `(...)` and any `_` legacy suffix.
    const version = key.slice(at + 1).split('(')[0].split('_')[0].trim();
    if (!/^\d/.test(version)) return null; // `link:…`, `file:…`, `workspace:…`
    return { name, version };
}

function unquote(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && (trimmed[0] === "'" || trimmed[0] === '"') && trimmed.at(-1) === trimmed[0]) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/**
 * pnpm-lock.yaml, read with a line scanner rather than a YAML dependency — this
 * guard is copied into five repos and must stay pure Node stdlib.
 *
 * Reads three things:
 *   importers: → the specs THIS REPO declares, for every workspace package
 *   packages:  → every version resolved into the graph
 *   snapshots: → who requires which @ai-matrx version
 */
export function parsePnpmLock(text, graph = emptyGraph(), label = 'pnpm-lock.yaml') {
    let section = null; // 'importers' | 'packages' | 'snapshots'
    let importer = null;
    let importerSection = null;
    let pendingDep = null;
    let snapshotOwner = null;
    let inSnapshotDeps = false;

    for (const rawLine of text.split('\n')) {
        if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
        const topLevel = /^([a-zA-Z][\w-]*):\s*$/.exec(rawLine);
        if (topLevel) {
            section = topLevel[1];
            importer = null;
            importerSection = null;
            pendingDep = null;
            snapshotOwner = null;
            inSnapshotDeps = false;
            continue;
        }

        if (section === 'importers') {
            const importerKey = /^ {2}(\S.*?):\s*$/.exec(rawLine);
            if (importerKey) {
                importer = unquote(importerKey[1]);
                importerSection = null;
                pendingDep = null;
                continue;
            }
            const depSection = /^ {4}(dependencies|devDependencies|optionalDependencies):\s*$/.exec(rawLine);
            if (depSection) {
                importerSection = depSection[1];
                pendingDep = null;
                continue;
            }
            const depName = /^ {6}(\S.*?):\s*$/.exec(rawLine);
            if (depName && importerSection) {
                pendingDep = unquote(depName[1]);
                continue;
            }
            const specifier = /^ {8}specifier:\s*(.+?)\s*$/.exec(rawLine);
            if (specifier && pendingDep) {
                addDeclared(
                    graph,
                    pendingDep,
                    importerSection,
                    unquote(specifier[1]),
                    `${label} (importer ${importer})`,
                );
                continue;
            }
            const version = /^ {8}version:\s*(.+?)\s*$/.exec(rawLine);
            if (version && pendingDep) {
                const resolved = unquote(version[1]);
                const split = splitPackageKey(`${pendingDep}@${resolved}`);
                if (split) addRequiredBy(graph, split.name, split.version, `${importer} (this repo)`);
            }
            continue;
        }

        if (section === 'packages') {
            const key = /^ {2}(\S.*?):\s*$/.exec(rawLine);
            if (key) {
                const split = splitPackageKey(unquote(key[1]));
                if (split) addInstalled(graph, split.name, split.version, label);
            }
            continue;
        }

        if (section === 'snapshots') {
            const key = /^ {2}(\S.*?):\s*$/.exec(rawLine);
            if (key) {
                const owner = unquote(key[1]);
                const split = splitPackageKey(owner);
                // Owner may be any package, @ai-matrx or not; keep a readable name.
                snapshotOwner = split ? `${split.name}@${split.version}` : owner.split('(')[0];
                inSnapshotDeps = false;
                continue;
            }
            const depSection = /^ {4}(dependencies|optionalDependencies):\s*$/.exec(rawLine);
            if (depSection) {
                inSnapshotDeps = true;
                continue;
            }
            if (/^ {4}\S/.test(rawLine)) inSnapshotDeps = false;
            const dep = /^ {6}(\S.*?):\s*(.+?)\s*$/.exec(rawLine);
            if (dep && inSnapshotDeps && snapshotOwner) {
                const depName = unquote(dep[1]);
                const split = splitPackageKey(`${depName}@${unquote(dep[2])}`);
                if (split) addRequiredBy(graph, split.name, split.version, snapshotOwner);
            }
        }
    }
    return graph;
}

/**
 * package-lock.json (npm v7+ `packages` map). Every key is a real install path, so
 * nested copies — the exact shape that shipped stale in the matrx-vscode vsix —
 * are first-class entries here.
 */
export function parseNpmLock(json, graph = emptyGraph(), label = 'package-lock.json') {
    const packages = json?.packages ?? {};
    for (const [path, entry] of Object.entries(packages)) {
        if (path === '') {
            for (const section of DEPENDENCY_SECTIONS) {
                for (const [name, specifier] of Object.entries(entry?.[section] ?? {})) {
                    addDeclared(graph, name, section, specifier, `${label} (root manifest)`);
                }
            }
            continue;
        }
        const marker = `node_modules${sep === '\\' ? '/' : '/'}`;
        const index = path.lastIndexOf(marker);
        if (index === -1) {
            // A workspace member: its declared specs are this repo's to fix.
            for (const section of DEPENDENCY_SECTIONS) {
                for (const [name, specifier] of Object.entries(entry?.[section] ?? {})) {
                    addDeclared(graph, name, section, specifier, `${label} (${path})`);
                }
            }
            continue;
        }
        const name = path.slice(index + marker.length);
        if (!name.startsWith(SCOPE)) continue;
        if (entry?.link) continue; // a symlink to workspace source, not a registry copy
        addInstalled(graph, name, entry?.version, `${label} (${path})`);
        addRequiredBy(graph, name, entry?.version, index === 0 ? 'the repo' : path.slice(0, index - 1));
    }
    // Second pass: who pins whom, with the real specifier text.
    for (const [path, entry] of Object.entries(packages)) {
        if (path === '') continue;
        const owner = path.replace(/^node_modules\//, '').replace(/node_modules\//g, '');
        for (const [name, specifier] of Object.entries(entry?.dependencies ?? {})) {
            if (!name.startsWith(SCOPE)) continue;
            if (!owner.startsWith(SCOPE)) continue;
            graph.upstreamSpecs ??= [];
            graph.upstreamSpecs.push({ owner: `${owner}@${entry?.version ?? '?'}`, name, specifier });
        }
    }
    return graph;
}

function isWorkspaceLink(path) {
    // pnpm links EVERY package through node_modules, so "is a symlink" proves
    // nothing. What separates source from a registry copy is where it lands:
    // a registry copy always realpaths back inside some node_modules store.
    try {
        if (!lstatSync(path).isSymbolicLink()) return false;
        return !realpathSync(path).includes(`${sep}node_modules${sep}`);
    } catch {
        return false;
    }
}

function readManifestVersion(dir) {
    try {
        return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
        return null;
    }
}

function safeReaddir(dir) {
    try {
        return readdirSync(dir);
    } catch {
        return [];
    }
}

/**
 * Every @ai-matrx copy physically on disk: the top-level ones, the pnpm store's
 * nested ones, and npm's nested ones. This is the only source that catches a copy
 * a lockfile forgot to mention.
 */
export function scanNodeModules(projectRoot, graph = emptyGraph()) {
    const roots = new Set();
    const nodeModules = join(projectRoot, 'node_modules');
    roots.add(nodeModules);
    // pnpm's content-addressed store keeps EVERY version this repo ever installed,
    // long after nothing links to it, and pnpm parks replaced copies in `.ignored/`.
    // Store residue is not the install graph — a copy under `.pnpm/` counts only when
    // something reachable already resolves to it (see the reconciliation below). Its
    // manifest is still read, because that is where a sibling's own spec is written.
    for (const entry of safeReaddir(join(nodeModules, '.pnpm'))) {
        roots.add(join(nodeModules, '.pnpm', entry, 'node_modules'));
    }
    for (const entry of safeReaddir(nodeModules)) {
        if (entry.startsWith('.')) continue; // .ignored, .pnpm, .bin, .cache
        if (entry.startsWith('@')) {
            for (const scoped of safeReaddir(join(nodeModules, entry))) {
                roots.add(join(nodeModules, entry, scoped, 'node_modules'));
            }
            continue;
        }
        roots.add(join(nodeModules, entry, 'node_modules'));
    }

    for (const root of roots) {
        const storeOnly = root.includes(`${sep}.pnpm${sep}`);
        const scopeDir = join(root, SCOPE.slice(0, -1));
        for (const pkg of safeReaddir(scopeDir)) {
            const dir = join(scopeDir, pkg);
            if (isWorkspaceLink(dir)) continue;
            const manifest = readManifestVersion(dir);
            if (!manifest?.version) continue;
            const name = `${SCOPE}${pkg}`;
            const evidence = `node_modules (${dir.slice(projectRoot.length + 1)})`;
            if (storeOnly) {
                graph.store ??= [];
                graph.store.push({ name, version: manifest.version, evidence });
            } else {
                addInstalled(graph, name, manifest.version, evidence);
            }
            for (const section of DEPENDENCY_SECTIONS) {
                for (const [dep, specifier] of Object.entries(manifest[section] ?? {})) {
                    if (!dep.startsWith(SCOPE)) continue;
                    graph.upstreamSpecs ??= [];
                    graph.upstreamSpecs.push({ owner: `${name}@${manifest.version}`, name: dep, specifier });
                }
            }
        }
    }

    // A store copy joins the graph only if a lockfile or a real link already put that
    // exact version there. Without this, an un-pruned pnpm store becomes a release
    // blocker and every repo goes red over versions nothing can import.
    for (const { name, version, evidence } of graph.store ?? []) {
        if (graph.installed.get(name)?.has(version)) addInstalled(graph, name, version, evidence);
    }
    return graph;
}

/** The whole graph for a project root: manifest + both lockfiles + node_modules. */
export function collectGraph(projectRoot, { manifest = null } = {}) {
    const graph = emptyGraph();

    const rootManifest = manifest ?? readJsonSafe(join(projectRoot, 'package.json'));
    if (rootManifest) {
        for (const section of DEPENDENCY_SECTIONS) {
            for (const [name, specifier] of Object.entries(rootManifest[section] ?? {})) {
                addDeclared(graph, name, section, specifier, 'package.json');
            }
        }
    }

    const pnpmLock = join(projectRoot, 'pnpm-lock.yaml');
    if (existsSync(pnpmLock)) parsePnpmLock(readFileSync(pnpmLock, 'utf8'), graph);

    const npmLock = readJsonSafe(join(projectRoot, 'package-lock.json'));
    if (npmLock) parseNpmLock(npmLock, graph);

    scanNodeModules(projectRoot, graph);
    return graph;
}

function readJsonSafe(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

// ── Version ordering ─────────────────────────────────────────────────────────

export function compareVersions(a, b) {
    const parse = (v) => v.split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
        const diff = (x[i] ?? 0) - (y[i] ?? 0);
        if (diff !== 0) return diff < 0 ? -1 : 1;
    }
    // A prerelease sorts BELOW its release.
    const preA = a.includes('-');
    const preB = b.includes('-');
    if (preA !== preB) return preA ? -1 : 1;
    return 0;
}

// ── Remedies ─────────────────────────────────────────────────────────────────

/**
 * The command that actually moves a TRANSITIVE. This is the whole point of the
 * 2026-09-10 fix: `pnpm update "@ai-matrx/data"` and `npm update "@ai-matrx/data"`
 * both look successful and leave a stale nested copy exactly where it was.
 */
export function updateCommandFor({ pnpm }) {
    return pnpm
        ? 'pnpm update -r "@ai-matrx/*" --latest   (the -r + glob is what moves TRANSITIVES; a per-package update does not)'
        : 'npm update   (bare, no package name — `npm update "<pkg>"` refuses to move a transitive)';
}

function ownersOf(graph, name, version) {
    const owners = [...(graph.requiredBy.get(`${name}@${version}`) ?? [])];
    return owners.length > 0 ? owners : ['a nested install copy with no recorded requirer'];
}

function upstreamPinnersOf(graph, name, version) {
    // Deduped: the same pin is visible from the lockfile AND from every physical
    // copy on disk, and a remedy that repeats itself six times is unreadable.
    return [
        ...new Set(
            (graph.upstreamSpecs ?? [])
                // Only owners actually in the graph: an orphaned store manifest must
                // never be blamed for a pin nothing installs.
                .filter((spec) => {
                    const owner = splitPackageKey(spec.owner);
                    return !owner || graph.installed.get(owner.name)?.has(owner.version);
                })
                .filter((spec) => spec.name === name && spec.specifier !== 'latest' && spec.specifier !== 'workspace:*')
                .filter((spec) => spec.specifier.replace(/^[\^~]/, '') === version)
                .map((spec) => `${spec.owner} declares ${name}@${spec.specifier}`),
        ),
    ];
}

// ── The audit ────────────────────────────────────────────────────────────────

/**
 * Pure. Given a collected graph and a registry snapshot, produce every verdict.
 * The self-test drives THIS function with fixture lockfile TEXT, so the parsers
 * are on the tested path rather than beside it.
 */
export async function auditGraph({
    graph,
    getRegistry,
    getTarballReachable = async () => true,
    now = new Date(),
    syncCommand = 'pnpm sync:matrx-packages',
    updateCommand = updateCommandFor({ pnpm: true }),
}) {
    const failures = [];
    const transients = [];
    const notes = [];

    // (c) SPEC — pins in anything this repo declares.
    for (const { name, section, specifier, source } of graph.declared) {
        if (specifier === 'latest' || specifier === 'workspace:*' || specifier.startsWith('link:')) continue;
        failures.push(
            `PIN: ${name} is declared as "${specifier}" in ${section} of ${source}. ` +
                `THE LATEST LAW allows only "latest" or workspace:*. REMEDY: change the specifier, then ${updateCommand}`,
        );
    }

    const names = [...new Set([...graph.installed.keys(), ...graph.declared.map((d) => d.name)])].sort();
    const registry = new Map(
        await Promise.all(names.map(async (name) => [name, await getRegistry(name)])),
    );

    for (const name of names) {
        const info = registry.get(name) ?? {};
        const latest = info.registryVersion;
        const versions = [...(graph.installed.get(name)?.keys() ?? [])].sort(compareVersions);

        if (!latest) {
            failures.push(
                `${name} latest could not be verified against npm${info.registryError ? ` (${info.registryError})` : ''}.`,
            );
            continue;
        }

        if (versions.length === 0) {
            const declared = graph.declared.filter((d) => d.name === name);
            if (declared.length === 0) continue;
            if (declared.every((d) => d.specifier === 'workspace:*' || d.specifier.startsWith('link:'))) {
                notes.push(`${name} resolves to workspace source (not a registry copy).`);
                continue;
            }
            failures.push(`${name} is declared but not installed; run ${syncCommand}.`);
            continue;
        }

        // (b) UNIQUENESS.
        if (versions.length > 1) {
            const detail = versions
                .map((version) => `${version} ← ${ownersOf(graph, name, version).join(', ')}`)
                .join(' | ');
            failures.push(
                `DUPLICATE: ${name} is installed at ${versions.length} versions in one graph — ${detail}. ` +
                    `ONE SYSTEM, ONE VERSION: exactly one copy of every @ai-matrx package. ` +
                    `REMEDY: ${updateCommand}. If a version is held by a sibling package's own pinned dependency, ` +
                    `that package must be republished so its sibling spec resolves forward; a consumer repo cannot fix it.`,
            );
        }

        // (a) CURRENCY — for every version present, not just the declared one.
        for (const version of versions) {
            if (version === latest) {
                notes.push(`✓ ${name}@${version} is npm latest.`);
                continue;
            }
            const ahead = compareVersions(version, latest) > 0;
            if (ahead) {
                failures.push(
                    `AHEAD: ${name}@${version} is installed but npm latest is ${latest} ` +
                        `(${ownersOf(graph, name, version).join(', ')}). An unpublished version in a consumer graph is ` +
                        `not reproducible. REMEDY: publish it, or ${updateCommand}`,
                );
                continue;
            }

            const declaredHere = graph.declared.some(
                (d) => d.name === name && (d.specifier === 'latest' || d.specifier === 'workspace:*'),
            );
            const pinners = upstreamPinnersOf(graph, name, version);

            // Servability only excuses a version this repo could actually move.
            let tarballReachable = null;
            if (declaredHere && pinners.length === 0) {
                tarballReachable = await getTarballReachable(info.tarballUrl, latest, name);
            }
            const verdict = classify({
                name,
                section: 'dependencies',
                specifier: 'latest',
                installedVersion: version,
                registryVersion: latest,
                registryError: info.registryError,
                tarballReachable,
                publishedAt: info.publishedAt,
                now,
                syncCommand,
            });

            if (verdict.verdict === 'transient') {
                transients.push(verdict.message);
                continue;
            }
            if (pinners.length > 0) {
                notes.push(
                    `UPDATE AVAILABLE (upstream pin): ${name}@${version} is in the graph; npm latest is ${latest}. ` +
                        `Pulled in because ${pinners.join('; ')}. Nothing in this repo declares it, and no update ` +
                        `command can move it. REMEDY: republish the pinning package(s) so the sibling spec resolves ` +
                        `to ${latest}, then ${updateCommand}`,
                );
                continue;
            }
            notes.push(
                `UPDATE AVAILABLE: ${name}@${version} is in the graph (${ownersOf(graph, name, version).join(', ')}); ` +
                    `npm latest is ${latest}. REMEDY: ${updateCommand}`,
            );
        }
    }

    return { failures, transients, notes };
}

// ── I/O ──────────────────────────────────────────────────────────────────────

function readRegistry(name, projectRoot) {
    try {
        const view = JSON.parse(
            execFileSync('npm', ['view', name, '--json'], {
                cwd: projectRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'inherit'],
            }),
        );
        const registryVersion = view['dist-tags']?.latest ?? null;
        return {
            registryVersion,
            tarballUrl: view.dist?.tarball ?? null,
            publishedAt: registryVersion ? (view.time?.[registryVersion] ?? null) : null,
        };
    } catch (error) {
        return { registryVersion: null, registryError: error?.message?.split('\n')[0] ?? 'npm view failed' };
    }
}

async function probeTarball(url) {
    if (!url) return false;
    // A ranged GET, not HEAD: the npm CDN answers HEAD inconsistently for objects
    // it has not replicated yet, and a 1-byte body costs nothing.
    try {
        const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
        return response.ok || response.status === 206;
    } catch {
        return false;
    }
}

function syncCommandFor(projectRoot) {
    return existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))
        ? 'pnpm sync:matrx-packages'
        : 'npm run sync:matrx-packages';
}

export function declaredPackages(manifest) {
    return DEPENDENCY_SECTIONS.flatMap((section) =>
        Object.entries(manifest[section] ?? {})
            .filter(([name]) => name.startsWith(SCOPE))
            .map(([name, specifier]) => ({ name, section, specifier })),
    );
}

/**
 * The whole run, with every I/O edge injectable so --self-test exercises this
 * exact code path rather than a re-implementation of it.
 */
export async function runCheck({
    graph,
    syncCommand,
    updateCommand,
    getRegistry,
    getTarballReachable,
    now = new Date(),
    log = console.log,
    error = console.error,
} = {}) {
    if (graph.installed.size === 0 && graph.declared.length === 0) {
        log('✓ No @ai-matrx packages are declared or installed.');
        return 0;
    }

    const { failures, transients, notes } = await auditGraph({
        graph,
        getRegistry,
        getTarballReachable,
        now,
        syncCommand,
        updateCommand,
    });

    for (const note of notes) log(note);

    if (transients.length > 0) {
        log('\nInfo: npm is still propagating a release:');
        for (const transient of transients) log(`  - ${transient}`);
    }

    if (failures.length > 0) {
        error('\n@ai-matrx install-graph check failed:');
        for (const failure of failures) error(`  - ${failure}`);
        error(
            `\nTHE LATEST LAW + ONE SYSTEM, ONE VERSION: every @ai-matrx package in the INSTALL GRAPH\n` +
                'is at npm latest, exactly once — transitive copies included.\n' +
                `  ${updateCommand}\n` +
                'Then adopt any CHANGELOG "Consumer action" the new versions carry, commit package.json +\n' +
                'the lockfile, and retry. Never fix this by pinning a version.',
        );
        return 1;
    }
    log(`✓ @ai-matrx install graph has one installed version per package; version updates above are informational (${graph.installed.size} package(s)).`);
    return 0;
}

// ── Self-test: prove the classifier, the parsers and the run can go red ──────

const FIXTURE_REGISTRY = {
    '@ai-matrx/agents': '0.10.0',
    '@ai-matrx/data': '0.11.0',
    '@ai-matrx/design-system': '0.13.0',
    '@ai-matrx/kit': '0.9.0',
    '@ai-matrx/realtime': '0.7.5',
};

const fixtureRegistry = async (name) => ({
    registryVersion: FIXTURE_REGISTRY[name] ?? null,
    tarballUrl: `https://registry.npmjs.org/${name}/-/x.tgz`,
    publishedAt: '2026-01-01T00:00:00Z',
});

// The REAL shape that shipped stale: matrx-vscode's package-lock.json at bcd31d7^.
// agents was current and DECLARED, so the old declaration-only guard was green while
// the vsix carried data 0.6.2 and design-system 0.12.0.
const VSCODE_PREFIX_LOCK = {
    name: 'matrx-vscode',
    lockfileVersion: 3,
    packages: {
        '': { name: 'matrx-vscode', dependencies: { '@ai-matrx/agents': 'latest' } },
        'node_modules/@ai-matrx/agents': {
            version: '0.10.0',
            dependencies: { '@ai-matrx/data': 'latest', '@ai-matrx/design-system': 'latest' },
        },
        'node_modules/@ai-matrx/data': { version: '0.6.2' },
        'node_modules/@ai-matrx/design-system': {
            version: '0.12.0',
            dependencies: { '@ai-matrx/kit': '0.9.0' },
        },
        'node_modules/@ai-matrx/kit': { version: '0.9.0' },
    },
};

const PNPM_FIXTURE_DUPLICATE = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@ai-matrx/design-system':
        specifier: latest
        version: 0.13.0(react@19.2.8)
      '@ai-matrx/tap-target':
        specifier: latest
        version: 0.2.1(react@19.2.8)

packages:

  '@ai-matrx/design-system@0.11.2':
    resolution: {integrity: sha512-x}

  '@ai-matrx/design-system@0.13.0':
    resolution: {integrity: sha512-y}

  '@ai-matrx/tap-target@0.2.1':
    resolution: {integrity: sha512-z}

snapshots:

  '@ai-matrx/design-system@0.11.2(react@19.2.8)': {}

  '@ai-matrx/design-system@0.13.0(react@19.2.8)': {}

  '@ai-matrx/tap-target@0.2.1(react@19.2.8)':
    dependencies:
      '@ai-matrx/design-system': 0.11.2(react@19.2.8)
`;

const PNPM_FIXTURE_PIN = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@ai-matrx/kit':
        specifier: ^0.9.0
        version: 0.9.0

packages:

  '@ai-matrx/kit@0.9.0':
    resolution: {integrity: sha512-k}

snapshots:

  '@ai-matrx/kit@0.9.0': {}
`;

const PNPM_FIXTURE_CLEAN = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@ai-matrx/kit':
        specifier: latest
        version: 0.9.0

packages:

  '@ai-matrx/kit@0.9.0':
    resolution: {integrity: sha512-k}

snapshots:

  '@ai-matrx/kit@0.9.0': {}
`;

async function selfTest() {
    const now = new Date('2026-09-10T08:00:00Z');
    const minutesAgo = (m) => new Date(now.getTime() - m * 60000).toISOString();
    const problems = [];
    const expect = (label, actual, wanted) => {
        if (actual !== wanted) problems.push(`${label}: expected ${wanted}, got ${actual}`);
    };
    const silence = () => {};

    // ── The classifier (unchanged rulings) ──────────────────────────────────

    // 1. THE INCIDENT: behind + latest's tarball 404s inside the window = transient.
    const incident = classify({
        name: '@ai-matrx/agents',
        section: 'dependencies',
        specifier: 'latest',
        installedVersion: '0.9.2',
        registryVersion: '0.10.0',
        tarballReachable: false,
        publishedAt: minutesAgo(5),
        now,
    });
    expect('404 tarball inside window', incident.verdict, 'transient');
    if (!/retry in \d+ minutes/.test(incident.message)) problems.push('transient message carries no retry remedy');
    if (!/Never pin/.test(incident.message)) problems.push('transient message does not forbid pinning');

    // 2. Behind + tarball serves fine = a real stale install.
    expect(
        'behind with a fetchable tarball',
        classify({
            name: '@ai-matrx/agents',
            section: 'dependencies',
            specifier: 'latest',
            installedVersion: '0.9.2',
            registryVersion: '0.10.0',
            tarballReachable: true,
            publishedAt: minutesAgo(5),
            now,
        }).verdict,
        'failure',
    );

    // 3. Beyond the window a 404 tarball is a broken release, not propagation.
    expect(
        '404 tarball beyond the window',
        classify({
            name: '@ai-matrx/agents',
            section: 'dependencies',
            specifier: 'latest',
            installedVersion: '0.9.2',
            registryVersion: '0.10.0',
            tarballReachable: false,
            publishedAt: minutesAgo(PROPAGATION_WINDOW_MINUTES + 10),
            now,
        }).verdict,
        'failure',
    );

    // 4. A pin is never excused, whatever the registry is doing.
    expect(
        'a pin during a propagation window',
        classify({
            name: '@ai-matrx/agents',
            section: 'dependencies',
            specifier: '0.9.2',
            installedVersion: '0.9.2',
            registryVersion: '0.10.0',
            tarballReachable: false,
            publishedAt: minutesAgo(1),
            now,
        }).verdict,
        'failure',
    );

    // 5. Current install = ok.
    expect(
        'current install',
        classify({
            name: '@ai-matrx/agents',
            section: 'dependencies',
            specifier: 'latest',
            installedVersion: '0.10.0',
            registryVersion: '0.10.0',
            now,
        }).verdict,
        'ok',
    );

    // 6. Version ordering, including prereleases.
    expect('0.6.2 < 0.11.0', compareVersions('0.6.2', '0.11.0'), -1);
    expect('0.13.0 > 0.12.0', compareVersions('0.13.0', '0.12.0'), 1);
    expect('prerelease below release', compareVersions('1.0.0-rc.1', '1.0.0'), -1);

    // ── (a) STALE TRANSITIVE — the matrx-vscode defect, on its real lock shape ──
    const vscodeGraph = parseNpmLock(VSCODE_PREFIX_LOCK);
    const vscode = await auditGraph({ graph: vscodeGraph, getRegistry: fixtureRegistry, now });
    expect('vscode pre-fix declared spec is clean', vscode.failures.filter((f) => f.startsWith('PIN')).length, 0);
    const staleNames = vscode.notes.filter((f) => /^UPDATE AVAILABLE/.test(f));
    expect('vscode pre-fix stale transitives found', staleNames.length, 2);
    if (!staleNames.some((f) => f.includes('@ai-matrx/data@0.6.2'))) {
        problems.push('(a) missed @ai-matrx/data@0.6.2 in the matrx-vscode pre-fix lockfile');
    }
    if (!staleNames.some((f) => f.includes('@ai-matrx/design-system@0.12.0'))) {
        problems.push('(a) missed @ai-matrx/design-system@0.12.0 in the matrx-vscode pre-fix lockfile');
    }
    if (!vscode.notes.some((f) => /npm update/.test(f))) {
        problems.push('(a) remedy does not name the npm command that moves transitives');
    }
    // …and the OLD, declaration-only rule was green on exactly this input.
    expect(
        'declaration-only rule was green on the shipped-stale lock',
        classify({
            name: '@ai-matrx/agents',
            section: 'dependencies',
            specifier: 'latest',
            installedVersion: '0.10.0',
            registryVersion: '0.10.0',
            now,
        }).verdict,
        'ok',
    );

    // ── (b) DUPLICATE — two design-system versions in one pnpm graph ────────
    const dupe = await auditGraph({
        graph: parsePnpmLock(PNPM_FIXTURE_DUPLICATE),
        getRegistry: fixtureRegistry,
        now,
    });
    const duplicates = dupe.failures.filter((f) => f.startsWith('DUPLICATE'));
    expect('(b) duplicate version detected', duplicates.length, 1);
    if (!duplicates[0]?.includes('tap-target')) {
        problems.push('(b) duplicate finding does not name the package that holds the old copy');
    }

    // ── (c) PIN — a caret in a pnpm importer ────────────────────────────────
    const pinned = await auditGraph({
        graph: parsePnpmLock(PNPM_FIXTURE_PIN),
        getRegistry: fixtureRegistry,
        now,
    });
    expect('(c) pinned importer spec detected', pinned.failures.filter((f) => f.startsWith('PIN')).length, 1);

    // ── STORE RESIDUE is not the graph ──────────────────────────────────────
    // pnpm keeps every version ever installed under node_modules/.pnpm. Counting
    // those turned matrx-vscode and matrx-games red on 2026-09-10 over copies
    // nothing imports — an un-prunable, unfixable failure. A store copy joins the
    // graph only when a lockfile or a real link already put that version there.
    {
        const scratch = mkdtempSync(join(tmpdir(), 'matrx-graph-'));
        try {
            const orphan = join(scratch, 'node_modules', '.pnpm', '@ai-matrx+kit@0.8.0', 'node_modules', '@ai-matrx', 'kit');
            const live = join(scratch, 'node_modules', '@ai-matrx', 'kit');
            mkdirSync(orphan, { recursive: true });
            mkdirSync(live, { recursive: true });
            writeFileSync(join(orphan, 'package.json'), JSON.stringify({ name: '@ai-matrx/kit', version: '0.8.0' }));
            writeFileSync(join(live, 'package.json'), JSON.stringify({ name: '@ai-matrx/kit', version: '0.9.0' }));
            writeFileSync(join(scratch, 'pnpm-lock.yaml'), PNPM_FIXTURE_CLEAN);
            writeFileSync(join(scratch, 'package.json'), JSON.stringify({ dependencies: { '@ai-matrx/kit': 'latest' } }));
            const versions = [...collectGraph(scratch).installed.get('@ai-matrx/kit').keys()].sort(compareVersions);
            expect('store residue is excluded from the graph', versions.join(), '0.9.0');
            const residue = await auditGraph({ graph: collectGraph(scratch), getRegistry: fixtureRegistry, now });
            expect('store residue does not fail the run', residue.failures.length, 0);
        } finally {
            rmSync(scratch, { recursive: true, force: true });
        }
    }

    // ── GREEN — a clean graph passes ────────────────────────────────────────
    const clean = await auditGraph({
        graph: parsePnpmLock(PNPM_FIXTURE_CLEAN),
        getRegistry: fixtureRegistry,
        now,
    });
    expect('clean graph has no failures', clean.failures.length, 0);

    // ── Whole-run exit codes through the real runCheck ──────────────────────
    const runWith = (graph, getRegistry = fixtureRegistry, getTarballReachable = async () => true) =>
        runCheck({
            graph,
            syncCommand: 'pnpm sync:matrx-packages',
            updateCommand: updateCommandFor({ pnpm: true }),
            getRegistry,
            getTarballReachable,
            now,
            log: silence,
            error: silence,
        });
    expect('run exit code, clean graph', await runWith(parsePnpmLock(PNPM_FIXTURE_CLEAN)), 0);
    expect('run exit code, stale transitive', await runWith(parseNpmLock(VSCODE_PREFIX_LOCK)), 0);
    expect('run exit code, duplicate version', await runWith(parsePnpmLock(PNPM_FIXTURE_DUPLICATE)), 1);
    expect('run exit code, pinned spec', await runWith(parsePnpmLock(PNPM_FIXTURE_PIN)), 1);

    // The transient still passes the whole run, on a DECLARED stale dep.
    const behind = parsePnpmLock(PNPM_FIXTURE_CLEAN.replaceAll('0.9.0', '0.8.0'));
    expect('behind fixture really is behind', [...behind.installed.get('@ai-matrx/kit').keys()].join(), '0.8.0');
    expect(
        'run exit code, simulated 404 tarball on a declared dep',
        await runWith(
            behind,
            async () => ({
                registryVersion: '0.9.0',
                tarballUrl: 'https://registry.npmjs.org/@ai-matrx/kit/-/kit-0.9.0.tgz',
                publishedAt: minutesAgo(5),
            }),
            async () => false,
        ),
        0,
    );
    expect(
        'run exit code, servable tarball on a declared dep',
        await runWith(
            behind,
            async () => ({
                registryVersion: '0.9.0',
                tarballUrl: 'https://registry.npmjs.org/@ai-matrx/kit/-/kit-0.9.0.tgz',
                publishedAt: minutesAgo(5),
            }),
            async () => true,
        ),
        0,
    );

    if (problems.length > 0) {
        console.error('check-matrx-packages --self-test FAILED:');
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    console.log(
        '✓ check-matrx-packages self-test passed: classifier (6), stale transitive on the real\n' +
            '  matrx-vscode pre-fix lockfile (a), duplicate version (b), pinned spec (c), store residue\n' +
        '  excluded, clean green,\n' +
            '  and whole-run exit codes incl. a simulated 404 tarball.',
    );
}

// ── Entry point ──────────────────────────────────────────────────────────────

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Entry point ONLY. Importing this module (the self-test harness, a repo's own
// tests, another script reusing the parsers) must never walk a graph or exit.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--self-test')) {
        await selfTest();
    } else {
        const pnpm = existsSync(resolve(projectRoot, 'pnpm-lock.yaml'));
        const exitCode = await runCheck({
            graph: collectGraph(projectRoot),
            syncCommand: syncCommandFor(projectRoot),
            updateCommand: updateCommandFor({ pnpm }),
            getRegistry: (name) => readRegistry(name, projectRoot),
            getTarballReachable: (url) => probeTarball(url),
        });
        process.exit(exitCode);
    }
}

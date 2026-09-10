#!/usr/bin/env node
// THE LATEST LAW + THE CATCH-UP RULE, enforced at release time.
//
// 🚨 THIS FILE IS THE ORIGIN. Every consumer repo carries a BYTE-IDENTICAL copy at
// its own `scripts/check-matrx-packages.mjs`. Edit it HERE, then re-sync with
//     node scripts/sync_ts_package_guard.mjs           # write the copies
//     node scripts/sync_ts_package_guard.mjs --check   # fail on drift
// Never hand-edit a copy: five of the six copies had already drifted apart by
// 2026-09-10, which is how one repo's fix stopped being every repo's fix.
//
// Three checks, one script:
//   1. SPEC — every @ai-matrx/* dependency is declared "latest" (or workspace:*).
//      A pin quietly freezes this repo in the past; agents here then write
//      workarounds for bugs other repos already fixed forward. A pin is ALWAYS a
//      hard failure — no registry condition below ever excuses one.
//   2. CURRENCY — the version actually INSTALLED equals npm's latest. "latest"
//      resolves at install time, so a lockfile keeps serving yesterday's build
//      until someone reinstalls. C28: every consumer repo must be current
//      BEFORE its next release.
//   3. SERVABILITY — when the installed version is behind, is npm's `latest`
//      actually INSTALLABLE right now? npm moves the `latest` dist-tag the moment
//      it accepts a publish, but the tarball can 404 from the CDN for many minutes
//      afterwards. During that window "behind" is not a stale install and there is
//      NO consumer-side fix (pinning is banned) — so it is reported as a TRANSIENT
//      with a retry time, not as a failure. Beyond the bounded window it stops
//      being propagation and becomes a real registry defect: hard failure.
//      (2026-09-10: @ai-matrx/agents@0.10.0 held `latest` with a 404 tarball for
//      ~25 minutes and turned this guard red in three repos at once.)
//
// Canonical policy: common-docs/policies/typescript-package-standard.md
//   § THE LATEST LAW · § THE CATCH-UP RULE (C28) · § Release procedure
//
//   --self-test   prove the classifier and the whole run can go red, and that a
//                 404 tarball inside the window is a transient (runs in CI).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// How long after publication npm's CDN is allowed to still be catching up.
// Longer than the worst observed real propagation (~25 min) and short enough that
// a genuinely broken `latest` cannot hide behind it forever.
export const PROPAGATION_WINDOW_MINUTES = 45;

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * The whole ruling, as one pure function. Everything else in this file is I/O.
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

function readInstalledVersion(projectRoot, name) {
    try {
        return JSON.parse(readFileSync(resolve(projectRoot, 'node_modules', name, 'package.json'), 'utf8')).version;
    } catch {
        return null;
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
            .filter(([name]) => name.startsWith('@ai-matrx/'))
            .map(([name, specifier]) => ({ name, section, specifier })),
    );
}

/**
 * The whole run, with every I/O edge injectable so --self-test exercises this
 * exact code path rather than a re-implementation of it.
 */
export async function runCheck({
    manifest,
    syncCommand,
    getInstalledVersion,
    getRegistry,
    getTarballReachable,
    now = new Date(),
    log = console.log,
    error = console.error,
} = {}) {
    const owned = declaredPackages(manifest);
    if (owned.length === 0) {
        log('✓ No @ai-matrx packages are declared.');
        return 0;
    }

    const failures = [];
    const transients = [];

    for (const { name, section, specifier } of owned) {
        let registry = { registryVersion: null };
        let installedVersion = null;
        let tarballReachable = null;

        if (specifier === 'latest') {
            registry = await getRegistry(name);
            installedVersion = getInstalledVersion(name);
            if (registry.registryVersion && installedVersion && installedVersion !== registry.registryVersion) {
                tarballReachable = await getTarballReachable(registry.tarballUrl, registry.registryVersion, name);
            }
        }

        const { verdict, message } = classify({
            name,
            section,
            specifier,
            installedVersion,
            registryVersion: registry.registryVersion,
            registryError: registry.registryError,
            tarballReachable,
            publishedAt: registry.publishedAt,
            now,
            syncCommand,
        });

        if (verdict === 'ok') log(message);
        else if (verdict === 'transient') transients.push(message);
        else failures.push(message);
    }

    if (transients.length > 0) {
        error('\n⚠ npm is still propagating a release — reported, not failed:');
        for (const transient of transients) error(`  - ${transient}`);
    }

    if (failures.length > 0) {
        error('\n@ai-matrx package freshness failed:');
        for (const failure of failures) error(`  - ${failure}`);
        error(
            `\nRun ${syncCommand}, adopt any CHANGELOG "Consumer action" the new versions carry,\n` +
                'commit package.json + the lockfile, and retry. Never fix this by pinning a version.',
        );
        return 1;
    }
    return 0;
}

// ── Self-test: prove the classifier and the run can go red ───────────────────

async function selfTest() {
    const now = new Date('2026-09-10T08:00:00Z');
    const minutesAgo = (m) => new Date(now.getTime() - m * 60000).toISOString();
    const problems = [];
    const expect = (label, actual, wanted) => {
        if (actual !== wanted) problems.push(`${label}: expected ${wanted}, got ${actual}`);
    };

    // 1. THE INCIDENT: behind + latest's tarball 404s inside the window = transient.
    //    Before 2026-09-10 this exact input exited 1 in three repos at once.
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

    // 6. Whole-run exit codes through the real runCheck: transient passes, stale fails.
    const manifest = { dependencies: { '@ai-matrx/agents': 'latest' } };
    const silence = () => {};
    const runWith = (tarballReachable, publishedAt) =>
        runCheck({
            manifest,
            syncCommand: 'pnpm sync:matrx-packages',
            getInstalledVersion: () => '0.9.2',
            getRegistry: async () => ({
                registryVersion: '0.10.0',
                tarballUrl: 'https://registry.npmjs.org/@ai-matrx/agents/-/agents-0.10.0.tgz',
                publishedAt,
            }),
            getTarballReachable: async () => tarballReachable,
            now,
            log: silence,
            error: silence,
        });
    expect('run exit code, simulated 404 tarball', await runWith(false, minutesAgo(5)), 0);
    expect('run exit code, servable tarball', await runWith(true, minutesAgo(5)), 1);
    expect('run exit code, 404 beyond window', await runWith(false, minutesAgo(600)), 1);

    if (problems.length > 0) {
        console.error('check-matrx-packages --self-test FAILED:');
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    console.log('✓ check-matrx-packages self-test passed (6 cases, incl. a simulated 404 tarball).');
}

// ── Entry point ──────────────────────────────────────────────────────────────

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv.includes('--self-test')) {
    await selfTest();
} else {
    const syncCommand = syncCommandFor(projectRoot);
    const exitCode = await runCheck({
        manifest: JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')),
        syncCommand,
        getInstalledVersion: (name) => readInstalledVersion(projectRoot, name),
        getRegistry: (name) => readRegistry(name, projectRoot),
        getTarballReachable: (url) => probeTarball(url),
    });
    process.exit(exitCode);
}

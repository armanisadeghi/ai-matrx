// next.config.js

const fs = require("fs");
const path = require("path");
const { getHeaders } = require("./utils/next-config/headers");
const { adminLegacyRouteRedirects } = require("./utils/next-config/adminRouteRedirects");
// const { remotePatterns } = require("./utils/next-config/imageConfig");
const { configureWebpack } = require("./utils/next-config/webpackConfig");
const copyFiles = require("./utils/next-config/copyFiles");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
    openAnalyzer: true,
    generateStatsFile: true,
    statsFilename: "stats.json",
});
const { FORCE_EXCLUDE_SIDEMENU } = require("./features/shell/build-flags");

/** Resolve aliases that swap heavy shell chrome for empty stubs (build A/B). */
function sidemenuStubAliases() {
    if (!FORCE_EXCLUDE_SIDEMENU) return {};
    const root = __dirname;
    return {
        "@/features/shell/components/sidebar/Sidebar": path.join(
            root,
            "features/shell/components/sidebar/Sidebar.stub.tsx",
        ),
        "@/features/shell/components/mobile-sheet/MobileSideSheet": path.join(
            root,
            "features/shell/components/mobile-sheet/MobileSideSheet.stub.tsx",
        ),
        "@/features/shell/components/dock/MobileDock": path.join(
            root,
            "features/shell/components/dock/MobileDock.stub.tsx",
        ),
        "@/features/shell/components/ShellSidebarCookieSync": path.join(
            root,
            "features/shell/components/ShellSidebarCookieSync.stub.tsx",
        ),
    };
}

// MATRX_PROFILE controls which routes are compiled into the build.
// With the 2026-07 deployment split, the app ships as THREE Vercel projects
// from this ONE repo — the union of the deployed slices is the full app, so a
// non-full profile in production is partitioning, not degradation:
//   ai-matrx        → aimatrx.com        → MATRX_PROFILE=slim  (main app)
//   ai-matrx-manage → manage.aimatrx.com → MATRX_PROFILE=admin ((admin) surface)
//   ai-matrx-demos  → demos.aimatrx.com  → MATRX_PROFILE=demos ((dev) surface)
//
// Profiles:
//   full (default) — everything: main app + (admin) + (dev) `*.dev.tsx`.
//   core — main app + (admin); NO (dev).
//   user — main app + (dev); parks (admin).
//   slim — main app only; parks (admin). (aimatrx.com's profile post-cutover.)
//   admin — ONLY (admin) + (auth-pages) + api/root files; parks (core),
//           (transitional), (public), (popup). For manage.aimatrx.com.
//   demos — ONLY (dev) routes + (auth-pages) + api/root files; parks (core),
//           (admin), (transitional), (public), (popup). For demos.aimatrx.com.
//
// Park mechanism: Next has no route-group exclude, so excluded groups are
// renamed app/(x) → app/_x_build_excluded (private `_` folder) for the
// process lifetime. Git source of truth is ALWAYS app/(x); parked names are
// gitignored. app/(dev) is NEVER parked — prod code imports helper files
// under it ("fake demos" debt); its route leaves are excluded via
// pageExtensions instead (route leaves are *.dev.tsx).
// WARNING: parking renames real folders — do not run a parked-profile build
// while a dev server on another profile watches the same tree.
//
// Cross-group imports break parked builds: route-group code may only import
// from features/ components/ lib/ etc., never another group's app/(x) path.
// ((dev) helper imports are the tolerated exception — (dev) is never parked.)
//
// Profile precedence — ENV WINS. Each Vercel project pins its own
// MATRX_PROFILE env var (main=slim-at-cutover, manage=admin, demos=demos);
// a code-side force must never override the satellites or all three
// projects would build the same slice. FORCE_MATRX_PROFILE below is the
// DEFAULT used only when the env var is unset/invalid (local builds, and
// the main project until its env is pinned).
const PROFILES = {
    full: { includeDev: true, park: [] },
    core: { includeDev: false, park: [] },
    user: { includeDev: true, park: ["admin"] },
    slim: { includeDev: false, park: ["admin"] },
    admin: { includeDev: false, park: ["core", "transitional", "public", "popup"] },
    demos: { includeDev: true, park: ["core", "admin", "transitional", "public", "popup"] },
};
const PARKABLE_GROUPS = ["admin", "core", "transitional", "public", "popup"];
const VALID_PROFILES = new Set(Object.keys(PROFILES));
/** @type {null | keyof typeof PROFILES} — DEFAULT when env is unset; null = "full" */
// null since the 2026-07-27 cutover: every Vercel project pins MATRX_PROFILE
// via env (main=slim, manage=admin, demos=demos), so this default only
// affects local dev/builds — where "full" keeps /demos and /administration
// available.
const FORCE_MATRX_PROFILE = null;
if (FORCE_MATRX_PROFILE && !VALID_PROFILES.has(FORCE_MATRX_PROFILE)) {
    throw new Error(
        `[matrx] Invalid FORCE_MATRX_PROFILE="${FORCE_MATRX_PROFILE}". ` +
            `Valid: ${[...VALID_PROFILES].join(" | ")} | null.`,
    );
}
const rawProfile = (process.env.MATRX_PROFILE || "").trim().toLowerCase();
if (rawProfile && !VALID_PROFILES.has(rawProfile)) {
    console.warn(
        `[matrx] Unknown MATRX_PROFILE="${process.env.MATRX_PROFILE}". ` +
            `Valid values: ${[...VALID_PROFILES].join(" | ")}. Falling back to ` +
            `${FORCE_MATRX_PROFILE || "full"}.`,
    );
}
const MATRX_PROFILE = VALID_PROFILES.has(rawProfile)
    ? rawProfile
    : FORCE_MATRX_PROFILE || "full";
const INCLUDE_DEV = PROFILES[MATRX_PROFILE].includeDev;
const PARK_SET = new Set(PROFILES[MATRX_PROFILE].park);

/**
 * Park a route group as a Next private `_` folder (not routed/compiled), or
 * restore it. Source of truth in git is always the live `(name)` path; parked
 * names are gitignored.
 * @param {boolean} exclude
 * @param {string} liveName e.g. "(admin)"
 * @param {string} parkedName e.g. "_admin_build_excluded"
 */
function syncRouteGroupPark(exclude, liveName, parkedName) {
    const live = path.join(__dirname, "app", liveName);
    const parked = path.join(__dirname, "app", parkedName);
    // Interrupted-run recovery: an aborted build can leave the parked copy
    // behind while git recreates the live path (both exist). The live path is
    // the source of truth; the stale park is quarantined — LOUDLY, never
    // deleted, in case it holds edits made while parked.
    if (fs.existsSync(live) && fs.existsSync(parked)) {
        const quarantine = `${parked}.stale-${Date.now()}`;
        fs.renameSync(parked, quarantine);
        console.warn(
            `[matrx] ⚠ STALE PARK: app/${liveName} and app/${parkedName} both existed ` +
                `(interrupted earlier run). Kept the live path; quarantined the park at ` +
                `${path.basename(quarantine)} — inspect/delete it manually.`,
        );
    }
    if (exclude) {
        if (fs.existsSync(live)) {
            fs.renameSync(live, parked);
            console.log(`[matrx] parked app/${liveName} → app/${parkedName}`);
        } else if (fs.existsSync(parked)) {
            console.log(`[matrx] app/${liveName} already parked at app/${parkedName}`);
        } else {
            console.warn(
                `[matrx] neither app/${liveName} nor app/${parkedName} found`,
            );
        }
    } else if (fs.existsSync(parked) && !fs.existsSync(live)) {
        fs.renameSync(parked, live);
        console.log(`[matrx] restored app/${liveName} from park`);
    }
}

for (const group of PARKABLE_GROUPS) {
    syncRouteGroupPark(PARK_SET.has(group), `(${group})`, `_${group}_build_excluded`);
}

console.log(
    `[matrx] MATRX_PROFILE=${MATRX_PROFILE}` +
        (FORCE_MATRX_PROFILE
            ? ` (FORCE_MATRX_PROFILE=${FORCE_MATRX_PROFILE})`
            : "") +
        (PARK_SET.size ? ` (parked: ${[...PARK_SET].join(", ")})` : "") +
        (FORCE_EXCLUDE_SIDEMENU ? " (FORCE_EXCLUDE_SIDEMENU=true)" : "") +
        ` (NODE_ENV=${process.env.NODE_ENV || "undefined"})`,
);
// When (dev) is included, `tsx` is listed FIRST so any plain page.tsx wins over
// a page.dev.tsx in the same directory — guard for stray duplicates from
// partial renames. No directory currently has both; this is defensive.
const pageExtensions = INCLUDE_DEV
    ? ["tsx", "ts", "jsx", "js", "dev.tsx", "dev.ts"]
    : ["tsx", "ts", "jsx", "js"];

/** @type {import('next').NextConfig} */
const nextConfig = {
    pageExtensions,
    // Build output directory. Defaults to ".next". Overridable via NEXT_DISTDIR
    // so a SECOND `next dev` (e.g. an agent's preview server on another port)
    // can run alongside your own without colliding. Next 16's per-distDir lock
    // (`<distDir>/dev/lock`) otherwise aborts any second dev server for the same
    // project — keyed on the directory, not the port — so two servers sharing
    // ".next" is both blocked AND unsafe (concurrent writes corrupt the build).
    // Giving the second instance its own distDir gives it its own lock, so they
    // coexist safely. Unset in production / normal dev → ".next" as before.
    distDir: process.env.NEXT_DISTDIR || ".next",
    // Vercel Skew Protection — DISABLED on purpose (2026-06-21).
    //
    // The previous line was `deploymentId: process.env.NEXT_DEPLOYMENT_ID`.
    // Two bugs made it actively break the app instead of protecting stale tabs:
    //   1. `NEXT_DEPLOYMENT_ID` is NOT a Vercel-injected variable — the real one
    //      is `VERCEL_DEPLOYMENT_ID`. So it resolved to an EMPTY string, and Next
    //      stamped every SSR-emitted asset URL with a meaningless `?dpl=` (no id).
    //   2. Under Turbopack (our prod bundler) the client-side runtime chunk loader
    //      does NOT apply `deploymentId`, so it requests the SAME chunks WITHOUT
    //      `?dpl=`. Result: the SSR script tag and the runtime request use two
    //      different URLs for one chunk. A lazily-imported chunk's script loads
    //      (200, no network error) but registers under a URL the runtime isn't
    //      awaiting → the dynamic `import()` never resolves and hangs forever
    //      (see features/overlays/boundary/lazyOverlay.tsx ChunkLoadError timeout).
    //
    // With no `deploymentId`, nothing carries `?dpl=`, every URL is consistent,
    // and lazy chunks resolve. Stale-tab protection is instead handled by:
    //   1. Vercel's NATIVE Skew Protection (Project Settings → Advanced —
    //      enable there, not here; it doesn't depend on this query-param path).
    //   2. The consent-based new-version prompt + stale-chunk handling in
    //      components/errors/ (see components/errors/FEATURE.md — NEVER
    //      auto-reload a live session).
    // Re-introduce `deploymentId` ONLY with `process.env.VERCEL_DEPLOYMENT_ID`
    // AND once Turbopack threads `dpl` through its runtime chunk loader —
    // until then the query-param approach is broken.
    // deploymentId: process.env.VERCEL_DEPLOYMENT_ID,

    // Build performance optimizations
    productionBrowserSourceMaps: false,
    devIndicators: false,  // disables the indicator entirely

    compiler: {
        // Strips console.log from production bundles, keeping error/warn. Restored 2026-07-18
        // (D63) after 4.5 months disabled "while debugging" — 743 console.log calls were
        // shipping to users' browsers, including stream/auth/context payloads.
        // Debugging in prod goes through the diagnostics capture, not raw console.log.
        removeConsole: process.env.NODE_ENV === 'production' ? {
            exclude: ['error', 'warn'],
        } : false,
    },
    
    // Moved from experimental (Next.js 15+)
    // Exclude native binaries and build artifacts that aren't needed at runtime.
    // @swc/helpers (pure JS) must NOT be excluded — it's required at runtime by
    // packages that import it as a peer. Only exclude the platform-specific native
    // binaries (@swc/core, @next/swc-*) and esbuild binaries.
    outputFileTracingExcludes: {
        '*': [
            'node_modules/@swc/core/**/*',
            'node_modules/@next/swc-*/**/*',
            'node_modules/@esbuild/**/*',
            '.git/**/*',
            '**/*.map',
        ],
    },

    
    // ON by ruling (2026-07-18, D62): the platform doctrine (CLAUDE.md "no manual
    // useMemo/useCallback") and all agent-written code since 2026-02 assume the compiler.
    // A/B build benchmark (MATRX_PROFILE=core): off 10.6min / on 12.0min (+13%) —
    // accepted cost. Do not flip this off without also rewriting the memoization doctrine.
    reactCompiler: true,
    experimental: {
        // MEMORY (measured 2026-07-26, experiment fleet v0.4.93-99):
        // - turbopackMemoryLimit alone (45GiB): compile SUCCEEDED in 19.4min where
        //   baseline OOM'd; then died when 29 page-data workers spawned on top.
        // - cpus caps those workers (default = cores-1 = 29 on Vercel Turbo).
        // 40GiB (not 45) leaves ~20GB headroom for the worker phase.
        //
        // cpus 8 → 4 (2026-07-27): after the graph-splitting campaign, compile
        // passes reliably (21.9 → 15.7 min) but v0.4.124/125/126/128/130 all
        // SIGKILL'd with a confirmed OOM 6-10s into "Collecting page data using
        // 8 workers" (5 red / 2 green at that line). Worker COUNT is the direct
        // multiplier on that phase's peak concurrent memory (heap flags are
        // stripped from these workers — vercel/next.js#95745), so halving the
        // pool halves the peak; the phase itself costs only ~1-2 min. If builds
        // still OOM at page-data with 4 workers, next levers are rootReducer
        // lazy-injection (shrinks every per-page server bundle) or building
        // off-Vercel (GH Actions + `vercel deploy --prebuilt`).
        // 40GiB → 30GiB (2026-07-26): the measurement below says peak RSS is
        // 58.49 GiB on a 60 GB build machine — a ~1.5 GB margin. That is why
        // this is marginal rather than broken: v0.4.121/122/129 went green and
        // then EVERY build from v0.4.130 to v0.4.136 died as the graph grew,
        // all with the same signature (SIGKILL ~8-10 min into compile, before
        // any "Collecting page data" line — so the cpus 8→4 worker fix above
        // does not cover this phase).
        //
        // This limit is Turbopack's cache-vs-GC target: higher = more retained
        // graph, less collection, more RSS. Lowering it makes compile collect
        // earlier and trade time for headroom. Slower is the correct trade —
        // as the source-map note below already puts it, a build that OOMs
        // ships nothing.
        //
        // If this is still not enough, do NOT keep shaving it blind: the real
        // levers are rootReducer lazy-injection (shrinks every per-page server
        // bundle) or building off-Vercel (GH Actions + `vercel deploy
        // --prebuilt`), and the graph itself needs to come down.
        // 30GiB → 40GiB (2026-07-28, Arman ruling closing D107): the 30GiB drop
        // was NOT the OOM fix — eliminating the incorrect edge lazy imports that
        // caused massive chunking (the v0.4.137 revert) was. Restored to 40GiB
        // for compile speed; the worker-phase headroom math above still holds.
        turbopackMemoryLimit: 42949672960,
        cpus: 4,
        serverActions: {
            bodySizeLimit: "10mb",
        },
        // Optimize lucide-react (the 1400+ icon barrel file) and zustand to avoid massive SSR chunks
        optimizePackageImports: ['lucide-react', 'zustand'],
        // SOURCE MAPS OFF (A1) — memory, not speed, is the binding constraint.
        // Measured with `next build --experimental-debug-memory-usage`: peak RSS
        // 62.81 → 58.49 GiB (−4.32 GiB) with these two flags. Full production
        // server/ output previously held 14,198 .js.map files / 1.40 GB against
        // 0.99 GB of actual server JS.
        //
        // `productionBrowserSourceMaps: false` only governs BROWSER maps
        // (static/ had zero .map). Server maps are a separate path:
        // `serverSourceMaps` + Turbopack emission. Explicitly force both off.
        // (Next docs: turbopackSourceMaps build default tracks
        // productionBrowserSourceMaps — still set false here so it cannot drift.)
        //
        // TRADE-OFF: production server stack traces point at compiled output,
        // which degrades lib/diagnostics. A build that OOMs ships nothing.
        turbopackSourceMaps: false,
        serverSourceMaps: false,
    },
    // Turbopack configuration (Next.js 16 default bundler)
    turbopack: {
        // jspdf's package `exports` map resolves the "node" condition to
        // dist/jspdf.node.min.js during the SSR pass, which pulls in fflate's
        // Node `worker_threads` build (`new Worker(c + workerAdd, { eval: true })`).
        // Turbopack can't resolve that dynamic Worker, so a clean/cold build
        // fails — and because the chat-assistant → jspdf chain is reachable from
        // the (core) layout, it breaks EVERY authenticated route, not just
        // chat. jspdf is only ever used client-side (DOM-capture PDF export), so
        // pin it to its browser ES build everywhere.
        resolveAlias: {
            jspdf: "jspdf/dist/jspdf.es.min.js",
            ...sidemenuStubAliases(),
        },
    },
    serverExternalPackages: ["canvas", "next-mdx-remote", "vscode-oniguruma", "websocket"],
    // Force Next.js's transformer over packages that ship pre-compiled output
    // using the classic JSX runtime (`import React from "react"` +
    // `React.createElement(...)`). Without this, Turbopack/SWC's automatic JSX
    // transform strips the React import, leaving bare `React.createElement`
    // calls that throw `ReferenceError: React is not defined` in production.
    // - react-filerobot-image-editor: Image Studio Edit mode (Filerobot 5.0).
    // - @scaleflex/ui: Filerobot's underlying UI primitives (same pattern).
    transpilePackages: ["react-filerobot-image-editor", "@scaleflex/ui"],
    typescript: {
        // RATIFIED (Arman, 2026-07-28, closing D64/D65): checks scream loud but
        // NEVER stop the build. Type errors are surfaced by the advisory release
        // gates (`pnpm check:release-gates` in release.sh); the build itself must
        // always ship. Do not flip this without a new ruling.
        ignoreBuildErrors: true,
    },
    // Next.js 16 removed the `eslint` config block and the `next lint` command.
    // Linting is now invoked via the ESLint CLI directly (`pnpm lint`) and is no
    // longer part of `next build` — so the previous `ignoreDuringBuilds: true`
    // is implicit. Run lint in pre-commit / CI only; never on production builds
    // (the no-barrel-files plugin parses every imported module and adds 5-10+ min).
    reactStrictMode: false,
    headers: getHeaders,
    async redirects() {
        return [
            ...adminLegacyRouteRedirects,
            // 2026-07-26: YouTube Discovery graduated from a dev demo into its
            // permanent authenticated Marketing home. These must be config
            // redirects (not only route shims): the deployment proxy sends
            // `/demos/*` to demos.aimatrx.com before a page can render.
            {
                source: '/demos/youtube-discovery/videos/:videoId',
                destination: '/marketing/discovery/youtube/videos/:videoId',
                permanent: true,
            },
            {
                source: '/demos/youtube-discovery',
                destination: '/marketing/discovery/youtube',
                permanent: true,
            },
            // 2026-07-25: Marketing consolidation. Content planning and keyword
            // research were mistakenly mounted as ROOT routes (`/content-plan`,
            // `/seo/keyword-research`). Both are marketing surfaces and now live
            // under the one `/marketing/*` hub. `/seo` stays reserved for the
            // PUBLIC tool suite (app/(public)/seo) — do not re-add an authed
            // `/seo/*` route here.
            { source: '/content-plan', destination: '/marketing/content-plan', permanent: true },
            { source: '/content-plan/:path*', destination: '/marketing/content-plan/:path*', permanent: true },
            { source: '/seo/keyword-research', destination: '/marketing/keyword-research', permanent: true },
            // 2026-07-13: Relationships hub consolidation. /administration/sharing
            // (link policy) and /administration/action-catalog moved into the
            // route-tabbed hub at /administration/database/relationships/*.
            { source: '/administration/sharing', destination: '/administration/database/relationships/sharing', permanent: false },
            { source: '/administration/action-catalog', destination: '/administration/agents/relationships/actions', permanent: false },
            // 2026-07-13: Users & Access hub consolidation. Admin user/access
            // management moved into the route-tabbed hub at
            // /administration/users/*.
            { source: '/administration/admins', destination: '/administration/users/admins', permanent: false },
            { source: '/administration/invitation-requests', destination: '/administration/users/invitations', permanent: false },
            { source: '/administration/entitlements', destination: '/administration/users/entitlements', permanent: false },
            { source: '/administration/email', destination: '/administration/users/email', permanent: false },
            // 2026-06-08: Transcripts consolidation. Renamed `/transcription/*`
            // route group to `/transcripts/*` so the feature has ONE canonical
            // URL with slash-versioned sub-routes (studio, scribe, admin).
            // Also lifted the processor up so `/transcripts` IS the workspace
            // (no `/processor` sub-route — matches the "one thing with slashes"
            // structure). Permanent so search indexes update.
            { source: '/transcription', destination: '/transcripts', permanent: true },
            { source: '/transcription/processor', destination: '/transcripts/processor', permanent: true },
            { source: '/transcription/:path*', destination: '/transcripts/:path*', permanent: true },
            // 2026-06-22: (ssr) route group deleted — demos consolidated under
            // app/(dev)/demos at /demos/*. Legacy /ssr/* and /demos/ssr/* URLs
            // redirect to the canonical /demos/* paths.
            { source: '/demos/ssr/:path*', destination: '/demos/:path*', permanent: false },
            { source: '/demos/ssr', destination: '/demos', permanent: false },
            { source: '/ssr/demos/:path*', destination: '/demos/:path*', permanent: false },
            { source: '/ssr/demos', destination: '/demos', permanent: false },
            { source: '/ssr/chat/:path*', destination: '/demos/chat/:path*', permanent: false },
            { source: '/ssr/chat', destination: '/demos/chat', permanent: false },
            { source: '/ssr/dashboard/:path*', destination: '/demos/dashboard/:path*', permanent: false },
            { source: '/ssr/dashboard', destination: '/demos/dashboard', permanent: false },
            { source: '/ssr', destination: '/demos', permanent: false },
            // /cloud-files was renamed to /files (2026-04-27). Permanent redirects
            // so old bookmarks, share links, and external references keep working.
            { source: '/cloud-files/:path*', destination: '/files/:path*', permanent: true },
            { source: '/cloud-files', destination: '/files', permanent: true },
            // Short alias for the phone scanner surface (canonical: /tools/scanner).
            { source: '/scan', destination: '/tools/scanner', permanent: false },
            // /org/* (old slug-only path) and /organizations/[id]/* (old UUID-only settings path)
            // are unified under /organizations/[orgId]/* which accepts both slug and UUID.
            { source: '/org/:orgId/projects/:projectId/settings/:path*', destination: '/organizations/:orgId/projects/:projectId/settings/:path*', permanent: true },
            { source: '/org/:orgId/projects/:projectId/settings', destination: '/organizations/:orgId/projects/:projectId/settings', permanent: true },
            { source: '/org/:orgId/projects/:projectId/:path*', destination: '/organizations/:orgId/projects/:projectId/:path*', permanent: true },
            { source: '/org/:orgId/projects/:projectId', destination: '/organizations/:orgId/projects/:projectId', permanent: true },
            { source: '/org/:orgId/shortcuts/:path*', destination: '/organizations/:orgId/shortcuts/:path*', permanent: true },
            { source: '/org/:orgId/shortcuts', destination: '/organizations/:orgId/shortcuts', permanent: true },
            { source: '/org/:orgId/:path*', destination: '/organizations/:orgId/:path*', permanent: true },
            { source: '/org/:orgId', destination: '/organizations/:orgId', permanent: true },
            { source: '/org', destination: '/organizations', permanent: true },
            // Legacy Transcripts deep-link redirects. The canonical URL is now
            // `/transcripts/*` (see the 2026-06-08 block at the top of this
            // list). These rules normalize OLDER aliases that pre-dated the
            // 2026-06-08 consolidation. NOTE: do NOT re-add the pre-consolidation
            // rules that pointed `/transcripts*` → `/transcription/processor*` —
            // they will cause an infinite redirect loop with the consolidation
            // block.
            { source: '/transcript-studio/:path*', destination: '/transcripts/studio/:path*', permanent: true },
            { source: '/transcript-studio', destination: '/transcripts/studio', permanent: true },
            { source: '/transcription/mobile/:path*', destination: '/transcripts/scribe/:path*', permanent: true },
            { source: '/transcription/mobile', destination: '/transcripts/scribe', permanent: true },
            // Entity-isolation migration (Phase 2+): legacy entity-bound routes
            // moved under /legacy/* so they can boot through the entity-aware
            // store/providers without bloating slim chunks. Old URLs are 307'd
            // to keep bookmarks + external links working until internal links
            // are fully audited; promote to permanent in a follow-up.
            // See ~/.claude/plans/the-entity-system-which-bubbly-wind.md
            // Whole-route entity moves (route exclusively used entities).
            { source: '/entity-crud/:path*', destination: '/legacy/entity-crud/:path*', permanent: false },
            { source: '/entity-crud', destination: '/legacy/entity-crud', permanent: false },
            // /entities was renamed to /entity-admin under /legacy
            { source: '/entities/:path*', destination: '/legacy/entity-admin/:path*', permanent: false },
            { source: '/entities', destination: '/legacy/entity-admin', permanent: false },
            { source: '/workflow-entity/:path*', destination: '/legacy/workflow-entity/:path*', permanent: false },
            { source: '/workflow-entity', destination: '/legacy/workflow-entity', permanent: false },
            { source: '/workflows-new/:path*', destination: '/legacy/workflows-new/:path*', permanent: false },
            { source: '/workflows-new', destination: '/legacy/workflows-new', permanent: false },
            { source: '/workflows/:path*', destination: '/legacy/workflows/:path*', permanent: false },
            { source: '/workflows', destination: '/legacy/workflows', permanent: false },
            // /deprecated/chat moved to /legacy/chat (the "deprecated" prefix dropped)
            { source: '/deprecated/chat/:path*', destination: '/legacy/chat/:path*', permanent: false },
            { source: '/deprecated/chat', destination: '/legacy/chat', permanent: false },
            // Surgical subroute moves: entity-using test subfolders that
            // ACTUALLY had URL routes were moved to /legacy/* during the
            // entity-isolation work. The remaining /tests/* and /demo/* paths
            // now redirect to the consolidated /demos/* prefix (see the
            // 2026-05-26 block below). These per-subfolder /legacy/* redirects
            // must remain ABOVE that catch-all so the more-specific match wins.
            { source: '/tests/advanced-data-table/:path*', destination: '/legacy/tests/advanced-data-table/:path*', permanent: false },
            { source: '/tests/advanced-data-table', destination: '/legacy/tests/advanced-data-table', permanent: false },
            { source: '/tests/dynamic-entity-test/:path*', destination: '/legacy/tests/dynamic-entity-test/:path*', permanent: false },
            { source: '/tests/dynamic-entity-test', destination: '/legacy/tests/dynamic-entity-test', permanent: false },
            { source: '/tests/dynamic-layouts/:path*', destination: '/legacy/tests/dynamic-layouts/:path*', permanent: false },
            { source: '/tests/dynamic-layouts', destination: '/legacy/tests/dynamic-layouts', permanent: false },
            { source: '/tests/fetch-test/:path*', destination: '/legacy/tests/fetch-test/:path*', permanent: false },
            { source: '/tests/fetch-test', destination: '/legacy/tests/fetch-test', permanent: false },
            { source: '/tests/forms/:path*', destination: '/legacy/tests/forms/:path*', permanent: false },
            { source: '/tests/forms', destination: '/legacy/tests/forms', permanent: false },
            { source: '/tests/relationship-management/:path*', destination: '/legacy/tests/relationship-management/:path*', permanent: false },
            { source: '/tests/relationship-management', destination: '/legacy/tests/relationship-management', permanent: false },
            { source: '/demo/component-demo/:path*', destination: '/legacy/demo/component-demo/:path*', permanent: false },
            { source: '/demo/component-demo', destination: '/legacy/demo/component-demo', permanent: false },
            { source: '/demo/many-to-many-ui/:path*', destination: '/legacy/demo/many-to-many-ui/:path*', permanent: false },
            { source: '/demo/many-to-many-ui', destination: '/legacy/demo/many-to-many-ui', permanent: false },
            // /administration/schema-manager depends on entity hooks (SchemaSelect, opsRedux);
            // moved under /legacy/administration so it boots through the entity store/providers.
            { source: '/administration/schema-manager/:path*', destination: '/legacy/administration/schema-manager/:path*', permanent: false },
            { source: '/administration/schema-manager', destination: '/legacy/administration/schema-manager', permanent: false },
            // 2026-05-26: Route-group reorganization. All internal demo / test /
            // experimental surfaces consolidated under a single /demos/* URL
            // prefix served from (dev) (auth-required).
            // (no auth). Originals lived in (authenticated)/tests, (authenticated)/demo,
            // (authenticated)/settings-*-demo, (authenticated)/layout-tests,
            // (authenticated)/dynamic-imports, (authenticated)/lists-junk,
            // (authenticated)/lists-explorer, (authenticated)/preview.
            // 307 for now so we can promote to 308 once internal links are audited.
            //
            // IMPORTANT: these are ordered AFTER the entity-isolation redirects
            // above so the more-specific /tests/advanced-data-table → /legacy/...
            // moves win before the catch-all /tests/:path* lands here.
            //
            // GATED on INCLUDE_DEV (full / user): destinations are (dev) routes.
            // Without (dev) compiled (core / slim), these would 307 → 404.
            ...(INCLUDE_DEV ? [
                { source: '/tests/:path*', destination: '/demos/tests/:path*', permanent: false },
                { source: '/tests', destination: '/demos/tests', permanent: false },
                { source: '/settings-hooks-demo', destination: '/demos/settings-hooks', permanent: false },
                { source: '/settings-primitives', destination: '/demos/settings-primitives', permanent: false },
                { source: '/settings-shell-demo', destination: '/demos/settings-shell', permanent: false },
                { source: '/settings-tree-demo', destination: '/demos/settings-tree', permanent: false },
                { source: '/layout-tests/:path*', destination: '/demos/layout-tests/:path*', permanent: false },
                { source: '/layout-tests', destination: '/demos/layout-tests', permanent: false },
                { source: '/dynamic-imports/:path*', destination: '/demos/dynamic-imports/:path*', permanent: false },
                { source: '/dynamic-imports', destination: '/demos/dynamic-imports', permanent: false },
                { source: '/lists-junk/:path*', destination: '/demos/lists-junk/:path*', permanent: false },
                { source: '/lists-junk', destination: '/demos/lists-junk', permanent: false },
                { source: '/lists-explorer', destination: '/demos/lists-explorer', permanent: false },
            ] : []),
            // Former public-demos lived at /demos/public/*; consolidated under (dev)/demos/*.
            { source: '/demos/public/:path*', destination: '/demos/:path*', permanent: false },
            { source: '/demos/public', destination: '/demos', permanent: false },
        ];
    },
    async rewrites() {
        return [
            {
                source: '/u/:slug*',
                destination: '/apps/custom/:slug*',
            },
            // Serve static HTML samples without the .html extension
            {
                source: '/samples/:name',
                destination: '/samples/:name.html',
            },
        ];
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**",
            },
            {
                protocol: "https",
                hostname: "api.microlink.io",
            },
        ],
    },
    webpack: (config, { isServer, dev }) => {
        // First apply your existing webpack config
        config = configureWebpack(config, { isServer });

        if (FORCE_EXCLUDE_SIDEMENU) {
            config.resolve.alias = {
                ...config.resolve.alias,
                ...sidemenuStubAliases(),
            };
        }

        // Optimize webpack for production builds - MINIMAL SAFE CONFIG
        if (!dev) {
            config.output.hashFunction = 'xxhash64';
        }

        // Add rule to prevent bundling of .onnx files
        config.module.rules.push({
            test: /\.onnx$/,
            type: "asset/resource",
            generator: {
                filename: "static/[hash][ext]",
            },
        });

        // Suppress THREE.WebGLProgram shader error in development mode
        if (dev) {
            const FilterWarningsPlugin = require("webpack-filter-warnings-plugin");
            config.plugins.push(
                new FilterWarningsPlugin({
                    exclude: /THREE\.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false/,
                })
            );
        }

        // Handle pptxgenjs for client-side only
        if (!isServer) {
            const webpack = require('webpack');
            
            // Ignore pptxgenjs and other Node.js dependencies
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
                crypto: false,
                stream: false,
                buffer: false,
                'node:fs': false,
                'node:path': false,
                'node:stream': false,
                jsdom: false,
                net: false,
                tls: false,
                child_process: false,
            };
            
            // Replace node: protocol imports with empty module
            config.plugins.push(
                new webpack.NormalModuleReplacementPlugin(
                    /^node:/,
                    (resource) => {
                        resource.request = resource.request.replace(/^node:/, '');
                    }
                )
            );
        }

        // Disable webpack caching to ensure fresh builds
        // config.cache = false;

        return config;
    },
    env: {
        // The RESOLVED build profile (env + FORCE override), inlined at build
        // time. proxy.ts trusts THIS — never the runtime MATRX_PROFILE env
        // var, which can disagree with what was actually compiled when
        // FORCE_MATRX_PROFILE is set in code.
        NEXT_PUBLIC_MATRX_PROFILE: MATRX_PROFILE,
        // Expose deployment ID to the client for diagnostics — lets the global
        // error logger include "this tab is on deployment X" so we can correlate
        // errors with stale-tab vs. genuinely-broken builds. Reads the REAL
        // Vercel-injected var (`VERCEL_DEPLOYMENT_ID`); `NEXT_DEPLOYMENT_ID` was
        // a non-existent variable that always resolved empty (see `deploymentId`
        // note above). Diagnostics-only — NOT used for asset/chunk URLs.
        NEXT_PUBLIC_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
        NEWS_API_KEY: process.env.NEWS_API_KEY,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
        SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
        SLACK_REDIRECT_URL: process.env.SLACK_REDIRECT_URL,
    },
};

copyFiles();
module.exports = withBundleAnalyzer(nextConfig);

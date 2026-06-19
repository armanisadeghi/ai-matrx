// next.config.js

const { getHeaders } = require("./utils/next-config/headers");
// const { remotePatterns } = require("./utils/next-config/imageConfig");
const { configureWebpack } = require("./utils/next-config/webpackConfig");
const copyFiles = require("./utils/next-config/copyFiles");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
    openAnalyzer: true,
    generateStatsFile: true,
    statsFilename: "stats.json",
});

// MATRX_PROFILE controls which routes are compiled into the build:
//   core (default in production) — main app: (core), (admin), (transitional),
//                    (legacy), (ssr), (public), (public-demos), (auth-pages),
//                    (popup). Internal dev/test surfaces under app/(dev)/ —
//                    whose route leaves are renamed *.dev.tsx — are NOT
//                    compiled because `dev.tsx` is not in pageExtensions.
//   full (default in development) — everything above PLUS app/(dev)/ routes.
//                    `pnpm dev` defaults to this so /demos/* works locally
//                    without per-developer env setup. The internal-demos
//                    Vercel project also runs `full`. To preview the
//                    production-core build locally, run with
//                    `MATRX_PROFILE=core pnpm dev`.
// Helper .tsx files under (dev) (e.g. (dev)/demos/tests/matrx-table/components/
// MatrxTable.tsx) keep plain .tsx because production code imports them directly;
// pageExtensions only filters routes, not arbitrary components.
const rawProfile = (process.env.MATRX_PROFILE || "").trim().toLowerCase();
if (rawProfile && rawProfile !== "full" && rawProfile !== "core") {
    console.warn(
        `[matrx] Unknown MATRX_PROFILE="${process.env.MATRX_PROFILE}". ` +
            `Valid values: "full" | "core". Falling back to NODE_ENV default.`,
    );
}
const MATRX_PROFILE =
    rawProfile === "full" || rawProfile === "core"
        ? rawProfile
        : process.env.NODE_ENV === "production"
          ? "core"
          : "full";
console.log(`[matrx] MATRX_PROFILE=${MATRX_PROFILE} (NODE_ENV=${process.env.NODE_ENV || "undefined"})`);
// In full mode `tsx` is listed FIRST so any plain page.tsx wins over a
// page.dev.tsx in the same directory — a guard for stray duplicates from
// partial renames. No directory currently has both; this is defensive.
const pageExtensions =
    MATRX_PROFILE === "full"
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
    // Vercel Skew Protection: when enabled in the Vercel project settings,
    // Vercel injects NEXT_DEPLOYMENT_ID at build time. Setting `deploymentId`
    // makes Next.js append `?dpl=<id>` to every chunk fetch, and Vercel routes
    // those requests to the matching deployment — so old browser tabs after a
    // deploy still load their original chunks instead of 404ing on hashes that
    // no longer exist. Without this, ChunkLoadError crashes stale tabs.
    deploymentId: process.env.NEXT_DEPLOYMENT_ID,

    // Build performance optimizations
    productionBrowserSourceMaps: false,
    devIndicators: false,  // disables the indicator entirely

    compiler: {
        // TODO: Restore this when done debugging — removes console.log in production but keeps error/warn
        // removeConsole: process.env.NODE_ENV === 'production' ? {
        //     exclude: ['error', 'warn'],
        // } : false,
        removeConsole: false,
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

    // The admin docs viewer (app/(admin)/admin/docs/[[...path]]/page.tsx) reads
    // arbitrary repo-relative `.md` files at request time. Its `process.cwd()`
    // read is deliberately opaque to the file-tracer (see that file) so Turbopack
    // stops auto-bundling the WHOLE repo (22k+ files) into the function. We
    // re-declare exactly what it needs here: source markdown only — never
    // node_modules. Add a directory here if a new docs location must be viewable.
    outputFileTracingIncludes: {
        '/admin/docs/[[...path]]': [
            './*.md',
            './app/**/*.md',
            './features/**/*.md',
            './components/**/*.md',
            './lib/**/*.md',
            './hooks/**/*.md',
            './utils/**/*.md',
            './providers/**/*.md',
            './types/**/*.md',
            './constants/**/*.md',
            './scripts/**/*.md',
            './migrations/**/*.md',
            './docs/**/*.md',
            './styles/**/*.md',
            './.cursor/**/*.md',
            './.claude/**/*.md',
        ],
    },
    
    // TEMP: disabled to measure build-time impact. React Compiler adds a per-component
    // analysis pass that scales super-linearly with the codebase. Re-enable once we've
    // baselined compile time with it off.
    reactCompiler: false,
    experimental: {
        serverActions: {
            bodySizeLimit: "10mb",
        },
        // Optimize lucide-react (the 1400+ icon barrel file) and zustand to avoid massive SSR chunks
        optimizePackageImports: ['lucide-react', 'zustand'],
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
            // 2026-06-08: Transcripts consolidation. Renamed `/transcription/*`
            // route group to `/transcripts/*` so the feature has ONE canonical
            // URL with slash-versioned sub-routes (studio, scribe, admin).
            // Also lifted the processor up so `/transcripts` IS the workspace
            // (no `/processor` sub-route — matches the "one thing with slashes"
            // structure). Permanent so search indexes update.
            { source: '/transcription', destination: '/transcripts', permanent: true },
            { source: '/transcription/processor', destination: '/transcripts/processor', permanent: true },
            { source: '/transcription/:path*', destination: '/transcripts/:path*', permanent: true },
            // 2026-05-28: SSR experiment consolidation. The (ssr) route group
            // moved from URL /ssr/* to /demos/ssr/* so every demo/test surface
            // shares the unified /demos/* prefix. The (ssr) layout (LiteStoreProvider
            // + glass shell) stays intact — only the inner folder was restructured.
            { source: '/ssr/demos/:path*', destination: '/demos/ssr/:path*', permanent: false },
            { source: '/ssr/demos', destination: '/demos/ssr', permanent: false },
            { source: '/ssr/chat/:path*', destination: '/demos/ssr/chat/:path*', permanent: false },
            { source: '/ssr/chat', destination: '/demos/ssr/chat', permanent: false },
            { source: '/ssr/dashboard/:path*', destination: '/demos/ssr/dashboard/:path*', permanent: false },
            { source: '/ssr/dashboard', destination: '/demos/ssr/dashboard', permanent: false },
            { source: '/ssr', destination: '/demos/ssr', permanent: false },
            // /cloud-files was renamed to /files (2026-04-27). Permanent redirects
            // so old bookmarks, share links, and external references keep working.
            { source: '/cloud-files/:path*', destination: '/files/:path*', permanent: true },
            { source: '/cloud-files', destination: '/files', permanent: true },
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
            // prefix served from (dev) (auth-required) and (public-demos)
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
            // GATED on MATRX_PROFILE=full: the destinations are (dev) routes,
            // which only exist in the full build. In the core build (production
            // main app) these redirects would 307 → 404; better to 404 directly.
            ...(MATRX_PROFILE === "full" ? [
                { source: '/tests/:path*', destination: '/demos/tests/:path*', permanent: false },
                { source: '/tests', destination: '/demos/tests', permanent: false },
                { source: '/demo/:path*', destination: '/demos/general/:path*', permanent: false },
                { source: '/demo', destination: '/demos/general', permanent: false },
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
                { source: '/preview', destination: '/demos/preview', permanent: false },
            ] : []),
            // Public demos that used to live at /demos/* (under (public)/demos)
            // shifted one segment deeper to /demos/public/* so the internal
            // (dev) demos and external public showcase share the prefix without
            // colliding. Each enumerated by old sub-path; redirects are
            // intentionally ordered AFTER the /demos/api-tests-style explicit
            // sub-path redirects above so the more specific entries win.
            { source: '/demos/api-tests/:path*', destination: '/demos/public/api-tests/:path*', permanent: false },
            { source: '/demos/api-tests', destination: '/demos/public/api-tests', permanent: false },
            { source: '/demos/color-test/:path*', destination: '/demos/public/color-test/:path*', permanent: false },
            { source: '/demos/color-test', destination: '/demos/public/color-test', permanent: false },
            { source: '/demos/feature-tests/:path*', destination: '/demos/public/feature-tests/:path*', permanent: false },
            { source: '/demos/feature-tests', destination: '/demos/public/feature-tests', permanent: false },
            { source: '/demos/local-tools/:path*', destination: '/demos/public/local-tools/:path*', permanent: false },
            { source: '/demos/local-tools', destination: '/demos/public/local-tools', permanent: false },
            { source: '/demos/overlay-instances/:path*', destination: '/demos/public/overlay-instances/:path*', permanent: false },
            { source: '/demos/overlay-instances', destination: '/demos/public/overlay-instances', permanent: false },
            { source: '/demos/scraper/:path*', destination: '/demos/public/scraper/:path*', permanent: false },
            { source: '/demos/scraper', destination: '/demos/public/scraper', permanent: false },
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
        // Expose deployment ID to the client for diagnostics — lets the global
        // error logger include "this tab is on deployment X" so we can correlate
        // errors with stale-tab vs. genuinely-broken builds.
        NEXT_PUBLIC_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        CARTESIA_API_KEY: process.env.CARTESIA_API_KEY,
        NEWS_API_KEY: process.env.NEWS_API_KEY,
        PICOVOICE_ACCESS_KEY: process.env.PICOVOICE_ACCESS_KEY,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
        SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
        SLACK_REDIRECT_URL: process.env.SLACK_REDIRECT_URL,
    },
};

copyFiles();
module.exports = withBundleAnalyzer(nextConfig);
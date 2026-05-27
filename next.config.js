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

/** @type {import('next').NextConfig} */
const nextConfig = {
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
        // the global (a) layout, it breaks EVERY authenticated route, not just
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
            // Static redirect — runs before proxy/auth, eliminates the flash+bounce
            // that occurred when /ssr/page.tsx did redirect() server-side after auth resolved.
            {
                source: '/ssr',
                destination: '/ssr/dashboard',
                permanent: false,
            },
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
            // Transcription hub: legacy transcript URLs → app/(a)/transcription/*
            { source: '/transcript-studio/:path*', destination: '/transcription/studio/:path*', permanent: true },
            { source: '/transcript-studio', destination: '/transcription/studio', permanent: true },
            { source: '/transcripts/:path*', destination: '/transcription/processor/:path*', permanent: true },
            { source: '/transcripts', destination: '/transcription/processor', permanent: true },
            { source: '/transcription/mobile/:path*', destination: '/transcription/scribe/:path*', permanent: true },
            { source: '/transcription/mobile', destination: '/transcription/scribe', permanent: true },
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
            // Surgical subroute moves: /admin, /tests, /demo stay slim. ONLY
            // the entity-using subfolders that ACTUALLY have URL routes moved
            // to /legacy/*. (admin/components is a helper folder, not URL routes,
            // so it stays under /admin entirely.)
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
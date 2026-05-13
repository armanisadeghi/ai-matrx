// lib/api/endpoints.ts
// Single source of truth for all Python FastAPI backend endpoint paths.
// Import ENDPOINTS from this file — never hardcode paths.

/**
 * All backend API endpoint paths.
 *
 * Organized by feature area matching the backend router structure.
 * Use these constants everywhere instead of hardcoded strings.
 *
 * Auth tiers:
 * - Public: No auth required
 * - Guest OK: Fingerprint or JWT token
 * - Authenticated: Valid JWT token required
 * - Admin: Valid JWT token + admin role
 */
export const ENDPOINTS = {
  /** AI endpoints — chat, agents, conversations */
  ai: {
    /**
     * POST — Manual-mode execution (Builder + ephemeral conversations).
     * POST /ai/manual
     *
     * Accepts full message history in `messages` on every call. Used by:
     *   • Builder — reads the LIVE agent definition (incl. unsaved edits) and
     *     sends it as the system instruction + priming messages.
     *   • Ephemeral conversations (turn 2+) — no DB row exists, so the client
     *     is the source of truth for history; sends it with each turn.
     *
     * `conversation_id` is optional in the body (for labeling/storage only);
     * pair with `is_new:false, store:false` for fully stateless runs.
     *
     * NOTE: this replaces the legacy `/ai/chat` endpoint. The canonical
     * client-side vocabulary is `manual` (see ConversationInvocation.routing
     * .apiEndpointMode). The legacy `chat` alias below stays for one
     * migration cycle.
     */
    manual: "/ai/manual" as const,

    /** @deprecated Use `ENDPOINTS.ai.manual`. Kept for one migration cycle. */
    chat: "/ai/manual" as const,

    /**
     * POST — Start a new agent conversation (Guest OK)
     * POST /ai/agents/{agentId}
     * Never send conversation_id — the server generates it and returns it in the stream.
     */
    agentStart: (agentId: string) => `/ai/agents/${agentId}` as const,

    /**
     * POST — Continue any existing conversation (Guest OK)
     * POST /ai/conversations/{conversationId}
     * Conversation ID in URL. Just send user_input in the body.
     */
    conversationContinue: (conversationId: string) =>
      `/ai/conversations/${conversationId}` as const,

    /**
     * POST — Pre-warm a conversation's server cache. No body. No auth.
     * POST /ai/conversations/{conversationId}/warm
     * Fire when user navigates to a conversation page.
     */
    conversationWarm: (conversationId: string) =>
      `/ai/conversations/${conversationId}/warm` as const,

    /**
     * POST — Pre-warm an agent's server cache. No auth. (public endpoint)
     * POST /ai/agents/{agentId}/warm
     * Optional body: `{ source: "prompt" | "builtin" | "prompt_version" | "builtin_version" }`
     */
    agentWarm: (agentId: string) => `/ai/agents/${agentId}/warm` as const,

    /**
     * POST — Start a new prompt conversation (Guest OK)
     * POST /ai/prompts/{promptId}
     * Body: PromptStartRequest — user_input, variables, stream, debug, client_tools, etc.
     * Never send conversation_id — the server generates it and returns it in the stream.
     */
    promptStart: (promptId: string) => `/ai/prompts/${promptId}` as const,

    /**
     * POST — Pre-warm a prompt's server cache. No auth. (public endpoint)
     * POST /ai/prompts/{promptId}/warm
     * Optional body: `{ source: string | null }`
     */
    promptWarm: (promptId: string) => `/ai/prompts/${promptId}/warm` as const,

    /**
     * POST — Start a new block-streaming agent session (Guest OK)
     * POST /ai/agents-blocks/{agentId}
     * Same as agentStart but emits 'content_block' NDJSON events instead of raw 'chunk' events.
     */
    agentBlocksStart: (agentId: string) =>
      `/ai/agents-blocks/${agentId}` as const,

    /**
     * POST — Pre-warm a block-streaming agent (Public)
     * POST /ai/agents-blocks/{agentId}/warm
     * Optional body: `{ source: "prompt" | "builtin" | "prompt_version" | "builtin_version" }`
     */
    agentBlocksWarm: (agentId: string) =>
      `/ai/agents-blocks/${agentId}/warm` as const,

    /**
     * POST — Execute a prompt app using its pinned prompt version (Guest OK)
     * POST /ai/apps/{appId}
     * The backend resolves the pinned prompt version — the client never sees prompt secrets.
     */
    appExecute: (appId: string) => `/ai/apps/${appId}` as const,

    /**
     * POST — Pre-warm a prompt app's pinned version into cache (Public, no auth)
     * POST /ai/apps/{appId}/warm
     * Fire when the prompt app page loads so execution is instant.
     */
    appWarm: (appId: string) => `/ai/apps/${appId}/warm` as const,

    /** POST — Cancel a running request by request_id (Authenticated) */
    cancel: (requestId: string) => `/ai/cancel/${requestId}` as const,
  },

  /** Block processing test endpoints — Guest OK */
  blockProcessing: {
    /** POST — Process raw text/markdown → structured blocks (JSON response) */
    process: "/utilities/block-processing/process" as const,
    /** POST — Process raw text/markdown → block events (NDJSON stream, simulates live agent) */
    processStream: "/utilities/block-processing/process/stream" as const,
  },

  /** Tool testing endpoints — Authenticated */
  tools: {
    /** GET — List available tools (?category=) */
    testList: "/tools/test/list",
    /** GET — Get tool details by name */
    testDetail: (toolName: string) => `/tools/test/${toolName}` as const,
    /** POST — Create/reuse test session */
    testSession: "/tools/test/session",
    /** POST — Execute tool test with streaming */
    testExecute: "/tools/test/execute",
  },

  /** Scraper endpoints — Authenticated */
  scraper: {
    /** POST — Quick scrape URLs */
    quickScrape: "/scraper/quick-scrape",
    /** POST — Search keywords */
    search: "/scraper/search",
    /** POST — Search and scrape combined */
    searchAndScrape: "/scraper/search-and-scrape",
    /** POST — Search and scrape with limits */
    searchAndScrapeLimited: "/scraper/search-and-scrape-limited",
    /** POST — Connectivity check */
    micCheck: "/scraper/mic-check",
  },

  /** Utility endpoints — Guest OK */
  utilities: {
    /** @deprecated Use ENDPOINTS.pdf.extractText instead */
    pdfExtractText: "/utilities/pdf/extract-text",
  },

  /**
   * PDF extraction, manipulation, and document management — Authenticated.
   * Most JSON endpoints accept a unified source via `MediaRef` (preferred for
   * cloud files via `cld_id`), `file`, `url`, or `local_path`. See
   * `features/pdf-extractor/types.ts` for the full type re-exports.
   *
   * NOTE: list/detail endpoints below are kept for backwards compatibility
   * but the workspace now reads `extracted_documents` directly from Supabase
   * for the sidebar list and the on-click detail. Loading hundreds of full
   * `content` rows from Python was making the window take 2+ minutes to open.
   */
  pdf: {
    // ── Lifecycle ─────────────────────────────────────────────────────────
    /**
     * POST — Compress PDF (multipart file upload). Query params:
     *   - `level` (1..5): minimum quality tier. 1=lossless, 5=max compression.
     *   - `max_size_mb` (optional float): absolute upper bound on output size;
     *     when set, the server escalates `level` one tier at a time until the
     *     output fits (or tier 5 is reached). Omit for "honour level exactly."
     * Response headers include `X-Compression-Level-Used` and
     * `X-Compression-Cap-Satisfied` so the caller can see what actually ran.
     */
    compress: "/utilities/pdf/compress" as const,
    /** POST — Single-file text extraction (stateless, legacy multipart). Returns `{ filename, text_content }`. */
    extractText: "/utilities/pdf/extract-text" as const,
    /** POST — Batch extraction with NDJSON streaming (saves to DB + storage). */
    batchExtract: "/utilities/pdf/batch-extract" as const,

    // ── New `MediaRef`-based JSON endpoints (matrx-utils) ─────────────────
    /** POST — Text extraction from a remote source (MediaRef / url / cld_id). Returns `PdfResult`. */
    extractTextRemote: "/utilities/pdf/extract-text-remote" as const,
    /** POST — Table extraction. Returns `PdfResult`. */
    extractTables: "/utilities/pdf/extract-tables" as const,
    /** POST — Extract pages into a new PDF. Returns PDF blob. */
    extractPages: "/utilities/pdf/extract-pages" as const,
    /** POST — Crop pages (with `crop_box`). Returns PDF blob. */
    cropPages: "/utilities/pdf/crop-pages" as const,
    /** POST — Rotate pages. Returns PDF blob. */
    rotatePages: "/utilities/pdf/rotate-pages" as const,
    /** POST — Delete pages. Returns PDF blob. */
    deletePages: "/utilities/pdf/delete-pages" as const,
    /** POST — Merge multiple PDFs. Returns PDF blob. */
    merge: "/utilities/pdf/merge" as const,
    /** POST — Split PDF into parts (`parts` or `max_pages_per_part`). Returns ZIP blob. */
    split: "/utilities/pdf/split" as const,

    // ── AI pipelines (streaming JSONL) ────────────────────────────────────
    /** POST — Process a PDF with AI agents (single-pass / chunk / reassembly). Streams JSONL. */
    processWithAi: "/utilities/pdf/process-with-ai" as const,
    /** POST — Full pipeline: extract → chunk → AI → reassembly. Streams JSONL with `PdfPipelineOptions`. */
    fullPipeline: "/utilities/pdf/full-pipeline" as const,
    /** POST — AI content cleaning on an already-extracted document (NDJSON streaming). */
    cleanContent: (docId: string) =>
      `/utilities/pdf/clean-content/${docId}` as const,

    // ── Document management (server-side; prefer direct Supabase reads) ──
    /** @deprecated — Read `extracted_documents` directly from Supabase with metadata-only projection. */
    documents: "/utilities/pdf/documents" as const,
    /** @deprecated — Read `extracted_documents` directly from Supabase. */
    document: (docId: string) => `/utilities/pdf/documents/${docId}` as const,

    // ── Phase 2 — render & advanced page ops ──────────────────────────────
    /** POST — Render one page to an image blob (PNG/JPEG/WebP/TIFF). */
    renderPage: "/utilities/pdf/render-page" as const,
    /** POST — Render every page; returns a ZIP of per-page images. */
    renderAll: "/utilities/pdf/render-all" as const,
    /** POST — Cover thumbnail at `max_side` px. */
    renderThumbnail: "/utilities/pdf/render-thumbnail" as const,
    /** POST — Reorder pages by `new_order`. Returns PDF blob. */
    reorderPages: "/utilities/pdf/reorder-pages" as const,
    /** POST — Insert pages from `source_*` into target. Returns PDF blob. */
    insertPages: "/utilities/pdf/insert-pages" as const,
    /** POST — Duplicate pages inline (`count` copies). Returns PDF blob. */
    duplicatePages: "/utilities/pdf/duplicate-pages" as const,
    /** GET — Studio preset catalog. Returns `PdfStudioCatalog`. */
    studioPresets: "/utilities/pdf/studio/presets" as const,
    /** POST — Studio dispatcher; image blob or ZIP depending on preset. */
    studioRender: "/utilities/pdf/studio/render" as const,

    // ── Phase 3 — layout analysis ─────────────────────────────────────────
    /** POST — Detect headers / footers / watermarks / recurring side notes. Returns `RepeatedRegionsReport`. */
    detectRepeatedRegions:
      "/utilities/pdf/detect-repeated-regions" as const,
    /** POST — Detect + strip repeated regions from per-page text. Returns `StripRepeatedRegionsResultSchema`. */
    stripRepeatedRegions:
      "/utilities/pdf/strip-repeated-regions" as const,
    /** POST — Classify every page (cover / TOC / body / exhibit / signature / billing / ...). Returns `LayoutClassificationReport`. */
    classifyPages: "/utilities/pdf/classify-pages" as const,
    /** POST — Multi-column → linear reading order. Returns `ReadingOrderReport`. */
    extractReadingOrder:
      "/utilities/pdf/extract-reading-order" as const,

    // ── Phase 4 — redaction & privacy ─────────────────────────────────────
    /** GET — Builtin redaction pattern catalog (SSN / email / phone / MRN / ...). */
    redactPatterns: "/utilities/pdf/redact/patterns" as const,
    /** POST — Redact one or more page-anchored rectangles. PDF blob or persisted JSON. */
    redactRegions: "/utilities/pdf/redact-regions" as const,
    /** POST — Redact every regex match (builtin id or raw pattern). PDF blob or persisted JSON. */
    redactPattern: "/utilities/pdf/redact-pattern" as const,
    /** POST — Detect repeated regions then redact selected/all. PDF blob or persisted JSON. */
    redactRepeatedRegions:
      "/utilities/pdf/redact-repeated-regions" as const,
    /** POST — Wipe /Info + XMP metadata + thumbnails. */
    stripMetadata: "/utilities/pdf/strip-metadata" as const,
    /** POST — Granular composite scrub (metadata / attachments / JS / flatten). */
    scrub: "/utilities/pdf/scrub" as const,
    /** POST — Bake annotations + widgets into page content. */
    flattenAnnotations:
      "/utilities/pdf/flatten-annotations" as const,
  },

  /**
   * Per-page AI extraction — fan out an agent across pages of a document and
   * persist structured results anchored to source page numbers. See
   * `features/page-extraction/FEATURE.md` for the data model.
   */
  pageExtraction: {
    /** POST — Run extraction across pages (NDJSON streaming, per-page events). */
    runStream: "/page-extraction/runs/stream" as const,
    /** POST — Retry one failed page-run (replaces its results). */
    retryPageRun: (pageRunId: string) =>
      `/page-extraction/page-runs/${pageRunId}/retry` as const,
    /** POST — Cancel an in-flight run. */
    cancelRun: (runId: string) =>
      `/page-extraction/runs/${runId}/cancel` as const,
  },

  /** Test/admin endpoints — Admin only */
  tests: {
    /** GET/POST — Example endpoints */
    examples: "/tests/examples",
    /** GET — Stream text test */
    streamText: "/tests/stream/text",
  },

  /** Builtin agent endpoints — Authenticated */
  builtinAgents: {
    /** POST — Categorize a single prompt (streaming) */
    categorize: "/ai/builtin-agents/categorize" as const,
    /** POST — Categorize a single prompt (sync, no streaming) */
    categorizeSync: "/ai/builtin-agents/categorize/sync" as const,
  },

  /** Media processing endpoints — Authenticated */
  media: {
    /**
     * POST — Upload podcast video → extract cover frame, render podcast
     * variants, returns URLs + Asset envelope. Image-only uploads now go
     * through {@link ENDPOINTS.assets.upload} with `preset="podcast"`.
     */
    uploadPodcastVideo: "/media/podcast/upload-video" as const,
  },

  /**
   * Unified asset (image / media) upload + render-variants pipeline.
   *
   * One endpoint family handles every media upload in the platform. The
   * server renders preset variants (cover, OG, thumbnail, avatar sizes,
   * favicons, etc.) and returns the canonical {@link Asset} envelope —
   * see `features/files/types.ts` for the wire shape.
   *
   * Preset → variant key map (high level):
   *   - raw      → only `original`
   *   - podcast  → cover_url (3000²), cover_sd_url (1400²) + social baseline
   *   - social   → og_url, square_url, portrait_url, story_url, yt_thumbnail_url + baseline
   *   - web      → hero_url, og_url, card_url, touch_icon_url, pwa_icon_url, thumbnail_url + baseline
   *   - email    → header_url, square_url (no baseline)
   *   - logo     → logo_lg_url, logo_md_url, logo_sm_url + baseline
   *   - avatar   → avatar_xl/lg/md/sm/xs_url (no baseline)
   *   - favicon  → favicon_android/apple_touch/32/16_url (no baseline)
   *
   * Authenticated. See `features/files/api/assets.ts` for the typed
   * client wrapper.
   */
  assets: {
    /** POST — multipart upload + render preset variants. */
    upload: "/assets" as const,
    /** GET — read the canonical Asset envelope for an upload's master file. */
    detail: (fileId: string) => `/assets/${fileId}` as const,
    /** PATCH — change visibility / share / metadata. */
    patch: (fileId: string) => `/assets/${fileId}` as const,
    /** POST — render more variants (idempotent). */
    addVariants: (fileId: string) => `/assets/${fileId}/variants` as const,
    /** GET — list every server-known preset. */
    presets: "/assets/presets" as const,
    /**
     * GET — convert any cld_files row to an Asset envelope. The
     * click-to-render primitive: hand any file_id, get back URLs +
     * variants the FE can render directly.
     */
    forFile: (fileId: string) => `/files/${fileId}/asset` as const,
    /**
     * POST — no-persist preview rendering (E.16, matrx-utils v1.1.0).
     * Accepts a `MediaRef` source + variants[]. Returns either base64
     * `data_url` (≤256 KB) or 5-min ephemeral `signed_url`. Replaces the
     * deleted Next.js Sharp route at app/api/images/studio/process.
     */
    preview: "/assets/preview" as const,
    /**
     * POST — multipart variant of {@link preview}. Render directly without
     * a prior `cld_files` row. Useful for Image Studio drag-and-drop
     * preview before commit-to-save.
     */
    previewMultipart: "/assets/preview/multipart" as const,
    /**
     * POST — no-persist PDF compression (E.17). Accepts a `MediaRef` source.
     * Returns `data_url` (≤256 KB) or 5-min ephemeral `signed_url`.
     * Replaces the deleted Next.js route at app/api/pdf/compress.
     */
    pdfCompress: "/assets/pdf-compress" as const,
    /** POST — multipart variant of {@link pdfCompress}. */
    pdfCompressMultipart: "/assets/pdf-compress/multipart" as const,
  },

  /** Health endpoints — Public (aligned with types/python-generated OpenAPI) */
  health: {
    /** GET — Basic health check */
    check: "/health",
    /** GET — Detailed health with component status */
    detailed: "/health/detailed",
    /** GET — Liveness (process up; no I/O) */
    live: "/health/live",
    /** GET — Readiness (deps initialized; use for deploy probes) */
    ready: "/health/ready",
  },

  /** Research endpoints — Authenticated */
  research: {
    /** POST — Initialize research config */
    init: "/research/init",
    /** GET — List templates */
    templatesList: "/research/templates/list",
    /** POST — Create template */
    templatesCreate: "/research/templates",
    /** GET — Template detail */
    templateDetail: (templateId: string) =>
      `/research/templates/${templateId}` as const,
    /** GET — Extension scrape queue */
    extensionScrapeQueue: "/research/extension/scrape-queue",
    /** GET — Research state / PATCH — Update config */
    state: (projectId: string) => `/research/${projectId}` as const,
    /** POST — Suggest setup */
    suggest: (projectId: string) => `/research/${projectId}/suggest` as const,
    /** POST — Run full pipeline (streaming) */
    run: (projectId: string) => `/research/${projectId}/run` as const,
    /** POST — Trigger search (streaming) */
    search: (projectId: string) => `/research/${projectId}/search` as const,
    /** POST — Trigger scrape (streaming) */
    scrape: (projectId: string) => `/research/${projectId}/scrape` as const,
    /** POST — Analyze all sources (streaming) */
    analyzeAll: (projectId: string) =>
      `/research/${projectId}/analyze-all` as const,
    /** POST — Synthesize */
    synthesize: (projectId: string) =>
      `/research/${projectId}/synthesize` as const,
    /** GET — Keywords */
    keywords: (projectId: string) => `/research/${projectId}/keywords` as const,
    /** GET — Sources */
    sources: (projectId: string) => `/research/${projectId}/sources` as const,
    /** GET — Tags */
    tags: (projectId: string) => `/research/${projectId}/tags` as const,
    /** GET/POST — Document */
    document: (projectId: string) => `/research/${projectId}/document` as const,
    /** GET — Costs */
    costs: (projectId: string) => `/research/${projectId}/costs` as const,
  },
} as const;

/**
 * Backend base URLs — one entry per ServerEnvironment in adminPreferencesSlice.
 *
 * ALL values MUST come from environment variables. No fallback URLs are
 * hardcoded here — if a variable is missing the value is undefined, which
 * will surface as a clear error rather than silently pointing at the wrong
 * server. Configure every env in .env.local / Vercel project settings.
 *
 * Environment variables:
 *   NEXT_PUBLIC_BACKEND_URL_PROD     → production server
 *   NEXT_PUBLIC_BACKEND_URL_DEV      → development/feature-branch server
 *   NEXT_PUBLIC_BACKEND_URL_STAGING  → staging server
 *   NEXT_PUBLIC_BACKEND_URL_LOCAL    → local dev (default: http://localhost:8000)
 *   NEXT_PUBLIC_BACKEND_URL_GPU      → dedicated GPU inference server
 *
 * Use the service origin only (e.g. https://server.example.com), not a path
 * suffix like https://server.example.com/api — paths in ENDPOINTS are rooted at
 * the host (/health, /ai, …). A bad base produces wrong URLs and server warnings.
 *
 * 'custom' is not listed here — it is stored in adminPreferences.customServerUrl
 * and resolved dynamically in resolveBaseUrl().
 */
export const BACKEND_URLS: Record<string, string | undefined> = {
  production: process.env.NEXT_PUBLIC_BACKEND_URL_PROD,
  development: process.env.NEXT_PUBLIC_BACKEND_URL_DEV,
  staging: process.env.NEXT_PUBLIC_BACKEND_URL_STAGING,
  localhost:
    process.env.NEXT_PUBLIC_BACKEND_URL_LOCAL ?? "http://localhost:8000",
  gpu: process.env.NEXT_PUBLIC_BACKEND_URL_GPU,
} as const;

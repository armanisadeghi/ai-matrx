/**
 * Route ownership at the Python API boundary.
 *
 * The standalone matrx-files service intentionally owns only the routes
 * listed here. Broader file-adjacent APIs such as `/files/{id}/ingest`, RAG,
 * annotations, and media processing still belong to aidream and must not be
 * moved merely because their path starts with `/files`.
 */

import { BACKEND_URLS } from "@/lib/api/endpoints";

export const API_SERVICES = ["aidream", "scraper", "files", "seo"] as const;

export type ApiService = (typeof API_SERVICES)[number];
export type ServiceEnvironment = "production" | "localhost";

/**
 * Loopback API targets are always available in a development bundle, and in a
 * production bundle ONLY while an admin is signed in.
 *
 * Two failure modes this balances:
 *   - A deployed site must never route an ordinary visitor's API traffic to
 *     their own `localhost` (the persisted selection is browser-wide, not
 *     account-scoped, so it would otherwise survive logout into a non-admin
 *     session).
 *   - An admin pointing the deployed frontend at their local Python server is
 *     a first-class workflow. Blocking it is a defect, not "security".
 *
 * The unlock is a module-level mirror of Redux admin state so non-React
 * callers (`configuredServiceUrl`, slice reducers) can read it synchronously.
 * `providers/LoopbackApiAccessSync.tsx` is the ONLY writer.
 */
let loopbackAdminUnlock = false;

export function setLoopbackApiTargetsAdminUnlock(unlocked: boolean): void {
  loopbackAdminUnlock = unlocked;
}

export function allowsLoopbackApiTargets(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production" || loopbackAdminUnlock;
}

export function isLoopbackApiUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export const API_SERVICE_LABELS: Record<ApiService, string> = {
  aidream: "AI / aidream",
  scraper: "Scraper",
  files: "Files",
  seo: "SEO",
};

/**
 * The one browser-visible origin map for independently deployed Python services.
 * Production origins can be replaced per deployment; loopback defaults match each
 * package's supported local launcher.
 */
export const API_SERVICE_URLS: Record<
  ApiService,
  Record<ServiceEnvironment, string | undefined>
> = {
  aidream: {
    production: BACKEND_URLS.production,
    localhost: BACKEND_URLS.localhost,
  },
  scraper: {
    production:
      process.env.NEXT_PUBLIC_SCRAPER_URL ??
      "https://scraper.app.matrxserver.com",
    localhost:
      process.env.NEXT_PUBLIC_SCRAPER_URL_LOCAL ?? "http://localhost:8001",
  },
  files: {
    production:
      process.env.NEXT_PUBLIC_FILES_URL ?? "https://files.matrxserver.com",
    localhost:
      process.env.NEXT_PUBLIC_FILES_URL_LOCAL ?? "http://127.0.0.1:8090",
  },
  seo: {
    production:
      process.env.NEXT_PUBLIC_SEO_URL ?? "https://seo.matrxserver.com",
    localhost: process.env.NEXT_PUBLIC_SEO_URL_LOCAL ?? "http://127.0.0.1:8081",
  },
};

export function configuredServiceUrl(
  service: ApiService,
  environment: ServiceEnvironment,
): string | undefined {
  const url = API_SERVICE_URLS[service][environment]?.replace(/\/+$/, "");
  if (
    !allowsLoopbackApiTargets() &&
    (environment === "localhost" || isLoopbackApiUrl(url))
  ) {
    return undefined;
  }
  return url;
}

const UUID_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

interface ServiceRouteRule {
  pattern: RegExp;
  methods: ReadonlySet<string>;
}

const methods = (...values: string[]): ReadonlySet<string> => new Set(values);

const STANDALONE_FILE_ROUTE_RULES: readonly ServiceRouteRule[] = [
  { pattern: /^\/files\/upload\/?$/i, methods: methods("POST") },
  { pattern: /^\/files\/bulk\/?$/i, methods: methods("POST") },
  {
    pattern: /^\/files\/sync\/(?:changes|folders)\/?$/i,
    methods: methods("GET"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/?$`, "i"),
    methods: methods("GET", "PATCH", "DELETE"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/download/?$`, "i"),
    methods: methods("GET"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/pdf-pages/?$`, "i"),
    methods: methods("POST"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/url/?$`, "i"),
    methods: methods("GET"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/restore/?$`, "i"),
    methods: methods("POST"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/asset/?$`, "i"),
    methods: methods("GET"),
  },
  {
    pattern: new RegExp(`^/files/${UUID_SEGMENT}/share-links/?$`, "i"),
    methods: methods("GET", "POST"),
  },
  { pattern: /^\/assets\/?$/i, methods: methods("POST") },
  { pattern: /^\/assets\/presets\/?$/i, methods: methods("GET") },
  {
    pattern:
      /^\/assets\/(?:preview|preview\/multipart|pdf-compress|pdf-compress\/multipart)\/?$/i,
    methods: methods("POST"),
  },
  {
    pattern: new RegExp(`^/assets/${UUID_SEGMENT}/?$`, "i"),
    methods: methods("GET"),
  },
  {
    pattern: /^\/share\/[^/]+(?:\/download)?\/?$/i,
    methods: methods("GET"),
  },
];

/** True only when the deployed standalone service owns this exact route. */
export function isStandaloneFileServiceRoute(
  path: string,
  method?: string,
): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  const normalizedMethod = method?.toUpperCase();
  return STANDALONE_FILE_ROUTE_RULES.some(
    (rule) =>
      rule.pattern.test(pathname) &&
      (!normalizedMethod || rule.methods.has(normalizedMethod)),
  );
}

/**
 * The standalone `matrx-files` service OWNS these routes — browser traffic goes
 * there unconditionally. There is deliberately no toggle: route ownership is a
 * property of the architecture, not of an environment variable. (A
 * `NEXT_PUBLIC_FILES_BROWSER_CUTOVER` env gate lived here until 2026-07-28 and
 * silently kept every browser upload on aidream for two weeks after the CORS
 * problem it was added for had been fixed.) Which HOST answers — production,
 * localhost, or an admin pin — is resolved separately by `resolveFilesBaseUrl`.
 */
export function shouldRouteBrowserRequestToStandaloneFiles(
  path: string,
  method: string | undefined,
): boolean {
  return isStandaloneFileServiceRoute(path, method);
}

/** Resolve and normalize the optional public files-service origin. */
export function configuredFilesServiceUrl(): string | undefined {
  return configuredServiceUrl("files", "production");
}

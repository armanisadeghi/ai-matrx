/**
 * Route ownership at the Python API boundary.
 *
 * The standalone matrx-files service intentionally owns only the routes
 * listed here. Broader file-adjacent APIs such as `/files/{id}/ingest`, RAG,
 * annotations, and media processing still belong to aidream and must not be
 * moved merely because their path starts with `/files`.
 */

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

/** Resolve and normalize the optional public files-service origin. */
export function configuredFilesServiceUrl(): string | undefined {
  const configured = process.env.NEXT_PUBLIC_FILES_URL;
  return configured ? configured.replace(/\/$/, "") : undefined;
}

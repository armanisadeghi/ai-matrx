/**
 * ============================================================
 * LOG PARSING RULES — AI Matrx Server Log Standard
 * ============================================================
 *
 * MANDATORY FORMAT FOR ALL MATRX BACKEND SERVICES
 * ─────────────────────────────────────────────────
 * Every log line MUST follow this canonical form:
 *
 *   TIMESTAMP [LEVEL] [module.path] [ShortName] MESSAGE
 *
 * Where:
 *   TIMESTAMP  = ISO-8601 or Python/uvicorn format:
 *                  2025-04-03T14:22:01.123Z
 *                  2025-04-03 14:22:01,123
 *                  2025-04-03 14:22:01.123
 *                  2025-04-03 14:22:01          ← seconds-only also accepted
 *
 *   [LEVEL]    = One of in brackets: [DEBUG] [INFO] [WARNING] [ERROR] [CRITICAL]
 *                Also accepted as bare word: DEBUG INFO WARNING ERROR CRITICAL
 *
 *   [module.path]  = Optional dotted Python module path in brackets.
 *                    e.g. [aidream.api.middleware.api_prefix_compat]
 *
 *   [ShortName]    = Short CamelCase identifier in brackets — used for display.
 *                    e.g. [ApiPrefixCompat] [AuthMiddleware] [Request]
 *                    Must be present (use module leaf if omitted in legacy logs).
 *
 *   MESSAGE    = Free-form text. For JSON payloads, place on the NEXT LINE(S).
 *
 * MULTI-LINE PAYLOADS
 * ───────────────────
 * When a log entry includes a JSON body, the HEADER LINE must end with a colon:
 *
 *   2025-04-03 14:22:01 INFO [Request] POST /api/...:
 *   {
 *       "method": "POST",
 *       ...
 *   }
 *
 * Rules:
 *   - Header line ends with ':'
 *   - The next non-empty line starts a JSON block ('{' or '[')
 *   - The block continues until the matching closing brace/bracket at depth 0
 *   - All lines of the block are part of the same logical log entry
 *   - Continuation lines inherit ALL metadata from their header line
 *     (level, category, urgency, color, bgColor, module, modulePath)
 *   - Filtering operates on groups: show/hide all lines in a group together
 *
 * ============================================================
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type LogLevel =
  | "DEBUG"
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL"
  | "UNKNOWN";

export type LogCategory =
  | "request" // HTTP request/response lines
  | "stream" // Stream emitter / SSE events
  | "auth" // Auth middleware, JWT, session events
  | "compat" // API compatibility/rewriting warnings
  | "database" // DB queries, connections
  | "system" // Process start/stop, health checks, uvicorn
  | "error" // Exceptions, tracebacks
  | "ai-execution" // AI model calls, tool registry, chat router, task execution
  | "cx" // CX persistence, conversation gate, labeler
  | "config" // Unrecognized fields, config validation warnings
  | "json-payload" // Continuation lines that are part of a JSON block
  | "general" // Lines that matched something loosely but no specific category
  | "unknown"; // No category signal detected at all — the ??? bucket

export type LogUrgency = "low" | "medium" | "high" | "critical" | "unknown";

/**
 * A single parsed line.
 *
 * KEY INVARIANT: All lines that share a groupId carry IDENTICAL values for
 * level, category, urgency, color, bgColor, module, and modulePath.
 * This is enforced by the propagation pass after initial parsing.
 *
 * `raw` is always the original unmodified line — always render this, never
 * a derived field.
 */
export interface ParsedLogLine {
  raw: string;
  lineIndex: number;
  timestamp: string | null;
  level: LogLevel;
  module: string | null;
  modulePath: string | null;
  category: LogCategory;
  urgency: LogUrgency;
  color: string;
  bgColor: string;
  isJsonStart: boolean;
  isJsonContinuation: boolean;
  jsonData: unknown | null;
  /** Non-null on both header and all continuation lines of the same entry. */
  groupId: number | null;
  httpMethod: string | null;
  httpPath: string | null;
  httpStatus: number | null;
  httpDuration: string | null;
}

// ─── Regexes ─────────────────────────────────────────────────────────────────

const RE_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)\s*/;

// Matches [WARNING], WARNING, WARNING: — bracket form is preferred in our format
const RE_LEVEL = /^\[?(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL|FATAL)\]?:?\s*/i;

// Lowercase dotted path: [aidream.api.middleware.foo]
const RE_MODULE_PATH = /^\[([a-z][a-z0-9_.]*)\]\s*/;
// Any bracket name: CamelCase, SCREAMING_CASE, or words-with-spaces
// e.g. [ApiPrefixCompat], [CHAT ROUTER], [Stream Emitter], [AI Task],
//      [CX PERSISTENCE PERSIST COMPLETED REQUEST], [DEBUG EXECUTE UNTIL COMPLETE]
const RE_MODULE_SHORT = /^\[([A-Za-z][A-Za-z0-9_ ]*?)\]\s*/;

const RE_HTTP = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s"]*)/;
// Standard status: "— 200", "status=200"
// Uvicorn access log: "GET /path HTTP/1.1" 200  (status after closing quote)
const RE_HTTP_STATUS =
  /—\s*([1-5]\d{2})\b|"[A-Z]+ [^ ]+ HTTP\/\d\.\d"\s+([1-5]\d{2})\b|\bstatus[= ]([1-5]\d{2})\b/i;
const RE_HTTP_DUR = /\((\d+(?:\.\d+)?\s*(?:ms|s))\)/;

const MODULE_CATEGORY_MAP: Record<string, LogCategory> = {
  // ── Request / HTTP ──────────────────────────────────────────────────────────
  Request: "request",
  // ── Auth ────────────────────────────────────────────────────────────────────
  AuthMiddleware: "auth",
  // ── API compat ──────────────────────────────────────────────────────────────
  ApiPrefixCompat: "compat",
  // ── Streaming ───────────────────────────────────────────────────────────────
  StreamEmitter: "stream",
  "Stream Emitter": "stream", // bare [Stream Emitter] form (has space)
  // ── System / infrastructure ──────────────────────────────────────────────────
  Database: "database",
  DB: "database",
  Health: "system",
  Startup: "system",
  Shutdown: "system",
  Uvicorn: "system",
  uvicorn: "system",
  // ── AI execution layer ───────────────────────────────────────────────────────
  "CHAT ROUTER": "ai-execution",
  "Google Chat": "ai-execution",
  ToolRegistry: "ai-execution",
  "AI Task": "ai-execution",
  "DEBUG EXECUTE UNTIL COMPLETE": "ai-execution",
  // ── CX / conversation lifecycle ───────────────────────────────────────────────
  ConversationGate: "cx",
  ConversationLabeler: "cx",
  "CX PERSISTENCE PERSIST COMPLETED REQUEST": "cx",
  // ── Config / field validation ─────────────────────────────────────────────────
  UNRECOGNIZED: "config",
  UnifiedConfig: "config",
};

// ─── Color derivation — single source of truth ────────────────────────────────
//
// These functions are the ONLY place colors are computed.
// Continuation lines call them with the same inputs as their header.

export function levelToColor(level: LogLevel): string {
  switch (level) {
    case "DEBUG":
      return "text-muted-foreground";
    case "INFO":
      return "text-info";
    case "WARNING":
      return "text-warning";
    case "ERROR":
    case "CRITICAL":
      return "text-destructive";
    default:
      return "text-foreground";
  }
}

export function levelToBg(level: LogLevel): string {
  switch (level) {
    case "WARNING":
      return "bg-warning/10";
    case "ERROR":
      return "bg-destructive/10";
    case "CRITICAL":
      return "bg-destructive/15";
    default:
      return "";
  }
}

export function categoryToColor(cat: LogCategory, fallback: string): string {
  switch (cat) {
    case "request":
      return "text-info";
    case "stream":
      return "text-secondary";
    case "auth":
      return "text-success";
    case "compat":
      return "text-warning";
    case "database":
      return "text-info";
    case "system":
      return "text-muted-foreground";
    case "error":
      return "text-destructive";
    case "ai-execution":
      return "text-secondary";
    case "cx":
      return "text-primary";
    case "config":
      return "text-warning";
    default:
      return fallback;
  }
}

export function deriveColor(level: LogLevel, category: LogCategory): string {
  // ERROR, WARNING, and CRITICAL always use their level color — no category can override.
  if (level === "ERROR" || level === "CRITICAL" || level === "WARNING") {
    return levelToColor(level);
  }
  const lc = levelToColor(level);
  return category !== "general" &&
    category !== "unknown" &&
    category !== "json-payload"
    ? categoryToColor(category, lc)
    : lc;
}

export function levelToUrgency(level: LogLevel, cat: LogCategory): LogUrgency {
  if (level === "CRITICAL") return "critical";
  if (level === "ERROR" || cat === "error") return "high";
  if (level === "WARNING" || cat === "compat" || cat === "config")
    return "medium";
  if (level === "UNKNOWN" && (cat === "unknown" || cat === "general"))
    return "unknown";
  return "low";
}

// ─── Heuristic category detection ────────────────────────────────────────────

function inferCategory(raw: string): LogCategory {
  if (/Traceback|Exception:|raise |stacktrace/i.test(raw)) return "error";
  // Uvicorn access log: IP:PORT - "METHOD /path HTTP/x.x" STATUS
  if (
    /\d+\.\d+\.\d+\.\d+(?::\d+)? - "(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)/.test(
      raw,
    )
  )
    return "request";
  if (/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i.test(raw))
    return "request";
  if (/Stream\s*Emitter|\[Stream Emitter\]|stream_emit/i.test(raw))
    return "stream";
  if (/\b(auth|login|token|session|jwt|fingerprint)\b/i.test(raw))
    return "auth";
  if (/rewriting|deprecated|compat|→/i.test(raw)) return "compat";
  if (/\b(SELECT|INSERT|UPDATE|DELETE)\b|\bquery\b|\bconnection\b/i.test(raw))
    return "database";
  if (/\b(startup|shutdown|started|listening|uvicorn|health)\b/i.test(raw))
    return "system";
  if (
    /\b(executing|tool.?registry|chat.?router|iteration|finish.?reason|google.?chat)\b/i.test(
      raw,
    )
  )
    return "ai-execution";
  if (
    /\b(conversation.?gate|conversation.?label|cx.?persist|user.?request)\b/i.test(
      raw,
    )
  )
    return "cx";
  if (/\bUnrecognized\b|\bunknown.?field\b|\bUnrecognized.?keys\b/i.test(raw))
    return "config";
  return "unknown";
}

// ─── JSON depth tracker ───────────────────────────────────────────────────────

function updateJsonDepth(line: string, depth: number): number {
  for (const ch of line) {
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return depth;
}

function tryParseJson(block: string): unknown | null {
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseLogLines(raw: string): ParsedLogLine[] {
  const lines = raw.split("\n");
  const result: ParsedLogLine[] = [];

  let groupCounter = 0;
  let currentGroupId: number | null = null;
  let jsonDepth = 0;
  let jsonAccum: string[] = [];
  // Index in result[] of the header line of the current group
  let headerIdx = -1;

  // ── Close the current JSON group: parse JSON, backfill all group members ──
  function closeGroup() {
    if (currentGroupId === null) return;

    const parsed =
      jsonAccum.length > 0 ? tryParseJson(jsonAccum.join("\n")) : null;

    // The header's metadata is the ground truth
    const header = result[headerIdx];

    for (let k = headerIdx; k < result.length; k++) {
      if (result[k].groupId !== currentGroupId) continue;
      const isHeader = k === headerIdx;

      // Stamp parsed JSON onto every member
      if (parsed !== null) result[k].jsonData = parsed;

      // Propagate header metadata to all continuation lines
      if (!isHeader) {
        result[k].timestamp = header.timestamp;
        result[k].level = header.level;
        result[k].module = header.module;
        result[k].modulePath = header.modulePath;
        result[k].category = header.category;
        result[k].urgency = header.urgency;
        result[k].color = header.color;
        result[k].bgColor = header.bgColor;
      }
    }

    currentGroupId = null;
    jsonDepth = 0;
    jsonAccum = [];
    headerIdx = -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // ── Blank line ─────────────────────────────────────────────────────────
    if (trimmed === "") {
      closeGroup();
      result.push({
        raw: rawLine,
        lineIndex: i,
        timestamp: null,
        level: "UNKNOWN",
        module: null,
        modulePath: null,
        category: "general",
        urgency: "low",
        color: "",
        bgColor: "",
        isJsonStart: false,
        isJsonContinuation: false,
        jsonData: null,
        groupId: null,
        httpMethod: null,
        httpPath: null,
        httpStatus: null,
        httpDuration: null,
      });
      continue;
    }

    // ── JSON continuation: first opener line (depth 0 → 1+) ────────────────
    if (
      currentGroupId !== null &&
      jsonDepth === 0 &&
      (trimmed.startsWith("{") || trimmed.startsWith("["))
    ) {
      jsonAccum.push(rawLine);
      jsonDepth = updateJsonDepth(rawLine, 0);
      result.push({
        raw: rawLine,
        lineIndex: i,
        timestamp: null,
        level: "UNKNOWN",
        module: null,
        modulePath: null,
        category: "json-payload",
        urgency: "low",
        color: "text-neutral-500",
        bgColor: "",
        isJsonStart: false,
        isJsonContinuation: true,
        jsonData: null,
        groupId: currentGroupId,
        httpMethod: null,
        httpPath: null,
        httpStatus: null,
        httpDuration: null,
      });
      if (jsonDepth <= 0) closeGroup();
      continue;
    }

    // ── JSON continuation: inside the block (depth > 0) ────────────────────
    if (currentGroupId !== null && jsonDepth > 0) {
      jsonAccum.push(rawLine);
      jsonDepth = updateJsonDepth(rawLine, jsonDepth);
      result.push({
        raw: rawLine,
        lineIndex: i,
        timestamp: null,
        level: "UNKNOWN",
        module: null,
        modulePath: null,
        category: "json-payload",
        urgency: "low",
        color: "text-neutral-500",
        bgColor: "",
        isJsonStart: false,
        isJsonContinuation: true,
        jsonData: null,
        groupId: currentGroupId,
        httpMethod: null,
        httpPath: null,
        httpStatus: null,
        httpDuration: null,
      });
      if (jsonDepth <= 0) closeGroup();
      continue;
    }

    // ── New log header line ─────────────────────────────────────────────────
    closeGroup();

    let rest = rawLine;

    // 1) Timestamp
    let timestamp: string | null = null;
    const tsM = RE_TIMESTAMP.exec(rest);
    if (tsM) {
      timestamp = tsM[1];
      rest = rest.slice(tsM[0].length);
    }

    // 2) Level
    let level: LogLevel = "UNKNOWN";
    const lvlM = RE_LEVEL.exec(rest);
    if (lvlM) {
      const u = lvlM[1].toUpperCase();
      level =
        u === "WARN" ? "WARNING" : u === "FATAL" ? "CRITICAL" : (u as LogLevel);
      rest = rest.slice(lvlM[0].length);
    }

    // 3) Module path + short name
    let modulePath: string | null = null;
    let module: string | null = null;

    const pathM = RE_MODULE_PATH.exec(rest);
    if (pathM && pathM[1].includes(".")) {
      modulePath = pathM[1];
      module = pathM[1].split(".").pop() ?? null;
      rest = rest.slice(pathM[0].length);
    }
    const shortM = RE_MODULE_SHORT.exec(rest);
    if (shortM) {
      module = shortM[1];
      rest = rest.slice(shortM[0].length);
    }

    // 4) Category
    let category: LogCategory =
      module && MODULE_CATEGORY_MAP[module]
        ? MODULE_CATEGORY_MAP[module]
        : inferCategory(rawLine);
    if (
      (level === "ERROR" || level === "CRITICAL") &&
      /Traceback|Exception|raise /.test(rawLine)
    ) {
      category = "error";
    }

    // 5) HTTP fields
    let httpMethod: string | null = null;
    let httpPath: string | null = null;
    let httpStatus: number | null = null;
    let httpDuration: string | null = null;
    if (category === "request") {
      const m = RE_HTTP.exec(rawLine);
      if (m) {
        httpMethod = m[1];
        httpPath = m[2];
      }
      const sm = RE_HTTP_STATUS.exec(rawLine);
      // Three capture groups: dash-form | uvicorn-quoted-form | status=-form
      if (sm) httpStatus = parseInt(sm[1] ?? sm[2] ?? sm[3], 10);
      const dm = RE_HTTP_DUR.exec(rawLine);
      if (dm) httpDuration = dm[1];
    }

    // 6) Derive color/bg/urgency — single call, same logic used for continuations
    const color = deriveColor(level, category);
    const bgColor = levelToBg(level);
    const urgency = levelToUrgency(level, category);

    // 7) Does this line open a JSON block?
    const isJsonStart = rawLine.trimEnd().endsWith(":");

    if (isJsonStart) {
      groupCounter++;
      currentGroupId = groupCounter;
      jsonDepth = 0;
      jsonAccum = [];
      headerIdx = result.length; // will be this entry's index
    }

    result.push({
      raw: rawLine,
      lineIndex: i,
      timestamp,
      level,
      module,
      modulePath,
      category,
      urgency,
      color,
      bgColor,
      isJsonStart,
      isJsonContinuation: false,
      jsonData: null,
      groupId: isJsonStart ? currentGroupId : null,
      httpMethod,
      httpPath,
      httpStatus,
      httpDuration,
    });
  }

  closeGroup();
  return result;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

export interface LogFilters {
  levels: Set<LogLevel>;
  categories: Set<LogCategory>;
  urgencies: Set<LogUrgency>;
  search: string;
  /**
   * Module allowlist.
   * - Empty AND modulesCleared=false → all modules pass (uninitialised, no filtering).
   * - Non-empty → only lines whose module key is in the set are shown.
   * - Empty AND modulesCleared=true → nothing passes (user explicitly cleared all).
   * The sentinel MODULE_NONE represents lines with no detected module.
   */
  modules: Set<string>;
  /** True when the user explicitly cleared all modules (empty set = "show nothing"). */
  modulesCleared: boolean;
  /**
   * Endpoint (httpPath) allowlist — same semantics as modules.
   * - Empty AND endpointsCleared=false → all lines pass (no endpoint filter active).
   * - Non-empty → only lines whose httpPath is in the set are shown.
   *   Lines with no httpPath always pass when endpointsCleared=false.
   * - endpointsCleared=true → lines with no httpPath still pass; lines with an
   *   httpPath must be in the set (empty set = hide all request lines).
   */
  endpoints: Set<string>;
  /** True when the user explicitly cleared all endpoints. */
  endpointsCleared: boolean;
  showJsonPayloads: boolean;
  /**
   * Quick noise exclusions — when a flag is true, matching lines are hidden.
   * Operates on log groups (same as other filters). Search can still surface
   * excluded groups when any line in the group matches the search term.
   */
  noiseExcludes: LogNoiseExcludes;
}

/** Toggle flags for high-volume log sources that drown out useful signal. */
export interface LogNoiseExcludes {
  cloudFiles: boolean;
  healthChecks: boolean;
  admin: boolean;
  replaySweep: boolean;
  wakeListener: boolean;
  autoIngestListener: boolean;
}

export const DEFAULT_NOISE_EXCLUDES: LogNoiseExcludes = {
  cloudFiles: true,
  healthChecks: true,
  admin: true,
  replaySweep: true,
  wakeListener: true,
  autoIngestListener: true,
};

export const NOISE_EXCLUDE_PRESETS: ReadonlyArray<{
  key: keyof LogNoiseExcludes;
  label: string;
  description: string;
  match: (line: ParsedLogLine) => boolean;
  /** When set, endpoint chips for matching paths are omitted from the filter UI. */
  endpointMatch?: (httpPath: string) => boolean;
}> = [
  {
    key: "cloudFiles",
    label: "/cloud-files/",
    description: "Cloud file storage HTTP requests",
    match: (line) =>
      line.httpPath?.includes("/cloud-files/") === true ||
      /\/cloud-files\//i.test(line.raw),
    endpointMatch: (path) => path.includes("/cloud-files/"),
  },
  {
    key: "healthChecks",
    label: "/health/",
    description: "Health-check HTTP requests",
    match: (line) => {
      if (line.httpPath && /\/health(?:\/|$|\?)/i.test(line.httpPath)) {
        return true;
      }
      return /(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s"]*\/health(?:\/|$|\?)/i.test(
        line.raw,
      );
    },
    endpointMatch: (path) => /\/health(?:\/|$|\?)/i.test(path),
  },
  {
    key: "admin",
    label: "/admin/",
    description: "Admin HTTP requests",
    match: (line) => {
      if (line.httpPath && /\/admin(?:\/|$|\?)/i.test(line.httpPath)) {
        return true;
      }
      return /\/admin(?:\/|$|\?)/i.test(line.raw);
    },
    endpointMatch: (path) => /\/admin(?:\/|$|\?)/i.test(path),
  },
  {
    key: "replaySweep",
    label: "Replay sweep",
    description: "matrx_ai.persistence.replay auto-replay sweep warnings",
    match: (line) =>
      line.modulePath === "matrx_ai.persistence.replay" ||
      /\[matrx_ai\.persistence\.replay\]/i.test(line.raw) ||
      (line.module === "Replay" && /Auto-replay swept/i.test(line.raw)),
  },
  {
    key: "wakeListener",
    label: "wake-listener",
    description: "Wake listener connection and reconnect logs",
    match: (line) =>
      line.modulePath === "aidream.cross_component.wake_listener" ||
      line.module === "wake-listener" ||
      /\[aidream\.cross_component\.wake_listener\]/i.test(line.raw) ||
      /\[wake-listener\]/i.test(line.raw),
  },
  {
    key: "autoIngestListener",
    label: "auto-ingest-listener",
    description: "Auto-ingest notify listener connection and reconnect logs",
    match: (line) =>
      line.modulePath === "aidream.workers.notify_listener" ||
      line.module === "auto-ingest-listener" ||
      /\[aidream\.workers\.notify_listener\]/i.test(line.raw) ||
      /\[auto-ingest-listener\]/i.test(line.raw),
  },
];

export function isEndpointHiddenByNoise(
  httpPath: string,
  excludes: LogNoiseExcludes,
): boolean {
  for (const preset of NOISE_EXCLUDE_PRESETS) {
    if (!excludes[preset.key] || !preset.endpointMatch) continue;
    if (preset.endpointMatch(httpPath)) return true;
  }
  return false;
}

export function isExcludedByNoise(
  line: ParsedLogLine,
  excludes: LogNoiseExcludes,
): boolean {
  for (const preset of NOISE_EXCLUDE_PRESETS) {
    if (excludes[preset.key] && preset.match(line)) return true;
  }
  return false;
}

/** Sentinel used in the modules filter set to represent lines with module === null */
export const MODULE_NONE = "(none)";

export const ALL_LEVELS: LogLevel[] = [
  "DEBUG",
  "INFO",
  "WARNING",
  "ERROR",
  "CRITICAL",
  "UNKNOWN",
];
export const ALL_CATEGORIES: LogCategory[] = [
  "request",
  "stream",
  "auth",
  "compat",
  "database",
  "system",
  "error",
  "ai-execution",
  "cx",
  "config",
  "json-payload",
  "general",
  "unknown",
];
export const ALL_URGENCIES: LogUrgency[] = [
  "low",
  "medium",
  "high",
  "critical",
  "unknown",
];

export function defaultFilters(): LogFilters {
  return {
    levels: new Set<LogLevel>(ALL_LEVELS),
    categories: new Set<LogCategory>(ALL_CATEGORIES),
    urgencies: new Set<LogUrgency>(ALL_URGENCIES),
    search: "",
    modules: new Set<string>(),
    modulesCleared: false,
    endpoints: new Set<string>(),
    endpointsCleared: false,
    showJsonPayloads: true,
    noiseExcludes: { ...DEFAULT_NOISE_EXCLUDES },
  };
}

/**
 * Filter operates on GROUPS, not individual lines.
 *
 * Decision process:
 *  1. The filter decision is made using the GROUP HEADER's metadata
 *     (every line in the group now shares identical level/category/urgency/module,
 *      so any member can be used — we use the first).
 *  2. If the group's header passes all filters, ALL lines in the group are shown.
 *  3. If it fails, ALL lines in the group are hidden.
 *  4. `showJsonPayloads = false` hides continuation lines but keeps the header visible.
 *  5. Lines with no groupId (standalone lines) are filtered individually.
 *  6. Blank lines always pass (they are visual separators, not log entries).
 */
export function applyFilters(
  lines: ParsedLogLine[],
  filters: LogFilters,
): ParsedLogLine[] {
  const searchLower = filters.search.toLowerCase();

  // Build a set of groupIds whose header passes the filter
  // (so we can make the group-show/hide decision once per group)
  const passedGroups = new Set<number>();
  const failedGroups = new Set<number>();

  function headerPasses(
    line: ParsedLogLine,
    opts?: { ignoreNoise?: boolean; ignoreSearch?: boolean },
  ): boolean {
    const searchMatches =
      searchLower !== "" && line.raw.toLowerCase().includes(searchLower);
    if (
      !opts?.ignoreNoise &&
      !searchMatches &&
      isExcludedByNoise(line, filters.noiseExcludes)
    )
      return false;
    if (!filters.levels.has(line.level)) return false;
    if (!filters.categories.has(line.category)) return false;
    if (!filters.urgencies.has(line.urgency)) return false;
    if (filters.modulesCleared || filters.modules.size > 0) {
      const key = line.module ?? MODULE_NONE;
      if (!filters.modules.has(key)) return false;
    }
    // Endpoint filter: only applies to lines that have a parsed httpPath
    if (
      line.httpPath &&
      (filters.endpointsCleared || filters.endpoints.size > 0)
    ) {
      if (!filters.endpoints.has(line.httpPath)) return false;
    }
    if (searchLower && !opts?.ignoreSearch && !searchMatches) return false;
    return true;
  }

  // First pass: decide each group (header wins)
  for (const line of lines) {
    if (
      line.groupId !== null &&
      !passedGroups.has(line.groupId) &&
      !failedGroups.has(line.groupId)
    ) {
      // This is the first line we see for this group — it's the header since we iterate in order
      if (headerPasses(line)) {
        passedGroups.add(line.groupId);
      } else {
        // Give the search a second chance: if search is active, check if it matches
        // *any* raw line in the group (we don't have them all yet, so this runs lazily below)
        failedGroups.add(line.groupId);
      }
    }
  }

  // If search is active, give failed groups a second chance by checking all their lines
  if (searchLower) {
    for (const line of lines) {
      if (line.groupId !== null && failedGroups.has(line.groupId)) {
        if (line.raw.toLowerCase().includes(searchLower)) {
          const header = lines.find((l) => l.groupId === line.groupId);
          if (
            header &&
            headerPasses(header, { ignoreNoise: true, ignoreSearch: true })
          ) {
            passedGroups.add(line.groupId);
            failedGroups.delete(line.groupId);
          }
        }
      }
    }
  }

  return lines.filter((line) => {
    // Blank separators always shown
    if (line.raw.trim() === "") return true;

    // Grouped lines: group decision applies
    if (line.groupId !== null) {
      if (!passedGroups.has(line.groupId)) return false;
      // Header always shown when group passes
      if (!line.isJsonContinuation) return true;
      // Continuation lines: respect showJsonPayloads
      return filters.showJsonPayloads;
    }

    // Standalone lines: filtered individually
    const searchMatches =
      searchLower !== "" && line.raw.toLowerCase().includes(searchLower);
    if (!searchMatches && isExcludedByNoise(line, filters.noiseExcludes))
      return false;
    if (!filters.levels.has(line.level)) return false;
    if (!filters.categories.has(line.category)) return false;
    if (!filters.urgencies.has(line.urgency)) return false;
    if (filters.modulesCleared || filters.modules.size > 0) {
      const key = line.module ?? MODULE_NONE;
      if (!filters.modules.has(key)) return false;
    }
    if (
      line.httpPath &&
      (filters.endpointsCleared || filters.endpoints.size > 0)
    ) {
      if (!filters.endpoints.has(line.httpPath)) return false;
    }
    if (searchLower && !line.raw.toLowerCase().includes(searchLower))
      return false;
    return true;
  });
}

export function extractModules(lines: ParsedLogLine[]): string[] {
  const mods = new Set<string>();
  let hasNoModule = false;
  for (const l of lines) {
    if (l.module) {
      mods.add(l.module);
    } else if (l.raw.trim() !== "") {
      hasNoModule = true;
    }
  }
  const sorted = Array.from(mods).sort();
  if (hasNoModule) sorted.unshift(MODULE_NONE);
  return sorted;
}

export function extractEndpoints(lines: ParsedLogLine[]): string[] {
  const paths = new Set<string>();
  for (const l of lines) {
    if (l.httpPath) paths.add(l.httpPath);
  }
  return Array.from(paths).sort();
}

/** Endpoints for the filter panel — omits paths hidden by active noise excludes. */
export function filterEndpointsForDisplay(
  endpoints: string[],
  excludes: LogNoiseExcludes,
): string[] {
  return endpoints.filter((ep) => !isEndpointHiddenByNoise(ep, excludes));
}

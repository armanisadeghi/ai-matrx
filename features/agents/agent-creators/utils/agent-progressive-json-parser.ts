/**
 * Progressive JSON parser for agent-generator output.
 *
 * The AI Agent Generator streams back an agx_agent row shape — NOT the
 * legacy prompt shape. Key differences this parser handles:
 *
 *   - `variable_definitions` (snake case) instead of `variableDefaults`
 *   - `messages[].content` arrives as `[{"type": "text", "text": "…"}]`,
 *     not a plain string
 *   - `agent_type`, `model_id`, `tools`, `custom_tools`, `context_slots`,
 *     `mcp_servers`, `model_tiers`, `output_schema`, `tags`, `category`
 *
 * Tries JSON.parse first (the full parse). If the block isn't complete yet,
 * falls back to a progressive walker that pulls whatever top-level fields
 * are already valid so the UI can show partial results while the model
 * streams.
 */

export interface PartialAgentData {
  name?: string;
  description?: string;
  agent_type?: string;
  model_id?: string;
  category?: string | null;
  tags?: string[];
  messages?: Array<{
    role: string;
    /** Flattened content — extracted from either a plain string or a
     *  `[{type:"text", text:"…"}]` array. */
    content: string;
  }>;
  variable_definitions?: Array<{
    name: string;
    defaultValue?: unknown;
    helpText?: string;
    required?: boolean;
    customComponent?: unknown;
  }>;
  context_slots?: Array<{
    key: string;
    type?: string;
    label?: string;
    description?: string;
  }>;
  settings?: Record<string, unknown>;
  tools?: unknown[];
  custom_tools?: unknown[];
  mcp_servers?: unknown[];
  model_tiers?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  /** True once the whole JSON block parses cleanly. */
  isComplete: boolean;
}

// ── Entry points ───────────────────────────────────────────────────────────

/**
 * Locates the agent JSON object inside a streamed text blob and returns
 * a `{ start, end, body }` span. Handles three formats the generator has
 * shipped at various points:
 *
 *   1. Fenced with a language tag:   ```json\n{...}\n```
 *   2. Fenced without a language:    ```\n{...}\n```
 *   3. Raw — no fences at all:        {...}
 *
 * The newer agent-generator model emits format (3), so this scanner has
 * to stand in for the regexes that used to do the work. The returned
 * span describes the *full* slice in the original text — fences
 * included if present — so callers can split before/after cleanly.
 *
 * `end` is exclusive and may equal `text.length` mid-stream (the body
 * has not closed yet); `body` is always trimmed and never includes
 * fence markers.
 */
export interface AgentJsonBlockSpan {
  /** Inclusive start index of the block in `text` (fence start when fenced). */
  start: number;
  /** Exclusive end index — either after the closing fence, after the closing
   *  brace, or `text.length` if the body is still streaming. */
  end: number;
  /** The JSON body, fence-stripped and trimmed. */
  body: string;
  /** True when the body's braces balanced — i.e. the object closed. */
  isClosed: boolean;
}

export function findAgentJsonBlockSpan(
  text: string,
): AgentJsonBlockSpan | null {
  if (!text) return null;

  // ── Format 1 + 2: fenced ──────────────────────────────────────────────
  // Try ```json first, then plain ``` with a JSON-looking body.
  const fenceMatch =
    /```json\s*\n/.exec(text) ?? /```\s*\n(?=\s*[\{\[])/.exec(text);
  if (fenceMatch) {
    const bodyStart = fenceMatch.index + fenceMatch[0].length;
    const closeIdx = text.indexOf("```", bodyStart);
    if (closeIdx === -1) {
      // Open fence, no close yet — body is everything we have so far.
      return {
        start: fenceMatch.index,
        end: text.length,
        body: text.slice(bodyStart).trim(),
        isClosed: false,
      };
    }
    return {
      start: fenceMatch.index,
      end: closeIdx + 3,
      body: text.slice(bodyStart, closeIdx).trim(),
      isClosed: true,
    };
  }

  // ── Format 3: raw — scan for the first top-level `{` that opens a
  // plausible JSON object (a `{` followed eventually by `"`) and walk
  // to its matching `}` honoring string escapes.
  const rawStart = findRawJsonObjectStart(text);
  if (rawStart === -1) return null;
  const rawEnd = findRawJsonObjectEnd(text, rawStart);
  if (rawEnd === -1) {
    return {
      start: rawStart,
      end: text.length,
      body: text.slice(rawStart).trim(),
      isClosed: false,
    };
  }
  return {
    start: rawStart,
    end: rawEnd + 1,
    body: text.slice(rawStart, rawEnd + 1).trim(),
    isClosed: true,
  };
}

/** Pulls the JSON body out of streamed markdown. Returns the trimmed
 *  body string for both fenced and raw formats, or null when no
 *  plausible JSON object has been seen yet. */
export function extractAgentJsonBlock(text: string): string | null {
  const span = findAgentJsonBlockSpan(text);
  return span ? span.body : null;
}

/** Returns the markdown before / after the JSON block so the surrounding
 *  prose can render around the structured card. Works for fenced and
 *  raw JSON identically. */
export function splitAroundAgentJsonBlock(text: string): {
  before: string;
  after: string;
} {
  const span = findAgentJsonBlockSpan(text);
  if (!span) return { before: text.trim(), after: "" };
  return {
    before: text.slice(0, span.start).trim(),
    after: span.isClosed ? text.slice(span.end).trim() : "",
  };
}

export function parsePartialAgentJson(text: string): PartialAgentData {
  const out: PartialAgentData = { isComplete: false };
  if (!text || !text.trim()) return out;

  const block = extractAgentJsonBlock(text);
  if (!block) return out;

  // Happy path — full JSON present + valid.
  try {
    const parsed = JSON.parse(block) as Record<string, unknown>;
    return normalizeAgentJson(parsed, true);
  } catch {
    /* not complete yet — fall through to progressive extraction */
  }

  // Progressive path — pull whichever fields are fully formed so far.
  out.name = readString(block, "name");
  out.description = readString(block, "description");
  out.agent_type = readString(block, "agent_type");
  out.model_id = readString(block, "model_id");
  out.category = readString(block, "category") ?? undefined;

  out.messages = readMessages(block);
  out.variable_definitions = readVariableDefinitions(block);
  out.context_slots = readContextSlots(block);

  out.settings = readJsonObject(block, "settings");
  out.output_schema = readJsonObject(block, "output_schema");
  out.model_tiers = readJsonObject(block, "model_tiers");

  out.tools = readJsonArray(block, "tools");
  out.custom_tools = readJsonArray(block, "custom_tools");
  out.mcp_servers = readJsonArray(block, "mcp_servers");
  out.tags = readJsonArray(block, "tags") as string[] | undefined;

  return out;
}

// ── Normalizer — maps the complete object onto the typed shape ──────────

/**
 * Normalize an ALREADY-PARSED agent object onto the typed `PartialAgentData`
 * shape. Use this when you hold a real object (e.g. the streaming JSON
 * tracker's extracted value) — never re-stringify it back into a fenced
 * block and re-parse, because a `messages[].content` string that itself
 * contains a ``` fence (an embedded output-schema example) will make the
 * fence scanner close the block early and truncate everything after the
 * first message. Going object → object skips all fence detection.
 */
export function normalizeAgentObject(
  raw: Record<string, unknown>,
): PartialAgentData {
  return normalizeAgentJson(raw, true);
}

function normalizeAgentJson(
  raw: Record<string, unknown>,
  isComplete: boolean,
): PartialAgentData {
  const name = typeof raw.name === "string" ? raw.name : undefined;
  const description =
    typeof raw.description === "string" ? raw.description : undefined;
  const agent_type =
    typeof raw.agent_type === "string" ? raw.agent_type : undefined;
  const model_id = typeof raw.model_id === "string" ? raw.model_id : undefined;
  const category = typeof raw.category === "string" ? raw.category : undefined;

  const messages = flattenMessages(raw.messages);
  const variable_definitions = normalizeVariableDefinitions(
    raw.variable_definitions ?? raw.variableDefaults ?? raw.variables,
  );
  const context_slots = normalizeContextSlots(raw.context_slots);
  const settings = isPlainObject(raw.settings) ? raw.settings : undefined;
  const output_schema = isPlainObject(raw.output_schema)
    ? raw.output_schema
    : undefined;
  const model_tiers = isPlainObject(raw.model_tiers)
    ? raw.model_tiers
    : undefined;

  const tools = Array.isArray(raw.tools) ? raw.tools : undefined;
  const custom_tools = Array.isArray(raw.custom_tools)
    ? raw.custom_tools
    : undefined;
  const mcp_servers = Array.isArray(raw.mcp_servers)
    ? raw.mcp_servers
    : undefined;
  const tags = Array.isArray(raw.tags)
    ? (raw.tags.filter((t): t is string => typeof t === "string") as string[])
    : undefined;

  return {
    name,
    description,
    agent_type,
    model_id,
    category,
    messages,
    variable_definitions,
    context_slots,
    settings,
    output_schema,
    model_tiers,
    tools,
    custom_tools,
    mcp_servers,
    tags,
    isComplete,
  };
}

function flattenMessages(
  raw: unknown,
): PartialAgentData["messages"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<PartialAgentData["messages"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    if (typeof role !== "string") continue;
    out.push({
      role,
      content: flattenContent((item as { content?: unknown }).content),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Agents return `content` as either a plain string or an array of
 *  `{type:"text", text:"…"}` parts. This collapses both to a plain string
 *  for rendering. */
export function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const text = (p as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  }
  return "";
}

function normalizeVariableDefinitions(
  raw: unknown,
): PartialAgentData["variable_definitions"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<PartialAgentData["variable_definitions"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.name !== "string") continue;
    out.push({
      name: r.name,
      defaultValue: r.defaultValue ?? r.default_value ?? r.default ?? undefined,
      helpText:
        typeof r.helpText === "string"
          ? r.helpText
          : typeof r.help_text === "string"
            ? r.help_text
            : typeof r.description === "string"
              ? r.description
              : undefined,
      required: typeof r.required === "boolean" ? r.required : undefined,
      customComponent: r.customComponent ?? r.custom_component ?? undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeContextSlots(
  raw: unknown,
): PartialAgentData["context_slots"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<PartialAgentData["context_slots"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.key !== "string") continue;
    out.push({
      key: r.key,
      type: typeof r.type === "string" ? r.type : undefined,
      label: typeof r.label === "string" ? r.label : undefined,
      description:
        typeof r.description === "string" ? r.description : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

// ── Progressive readers ────────────────────────────────────────────────

function readString(jsonText: string, key: string): string | undefined {
  const pattern = new RegExp(`"${escapeKey(key)}"\\s*:\\s*"`, "i");
  const start = pattern.exec(jsonText);
  if (!start) return undefined;
  let i = start.index + start[0].length;
  let value = "";
  let escaped = false;
  for (; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (escaped) {
      if (ch === "n") value += "\n";
      else if (ch === "t") value += "\t";
      else if (ch === "r") value += "\r";
      else value += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') return value;
    value += ch;
  }
  return value || undefined;
}

function readMessages(
  jsonText: string,
): PartialAgentData["messages"] | undefined {
  const array = sliceArray(jsonText, "messages");
  if (!array) return undefined;

  // Try full parse first — works when the array is closed.
  try {
    const parsed = JSON.parse("[" + array + "]");
    return flattenMessages(parsed);
  } catch {
    /* fall through */
  }

  // Walk objects one-by-one.
  const out: NonNullable<PartialAgentData["messages"]> = [];
  let i = 0;
  while (i < array.length) {
    if (array[i] !== "{") {
      i++;
      continue;
    }
    const end = findMatchingBrace(array, i);
    if (end === -1) {
      // incomplete trailing object — try to parse whatever role/content
      // we can see before bailing.
      const partial = array.slice(i);
      const role = readString(partial, "role");
      const rawContent = readRawContentField(partial);
      if (role) out.push({ role, content: rawContent ?? "" });
      break;
    }
    const chunk = array.slice(i, end + 1);
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj === "object" && typeof obj.role === "string") {
        out.push({ role: obj.role, content: flattenContent(obj.content) });
      }
    } catch {
      const role = readString(chunk, "role");
      const rawContent = readRawContentField(chunk);
      if (role) out.push({ role, content: rawContent ?? "" });
    }
    i = end + 1;
  }
  return out.length > 0 ? out : undefined;
}

/** Peek at `content`: string value or first text part of the array. */
function readRawContentField(chunk: string): string | undefined {
  const asString = readString(chunk, "content");
  if (asString !== undefined) return asString;
  // Array form — pluck the first "text" field we find after `"content"`.
  const arrayMatch = chunk.match(/"content"\s*:\s*\[/i);
  if (!arrayMatch) return undefined;
  const rest = chunk.slice(arrayMatch.index! + arrayMatch[0].length);
  return readString(rest, "text");
}

function readVariableDefinitions(
  jsonText: string,
): PartialAgentData["variable_definitions"] | undefined {
  const array =
    sliceArray(jsonText, "variable_definitions") ??
    sliceArray(jsonText, "variableDefaults") ??
    sliceArray(jsonText, "variables");
  if (!array) return undefined;

  try {
    const parsed = JSON.parse("[" + array + "]");
    return normalizeVariableDefinitions(parsed);
  } catch {
    /* continue */
  }

  const out: NonNullable<PartialAgentData["variable_definitions"]> = [];
  let i = 0;
  while (i < array.length) {
    if (array[i] !== "{") {
      i++;
      continue;
    }
    const end = findMatchingBrace(array, i);
    if (end === -1) {
      const partial = array.slice(i);
      const name = readString(partial, "name");
      if (name) out.push({ name });
      break;
    }
    const chunk = array.slice(i, end + 1);
    try {
      const obj = JSON.parse(chunk);
      const normalized = normalizeVariableDefinitions([obj]);
      if (normalized && normalized[0]) out.push(normalized[0]);
    } catch {
      const name = readString(chunk, "name");
      if (name) out.push({ name });
    }
    i = end + 1;
  }
  return out.length > 0 ? out : undefined;
}

function readContextSlots(
  jsonText: string,
): PartialAgentData["context_slots"] | undefined {
  const array = sliceArray(jsonText, "context_slots");
  if (!array) return undefined;
  try {
    const parsed = JSON.parse("[" + array + "]");
    return normalizeContextSlots(parsed);
  } catch {
    return undefined;
  }
}

function readJsonObject(
  jsonText: string,
  key: string,
): Record<string, unknown> | undefined {
  const body = sliceObject(jsonText, key);
  if (!body) return undefined;
  try {
    const parsed = JSON.parse("{" + body + "}");
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readJsonArray(jsonText: string, key: string): unknown[] | undefined {
  const body = sliceArray(jsonText, key);
  if (!body) return undefined;
  try {
    const parsed = JSON.parse("[" + body + "]");
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// ── Raw slicers (shared by all readers) ────────────────────────────────

function sliceArray(jsonText: string, key: string): string | null {
  return sliceBalanced(jsonText, key, "[", "]");
}

function sliceObject(jsonText: string, key: string): string | null {
  return sliceBalanced(jsonText, key, "{", "}");
}

function sliceBalanced(
  jsonText: string,
  key: string,
  open: "[" | "{",
  close: "]" | "}",
): string | null {
  const pattern = new RegExp(`"${escapeKey(key)}"\\s*:\\s*\\${open}`, "i");
  const match = pattern.exec(jsonText);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return jsonText.slice(start, i);
    }
  }
  // Incomplete — return what we have so callers can still extract partial
  // contents.
  return jsonText.slice(start);
}

function findMatchingBrace(s: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function escapeKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the index of the first `{` that plausibly starts a JSON object.
 *
 * We're scanning streamed text that may contain prose, `<reasoning>`-style
 * tags, or other braces (e.g. `${...}` in markdown). To avoid false
 * positives we require the `{` to be followed (after whitespace) by either
 * a `"` (a string key) or a `}` (an empty object). That rules out random
 * braces in surrounding prose while still firing on the first character
 * of a streaming agent JSON object.
 */
function findRawJsonObjectStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (j >= text.length) {
      // `{` at the streaming tail — accept it; the body will arrive shortly.
      return i;
    }
    if (text[j] === '"' || text[j] === "}") return i;
  }
  return -1;
}

/** Walk from an opening `{` to its balanced `}`. Returns -1 if the object
 *  is still open (mid-stream). */
function findRawJsonObjectEnd(text: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

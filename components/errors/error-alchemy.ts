/**
 * components/errors/error-alchemy.ts — THE payload every error render hands
 * the Alchemy Menu.
 *
 * An error on screen is the single highest-value thing a person copies for AI
 * (agent-copy MISSION: "errors first"). So every error render — the inline
 * `ErrorNotice`, a destructive `Alert`, the route and section boundaries, an
 * error toast — builds its Copy-for-AI payload HERE, never inline:
 *
 *   - the exact sentence the person saw (title + message), verbatim;
 *   - the structured error behind it (code, status, name, details, hint, a
 *     chunk-URL-free stack);
 *   - the operation that was attempted ("Save comment");
 *   - the records involved (type + id + label);
 *   - the surface the error sits in and its DECLARED values (route, params,
 *     selection…), read through the surface's Alchemy handle — or an honest
 *     note that the page has no surface registration;
 *   - the person's unsaved input, when there is any.
 *
 * Pure: no React, no DOM. `buildAgentPayload` (the package envelope) adds the
 * live url/route/copied-at on serialization.
 */
import {
  buildAgentPayload,
  type AgentPayloadEnvironment,
  type AgentPayloadInput,
} from "@ai-matrx/kit/content-transfer";

export interface ErrorAlchemyRecord {
  type: string;
  id: string;
  label?: string;
}

/** Where the error was rendered — a stable vocabulary for the payload. */
export type ErrorAlchemySource =
  | "inline"
  | "alert"
  | "toast"
  | "route-boundary"
  | "section-boundary"
  | "overlay-boundary";

export interface ErrorAlchemyInput {
  /** The sentence the person sees. Required — an error with no words is never honest. */
  message: string;
  /** The short heading above it ("Not saved", "Something went wrong"). */
  title?: string;
  /** The raw error behind the sentence — code/status/name/stack are read from it. */
  error?: unknown;
  /** Explicit code/status when the caller holds them outside `error`. */
  code?: string | number;
  status?: number;
  /** What the person was doing ("Save comment", "Load the study guide"). */
  operation?: string;
  /** Records the failed operation touched. */
  records?: readonly ErrorAlchemyRecord[];
  /** The person's input that did NOT land (a comment draft, a form's values). */
  unsavedInput?: unknown;
  /** Any further facts the render holds (retry count, field name…). */
  details?: Record<string, unknown>;
  source?: ErrorAlchemySource;
  /**
   * Structured errors the Error Inspector captured on this page just before
   * (see `matchCapturedErrors`). They carry what a rendered sentence drops:
   * the code, HTTP status, relation and request id.
   */
  captured?: readonly CapturedErrorLike[];
  /**
   * The table / RPC / endpoint names THIS render reads or writes. A captured
   * error is pinned as the cause only when its relation is one of these —
   * never because the sentence happens to contain a table's name.
   */
  calls?: readonly string[];
}

/** The fields of a `lib/diagnostics` captured error the payload uses. */
export interface CapturedErrorLike {
  source: string;
  lastAt: number;
  route: string;
  message: string;
  relation?: string;
  operation?: string;
  code?: string;
  status?: number;
  userMessage?: string;
  requestId?: string;
  details?: string;
  hint?: string;
}

const CAPTURE_WINDOW_MS = 120_000;

function overlaps(sentence: string, message: string): boolean {
  const a = sentence.toLowerCase();
  const b = message.toLowerCase().trim();
  if (!b) return false;
  return a.includes(b) || b.includes(a) || a.includes(b.slice(0, 40));
}

/**
 * The captures offered to a box: for each of its declared `calls`, the latest
 * failure of that call on this route — however old, however many other
 * requests failed after it (a five-slot recency window pushed the profile's own
 * 500 out; RC-B12 round 3) — then up to five other failures from the last two
 * minutes, newest first, as unmatched context. Which one caused the box is
 * decided by `calls` alone, never by words in its sentence.
 */
export function matchCapturedErrors(
  _sentence: string,
  route: string | null,
  captured: readonly CapturedErrorLike[],
  now: number = Date.now(),
  calls?: readonly string[],
): CapturedErrorLike[] {
  if (route === null) return [];
  const onRoute = captured.filter((c) => c.route === route).sort((a, b) => b.lastAt - a.lastAt);
  const own: CapturedErrorLike[] = [];
  for (const call of calls ?? []) {
    const latest = onRoute.find((c) => isOwnCall(c, [call]));
    if (latest && !own.includes(latest)) own.push(latest);
  }
  const others = onRoute
    .filter((c) => !own.includes(c) && now - c.lastAt <= CAPTURE_WINDOW_MS)
    .slice(0, 5);
  return [...own, ...others];
}

function isOwnCall(c: CapturedErrorLike, calls: readonly string[] | undefined): boolean {
  if (!calls || calls.length === 0 || !c.relation) return false;
  const relation = c.relation.toLowerCase();
  return calls.some((call) => {
    const name = call.toLowerCase();
    return relation === name || relation.endsWith(`.${name}`) || name.endsWith(`.${relation}`);
  });
}

function capturedFields(c: CapturedErrorLike): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      source: c.source,
      relation: c.relation,
      operation: c.operation,
      code: c.code,
      status: c.status,
      message: c.message,
      user_message: c.userMessage,
      request_id: c.requestId,
      details: c.details,
      hint: c.hint,
      at: new Date(c.lastAt).toISOString(),
    }).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
}

export interface ErrorSurfaceSnapshot {
  surfaceName: string | null;
  label: string | null;
  /**
   * live       — values read from the mounted surface at click time
   * captured   — values read from the mounted surface when the error appeared
   * route-only — the route maps to a surface, but no live provider is mounted
   * unregistered — no surface registration covers this page
   * error      — the surface refused to give its values (message in `note`)
   */
  status: "live" | "captured" | "route-only" | "unregistered" | "error";
  declared: readonly string[];
  values: Record<string, unknown> | null;
  note?: string;
}

export interface DescribedError {
  message?: string;
  name?: string;
  code?: string | number;
  status?: number;
  details?: string;
  hint?: string;
  digest?: string;
  stack?: string;
}

const STACK_CAP = 4000;

/** Strip minified Next.js chunk URLs from a stack trace — noise for AI models. */
export function cleanStackForAI(stack: string): string {
  return stack
    .split("\n")
    .map((line) =>
      line.replace(
        /\(https?:\/\/[^\s)]+\/_next\/static\/chunks\/([^:)]+)(?::[0-9]+)*\)/g,
        "(<chunk:$1>)",
      ),
    )
    .join("\n");
}

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Read every structured field an error can carry, whatever shape it arrived in. */
export function describeError(error: unknown): DescribedError {
  if (error == null) return {};
  if (typeof error === "string") return { message: error };
  if (typeof error !== "object") return { message: String(error) };
  const e = error as Record<string, unknown>;
  const out: DescribedError = {};
  const message = str(e.message);
  if (message) out.message = message;
  const name = str(e.name);
  if (name && name !== "Error") out.name = name;
  const code = str(e.code) ?? num(e.code);
  if (code !== undefined) out.code = code;
  const status = num(e.status) ?? num(e.statusCode);
  if (status !== undefined) out.status = status;
  const details =
    str(e.details) ??
    (e.details && typeof e.details === "object"
      ? safeJson(e.details)
      : undefined);
  if (details) out.details = details;
  const hint = str(e.hint);
  if (hint) out.hint = hint;
  const digest = str(e.digest);
  if (digest) out.digest = digest;
  const stack = str(e.stack);
  if (stack) {
    const clean = cleanStackForAI(stack);
    out.stack =
      clean.length > STACK_CAP
        ? `${clean.slice(0, STACK_CAP)}\n… [${clean.length - STACK_CAP} more characters omitted]`
        : clean;
  }
  return out;
}

function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Keep only what the surface DECLARES and allows out: undeclared keys, values
 * marked `exportable: false`, and secret/credential values never reach a
 * payload (the same boundary the Alchemy surface handle enforces).
 */
export function pickDeclaredSurfaceValues(
  scope: Record<string, unknown>,
  declared: ReadonlyArray<{
    name: string;
    sensitivity?: {
      exportable?: boolean;
      classification?: "ordinary" | "secret" | "credential";
    };
  }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const value of declared) {
    const sensitivity = value.sensitivity;
    if (sensitivity?.exportable === false) continue;
    if (sensitivity?.classification === "secret" || sensitivity?.classification === "credential") continue;
    if (!Object.hasOwn(scope, value.name)) continue;
    const v = scope[value.name];
    if (v === undefined) continue;
    out[value.name] = v;
  }
  return out;
}

const SURFACE_NOTES: Record<ErrorSurfaceSnapshot["status"], string | undefined> = {
  live: undefined,
  captured: "Values were read when the error appeared.",
  "route-only":
    "This route maps to the surface, but no live surface provider was mounted, so its values could not be read.",
  unregistered:
    "This page is not a registered surface, so it declares no page values. What it knows is its address: the url and route in <context> (the route and its parameters identify the record or step), plus the error, operation and records below. Pages that hold real state are registered surfaces; sign-in, public and demo pages deliberately are not.",
  error: undefined,
};

function surfaceBlock(surface: ErrorSurfaceSnapshot): Record<string, unknown> {
  const note = surface.note ?? SURFACE_NOTES[surface.status];
  return {
    name: surface.surfaceName,
    label: surface.label,
    status: surface.status,
    declared_values: [...surface.declared],
    values: surface.values,
    ...(note ? { note } : {}),
  };
}

function hasInput(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** The sentence the person saw, as plain text (the Copy action). */
export function buildErrorHumanText(input: ErrorAlchemyInput): string {
  const repeats =
    input.title && input.message.trim().toLowerCase().startsWith(input.title.trim().toLowerCase());
  const head = input.title && !repeats ? `${input.title}: ${input.message}` : input.message;
  return input.operation ? `${head}\nWhile: ${input.operation}` : head;
}

/** THE Copy-for-AI payload for an error on screen. */
export function buildErrorAlchemyPayload(
  input: ErrorAlchemyInput,
  surface: ErrorSurfaceSnapshot,
): AgentPayloadInput {
  const described = describeError(input.error);
  const own = (input.captured ?? []).filter((c) => isOwnCall(c, input.calls));
  const others = (input.captured ?? []).filter((c) => !isOwnCall(c, input.calls));
  const best = own[0];
  const code = input.code ?? described.code ?? best?.code;
  const status = input.status ?? described.status ?? best?.status;
  const error: DescribedError & { relation?: string; request_id?: string } = {
    ...(best?.relation ? { relation: best.relation } : {}),
    ...(best?.requestId ? { request_id: best.requestId } : {}),
    ...(best?.details && !described.details ? { details: best.details } : {}),
    ...(best?.hint && !described.hint ? { hint: best.hint } : {}),
    ...described,
    ...(code !== undefined ? { code } : {}),
    ...(status !== undefined ? { status } : {}),
  };
  const unsaved = hasInput(input.unsavedInput);
  const where = surface.label ?? surface.surfaceName ?? "this page";
  return {
    kind: "ui-error",
    location: `AI Matrx — ${where}`,
    description:
      "An error the person is looking at right now, with the operation that failed, the records involved, the page's declared surface values, and any input that was not saved.",
    summary: [
      buildErrorHumanText(input),
      unsaved ? "The person's input was NOT saved; it is included as unsaved_input." : null,
    ]
      .filter(Boolean)
      .join("\n"),
    data: {
      shown: {
        ...(input.title ? { title: input.title } : {}),
        message: input.message,
      },
      error,
      operation: input.operation ?? null,
      records: input.records ? [...input.records] : [],
      unsaved_input: unsaved ? input.unsavedInput : null,
      ...(input.details ? { details: input.details } : {}),
      ...(own.length > 0 ? { captured_errors: own.map(capturedFields) } : {}),
      ...(others.length > 0
        ? {
            recent_unmatched_errors: others.map(capturedFields),
            recent_unmatched_note:
              "Requests that failed on this page in the last two minutes. None is known to be this box's own call; any may be unrelated.",
          }
        : {}),
      surface: surfaceBlock(surface),
    },
    attributes: {
      source: input.source ?? "inline",
      code: code ?? null,
      status: status ?? null,
      surface: surface.surfaceName,
      records: input.records?.length ?? 0,
      has_unsaved_input: unsaved,
    },
  };
}

/** The "Error with fix request" variant: the faithful payload inside an instruction. */
export function buildErrorFixPrompt(
  input: ErrorAlchemyInput,
  surface: ErrorSurfaceSnapshot,
  environment?: AgentPayloadEnvironment,
): string {
  const payload = buildAgentPayload(
    buildErrorAlchemyPayload(input, surface),
    environment,
  );
  return [
    "I hit this error in AI Matrx. Diagnose the cause from the payload below, then tell me the fix — or, if the fix is in the code, say which file and what change.",
    input.unsavedInput != null
      ? "My unsaved input is included; do not lose it — say how I can keep it."
      : null,
    "",
    "<error_report>",
    payload,
    "</error_report>",
    "",
    "Reminder: diagnose from the exact error, code, operation and surface values above; do not guess past them.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

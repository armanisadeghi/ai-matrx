"use client";

/**
 * features/surfaces/runtime/surface-writeback.ts
 *
 * The surface WRITEBACK seam — how an agent result gets INTO the page.
 *
 * Surfaces have always been read-only: they emit declared values so agents
 * can see the page. This module is the write half. A surface's manifest
 * declares `writeTargets` (the fields/state agents may write); the page's
 * `SurfaceRuntimeProvider` registers one handler per target
 * (`getWriteHandlers`); and EVERY caller — a kind-component action button,
 * an automated envelope apply, chrome — lands the value through the ONE
 * function here:
 *
 *   applySurfaceWrite(target, value, opts?) → Promise<SurfaceWriteResult>
 *
 * Non-negotiables (mirrors the kind-action registry's safety posture):
 *  - NEVER throws. Every outcome is a `{ ok } | { ok:false, error }` envelope.
 *  - LOUD on contract breaks. A target nobody declared, a declared target
 *    with no live handler, or an unexpected handler failure toasts, captures
 *    a structured error, and returns a failure envelope. A handler may throw
 *    `SurfaceWriteRefusalError` for an expected domain refusal; that still
 *    reaches the caller as a refusal envelope but never pollutes diagnostics.
 *  - Deepest-wins resolution over the live provider stack: the open node
 *    panel's targets shadow the workspace's, but a workspace-level target
 *    still resolves while a panel is open (the walk continues outward).
 *  - Validation is manifest-driven: only names declared in the resolved
 *    surface's `writeTargets` are accepted, so a UI cannot accept a write it
 *    never declared, and a caller cannot invent one.
 *  - THE VALUE CONTRACT. A target declaring `valueKind` has its value checked
 *    against that registered kind's schema BEFORE approval and BEFORE the
 *    handler — for every origin. An unverifiable contract (kind unregistered,
 *    catalog unreachable) FAILS naming the reason; a skip is never a pass.
 *  - THE ORDER, for every write: anchored patch → declared valueType (a
 *    JSON-encoded string for an object/array target is parsed; a wrong type
 *    is refused) → valueKind contract → the handler's own `validate` →
 *    approval card (agent origin, `ask`) → the handler's `apply`. Everything
 *    before the card refuses WITHOUT asking the person; whatever `apply`
 *    returns as `{ summary?, data? }` rides back on the success result.
 */

import { contentIrKindValidator } from "@ai-matrx/chat/host/content-ir-slots";
import type {
  ApprovalPort,
  DiagnosticsPort,
  Json,
  KindValidatorPort,
} from "@ai-matrx/alchemy/ports";
import type {
  Receipt,
  WriteCaller,
  WriteDoor,
  WriteApplyRequest,
  WriteDoorDeclarations,
  WriteHandler,
  WriteHandlerResult,
} from "@ai-matrx/alchemy/operate";
import { getManifest } from "./registry";
import {
  BASELINE_SURFACE_NAME,
  isPlatformWriteTarget,
  PLATFORM_WRITE_TARGETS,
  type PlatformWriteTargetName,
} from "../manifests/_baseline.manifest";
import {
  isSurfaceWritePatch,
  resolveSurfaceWritePatch,
  type SurfaceWritePatch,
} from "./surface-write-patch";
import { captureError } from "../../host/diagnostics";
import {
  applyWindowFormChanges,
  hasWindowForms,
  labelWindowFormWrite,
  WINDOW_FORM_TARGET,
  WINDOW_FORM_TARGET_NAME,
} from "./window-forms";
import {
  readActiveOrganizationId,
  saveSurfaceFeedback,
  SURFACE_FEEDBACK_TARGET,
  SURFACE_FEEDBACK_TARGET_NAME,
  validateSurfaceFeedback,
} from "./surface-feedback";
import {
  applyCustomFieldsSetWrite,
  applyCustomFieldsWrite,
  CUSTOM_FIELDS_SET_TARGET_NAME,
  CUSTOM_FIELDS_TARGET_NAME,
  customFieldsSetTarget,
  customFieldsTarget,
  hasCustomFieldsDoors,
  hasCustomFieldsSetDoors,
  validateCustomFieldsSetWrite,
  validateCustomFieldsWrite,
} from "./custom-field-targets";
import { toast } from "../../host/notify";
import { awaitEffectiveOrganizationId } from "@ai-matrx/chat/host/ui-slots";

import type {
  SurfaceWritePolicy,
  SurfaceWriteTarget,
  WritePolicyMap,
} from "../types";
import {
  getGlobalSurfaceRegistry,
  getSurfaceRuntimeStack,
  type SurfaceRegistry,
  type SurfaceRuntimeValue,
  type SurfaceWriteAddress,
  type SurfaceWriteApply,
  type SurfaceWriteContext,
  type SurfaceWriteHandler,
  type SurfaceWriteHandlers,
  type SurfaceWriteOutcome,
} from "./SurfaceRuntimeContext";
import { leaseAgentWriteSource } from "./agent-write-sources";

export type { SurfaceWriteOutcome } from "./SurfaceRuntimeContext";

/**
 * Every handler that can service `surfaceName` right now: the provider's own
 * (`getWriteHandlers`) plus any a descendant registered by name
 * (`useSurfaceWriteHandlers`). Registered handlers win — the component that
 * registered one owns the state that target writes.
 */
function resolveHandlers(
  runtime: {
    surfaceName: string;
    getWriteHandlers?: () => SurfaceWriteHandlers;
  },
  registry: SurfaceRegistry,
): SurfaceWriteHandlers {
  return {
    ...(runtime.getWriteHandlers?.() ?? {}),
    ...registry.writeHandlers(runtime.surfaceName),
  };
}

/**
 * A handler entry split into its two phases. A plain function is `apply` with
 * no pre-approval `validate`. Null when the entry is not a usable handler (an
 * object with no `apply` function) — treated exactly like a missing handler.
 */
function splitHandler(
  entry: SurfaceWriteHandler | undefined,
  context: SurfaceWriteContext = {},
): {
  validate?: (value: unknown) => void | Promise<void>;
  apply: (value: unknown) => ReturnType<SurfaceWriteApply>;
  readCurrent?: () => Promise<string | null>;
} | null {
  // Every phase is bound to the write's ADDRESS (`opts.item`), so a target
  // over several open records reads, checks and changes the one named — never
  // whichever happens to be in focus when a phase runs.
  // An unaddressed write calls the handler exactly as before (value only).
  if (!entry) return null;
  if (!context.item) {
    if (typeof entry === "function") return { apply: (value) => entry(value) };
    if (typeof entry === "object" && typeof entry.apply === "function") {
      return {
        apply: (value) => entry.apply(value),
        ...(typeof entry.validate === "function"
          ? { validate: entry.validate }
          : {}),
        ...(typeof entry.readCurrent === "function"
          ? { readCurrent: () => entry.readCurrent!() }
          : {}),
      };
    }
    return null;
  }
  if (typeof entry === "function") return { apply: (value) => entry(value, context) };
  if (typeof entry === "object" && typeof entry.apply === "function") {
    const { apply, validate, readCurrent } = entry;
    return {
      apply: (value) => apply(value, context),
      ...(typeof validate === "function"
        ? { validate: (value: unknown) => validate(value, context) }
        : {}),
      ...(typeof readCurrent === "function"
        ? { readCurrent: () => readCurrent(context) }
        : {}),
    };
  }
  return null;
}

/**
 * A patchable target's value that is a JSON-ENCODED patch envelope, parsed; null
 * for anything else (plain text stays text). Only an object whose `command` is
 * a string AND that carries a patch field counts, so ordinary text that happens
 * to be JSON is never mistaken for an edit.
 */
function patchFromJsonString(
  target: SurfaceWriteTarget,
  value: unknown,
): SurfaceWritePatch | null {
  if (!target.patchable || typeof value !== "string") return null;
  const text = value.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isSurfaceWritePatch(parsed)) return null;
    const fields = parsed as unknown as Record<string, unknown>;
    return "old_str" in fields || "new_str" in fields ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The handler's own live reader of the text a target replaces, when it has
 * one (`SurfaceWriteHandlerEntry.readCurrent`) — a target whose read twin is a
 * reference rather than text. Null means "read the scope value as usual".
 */
function handlerTextReader(
  target: SurfaceWriteTarget,
  runtime: SurfaceRuntimeValue,
  registry: SurfaceRegistry,
  context: SurfaceWriteContext = {},
): (() => Promise<string | null>) | null {
  return splitHandler(resolveHandlers(runtime, registry)[target.name], context)?.readCurrent ?? null;
}

/**
 * Keep what a handler returned ONLY when it is deliberately an outcome
 * (`{ summary?, data? }` and nothing else). A plain handler's incidental
 * return value — a dispatched action, a promise of a row count — is not an
 * answer to forward to a model.
 */
function toWriteOutcome(returned: unknown): SurfaceWriteOutcome | undefined {
  if (!returned || typeof returned !== "object" || Array.isArray(returned)) {
    return undefined;
  }
  const keys = Object.keys(returned);
  if (keys.length === 0 || keys.some((k) => k !== "summary" && k !== "data")) {
    return undefined;
  }
  const candidate = returned as { summary?: unknown; data?: unknown };
  if (candidate.summary !== undefined && typeof candidate.summary !== "string") {
    return undefined;
  }
  const out: SurfaceWriteOutcome = {};
  if (typeof candidate.summary === "string" && candidate.summary.trim()) {
    out.summary = candidate.summary.trim();
  }
  if (candidate.data !== undefined) {
    try {
      JSON.stringify(candidate.data);
      out.data = candidate.data;
    } catch (error) {
      console.warn(
        "[surface-writeback] a write handler returned outcome.data that is not JSON-serializable; it was dropped.",
        error,
      );
    }
  }
  return out.summary !== undefined || out.data !== undefined ? out : undefined;
}

// ---------------------------------------------------------------------------
// The declared valueType, enforced (and a JSON-encoded string forgiven).
// ---------------------------------------------------------------------------

const EXCERPT_MAX = 160;

/** The JSON-ish type name of a value, as a model would say it. */
function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function withArticle(typeName: string): string {
  if (typeName === "null") return "null";
  return /^[aeiou]/.test(typeName) ? `an ${typeName}` : `a ${typeName}`;
}

/** A ≤160-char excerpt of what was received, for the refusal sentence. */
export function excerptOf(value: unknown): string {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text;
}

// ─── THE WRITE RECEIPT (see `SurfaceWriteChange`) ───────────────────────────

const RECEIPT_EXCERPT_MAX = 400;
/** A page read slower than this is reported as not read, never waited on. */
const BEFORE_READ_TIMEOUT_MS = 1500;

/** Sentinel: the page value was not (or could not be) read. */
const NOT_READ: unique symbol = Symbol("surface-write-before-not-read");
type BeforeRead = { value: unknown } | typeof NOT_READ;

function receiptExcerpt(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > RECEIPT_EXCERPT_MAX ? `${text.slice(0, RECEIPT_EXCERPT_MAX - 1)}…` : text;
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * The page value `target.updatesValue` names, read from the live page right
 * before the handler runs. A target without `updatesValue`, a failed read or a
 * slow one is NOT_READ — the receipt then omits "before" rather than guess.
 */
async function readPageValueBeforeWrite(
  target: SurfaceWriteTarget,
  runtime: SurfaceRuntimeValue,
  readCurrent?: (() => Promise<string | null>) | null,
): Promise<BeforeRead> {
  const key = target.updatesValue;
  if (!key) return NOT_READ;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (readCurrent) {
      const text = await Promise.race([
        readCurrent(),
        new Promise<typeof NOT_READ>((resolve) => {
          timer = setTimeout(() => resolve(NOT_READ), BEFORE_READ_TIMEOUT_MS);
        }),
      ]);
      return text === NOT_READ ? NOT_READ : { value: text };
    }
    const scope = await Promise.race([
      Promise.resolve(runtime.getScope()),
      new Promise<typeof NOT_READ>((resolve) => {
        timer = setTimeout(() => resolve(NOT_READ), BEFORE_READ_TIMEOUT_MS);
      }),
    ]);
    if (scope === NOT_READ || !scope || typeof scope !== "object") return NOT_READ;
    return { value: (scope as Record<string, unknown>)[key] };
  } catch (error) {
    console.warn(
      `[surface-writeback] could not read "${key}" before writing "${target.name}" — the receipt will omit "before"`,
      error,
    );
    return NOT_READ;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function writeReceipt(
  target: SurfaceWriteTarget,
  written: unknown,
  before: BeforeRead,
): SurfaceWriteChange {
  const read = before !== NOT_READ;
  return {
    ...(target.updatesValue ? { pageValue: target.updatesValue } : {}),
    ...(read ? { before: receiptExcerpt(before.value ?? null) } : {}),
    written: receiptExcerpt(written ?? null),
    ...(read && sameValue(before.value, written) ? { sameAsBefore: true as const } : {}),
    appliedAt: new Date().toISOString(),
  };
}

/** Strip one surrounding ``` / ```json fence, if the whole string is fenced. */
function stripJsonFence(text: string): string {
  const match = /^```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/.exec(
    text.trim(),
  );
  return match ? match[1].trim() : text.trim();
}

function matchesStructuredType(
  valueType: "object" | "array",
  value: unknown,
): boolean {
  return valueType === "array"
    ? Array.isArray(value)
    : typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * THE DECLARED TYPE, BOUND BEFORE ANYONE IS ASKED. For a target whose
 * `valueType` is `object` or `array`:
 *
 *  - a STRING that parses as JSON of that type (optionally inside a ```json
 *    fence) is parsed — smaller models routinely JSON-encode the value, and
 *    the tool schema cannot forbid it because other targets take strings;
 *  - anything else of the wrong JS type is refused with a sentence naming the
 *    expected type, the received type and an excerpt, so the model can
 *    correct itself.
 *
 * `null` passes through untouched: several handlers read it as "clear", and
 * the handler (or its `validate`) decides. Scalar targets are not coerced.
 */
export function coerceDeclaredValueType(
  target: Pick<SurfaceWriteTarget, "name" | "label" | "valueType">,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const valueType = target.valueType;
  if (valueType !== "object" && valueType !== "array") {
    return { ok: true, value };
  }
  if (value === null || value === undefined) return { ok: true, value };
  if (matchesStructuredType(valueType, value)) return { ok: true, value };

  const expected = valueType === "array" ? "a JSON array" : "a JSON object";
  let detail = "";
  if (typeof value === "string") {
    const body = stripJsonFence(value);
    try {
      const parsed: unknown = JSON.parse(body);
      if (matchesStructuredType(valueType, parsed)) {
        return { ok: true, value: parsed };
      }
      detail = ` (it parses as JSON, but as ${withArticle(jsonTypeOf(parsed))})`;
    } catch (error) {
      detail = ` that is not valid JSON (${error instanceof Error ? error.message : "parse failed"})`;
    }
  }
  const received = jsonTypeOf(value);
  return {
    ok: false,
    error:
      `"${target.label}" (${target.name}) expects \`value\` to be ${expected}, ` +
      `but received ${withArticle(received)}${detail}: ` +
      `${excerptOf(value)} — send the ${valueType} itself as \`value\`, not a JSON-encoded string. ` +
      `Nothing was changed and the user was not asked.`,
  };
}

/**
 * A value the platform refused BEFORE the approval card: the model's to fix,
 * not a platform defect — no toast, no capture (the tool result carries the
 * reason, and the run's tool lifecycle shows it on screen).
 */
function refuseBeforeApproval(
  message: string,
  raw: Record<string, unknown>,
): SurfaceWriteResult {
  console.warn(`[surface-writeback] refused before approval: ${message}`, raw);
  return { ok: false, refused: true, phase: "before_approval", error: message };
}

/**
 * THE WRITE RECEIPT — what one successful write changed, as the agent is told
 * it. Every success carries one.
 *
 * Why it exists (2026-09-27, /hr/settings/employer): each write landed exactly
 * once (version 1→2, fresh timestamps), yet the agent told the person the rows
 * "already existed" / the values "were already there". The resume after a
 * write re-reads the live page (ARE-010), so the page values the model gets
 * next ALREADY show its own write — with nothing saying they were read after
 * it. With only "applied and saved" to go on, the model concluded the values
 * had been there before. The receipt states the value the page held right
 * before the write, what was written, and when, so the model can tell its own
 * effect from a pre-existing value.
 */
export interface SurfaceWriteChange {
  /** The page value this target updates (the manifest's `updatesValue`), when declared. */
  pageValue?: string;
  /**
   * That page value as it stood immediately before the write (excerpt).
   * Absent when the target declares no `updatesValue` or the page could not
   * be read — never guessed.
   */
  before?: string;
  /** The value the write sent (excerpt). */
  written: string;
  /**
   * True only when the page ALREADY held exactly the written value — the one
   * case where "it was already there" is the truth, and the agent is told so.
   */
  sameAsBefore?: true;
  /** When the write was applied (ISO). */
  appliedAt: string;
}

/** The envelope every write returns. A skip/failure is never a silent pass. */
export type SurfaceWriteResult =
  | {
      ok: true;
      surfaceName: string;
      target: SurfaceWriteTarget;
      /**
       * What the handler reported landing (`SurfaceWriteOutcome`) — present
       * only when the handler returned one. Forwarded to the agent.
       */
      outcome?: SurfaceWriteOutcome;
      /** THE WRITE RECEIPT (see `SurfaceWriteChange`). Set on every success. */
      change?: SurfaceWriteChange;
      /** The one write door's receipt (Alchemy ALC-17). Set on every write to a manifest target. */
      receipt?: Receipt;
    }
  | {
      ok: false;
      error: string;
      /** The one write door's receipt, when the write reached the door. */
      receipt?: Receipt;
      /**
       * Where it stopped. `before_approval`: the value was refused by the type
       * check, the value contract or the handler's `validate` — the person
       * was never shown a card. `apply`: the handler itself failed (for an
       * `ask` target, AFTER the person approved).
       */
      phase?: "before_approval" | "apply";
      /**
       * The user was asked and said no. NOT a failure — nothing toasts,
       * nothing is captured. A caller that treats decline as an error trains
       * users to stop declining, which is the opposite of what the ask policy
       * is for. Optional on the single failure member so `if (!r.ok &&
       * r.declined)` actually narrows — a second `ok:false` member would make
       * the property unreachable.
       */
      declined?: true;
      /** The handler safely refused an invalid or stale domain request. */
      refused?: true;
      /**
       * NOTHING ON THIS PAGE CAN APPLY THIS WRITE — the surface that owns the
       * target is not mounted here (the user is on a different page), so there
       * is no handler to refuse it and no defect to capture. It is a
       * WRONG-PLACE outcome, not a broken one, and it needs its own flag
       * because the remedy is different from every other failure: go where the
       * write can land, or take a route that needs no surface.
       *
       * Wall W49 (2026-09-12): a Masterwork Conductor called
       * `apply_surface_write` from a plain `/chat/<id>` tab, which carries no
       * surface handlers. The seam failed correctly and said so only in a
       * toast that named no remedy — so the screen never told the user WHY
       * nothing happened or what to do about it.
       */
      unapplicable?: true;
      /** Optional replacement instruction the user sent instead of approving. */
      instructions?: string;
    };

/**
 * Who is driving this write.
 *
 * `"user"` (default) — a human interacted with a declared control. The click
 * IS the consent; the apply policy is not consulted.
 *
 * `"agent"` — model output is trying to change the page with no human in that
 * instant. This is the direction that needed a gate: `applyPolicy` decides
 * whether it is refused, asked, or applied.
 */
export type SurfaceWriteOrigin = "user" | "agent";

/**
 * An expected, user-correctable refusal from a mounted write handler.
 *
 * Use this for invalid coordinates, stale page state, source-policy mismatches,
 * or another domain guard that correctly prevents a write. Ordinary thrown
 * errors remain platform failures and are captured by the writeback seam.
 */
export class SurfaceWriteRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SurfaceWriteRefusalError";
  }
}

/** Refuse a write without reporting a platform defect. */
export function refuseSurfaceWrite(message: string): never {
  throw new SurfaceWriteRefusalError(message);
}

export interface ApplySurfaceWriteOptions {
  /**
   * Pin the write to one surface (`ui_surface.name`). Omitted = deepest
   * registered surface that DECLARES the target wins.
   */
  surfaceName?: string;
  /**
   * The registry the write resolves in. Omitted = the ONE global registry
   * (what is live on screen). A CAPTURE (`createSurfaceCapture`) — one board
   * tile's copy of a surface, dormant or not — is written through the same
   * seam with the same order, policy and approval card; the platform
   * targets (window forms, custom fields, feedback) belong to the screen, not
   * to a capture, and are not offered there.
   */
  source?: SurfaceRegistry;
  /**
   * Suppress the success toast (callers that show their own confirmation).
   * Failures always toast — loud recovery is not optional.
   */
  quiet?: boolean;
  /** Defaults to `"user"`. Pass `"agent"` for any write not driven by a click. */
  origin?: SurfaceWriteOrigin;
  /**
   * Shown in the ask dialog so the user knows WHO wants the change ("Keyword
   * strategist wants to…"). Ignored for user-origin writes.
   */
  actorLabel?: string;
  /**
   * Agent-tool callers provide the conversation's non-blocking approval card
   * bridge. The callback may remain pending indefinitely while the card is
   * minimized; only an explicit decision resumes this write.
   */
  requestApproval?: (
    proposal: SurfaceWriteApprovalProposal,
  ) => Promise<SurfaceWriteApprovalDecision>;
  /**
   * The agent run behind this write, when there is one. Only the platform
   * `surface_feedback` target reads these (filed as provenance on the row).
   */
  conversationId?: string;
  agentId?: string;
  /**
   * The record this write changes, for a target over several open records
   * (the canvas's tabs): the `resource_ref` the agent read it by. Every handler
   * phase receives it (`SurfaceWriteContext.item`). Omitted = the page's
   * default record (usually the one in focus).
   */
  item?: SurfaceWriteAddress;
}

/**
 * A `resource_ref`-shaped value (`{ resource_type, resource_id }`, as page
 * values carry it — or the camelCase form) as a write address; null for
 * anything else, so a malformed address is refused rather than ignored.
 */
export function readSurfaceWriteAddress(value: unknown): SurfaceWriteAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const resourceType = record.resource_type ?? record.resourceType;
  const resourceId = record.resource_id ?? record.resourceId;
  if (typeof resourceType !== "string" || !resourceType.trim()) return null;
  if (typeof resourceId !== "string" || !resourceId.trim()) return null;
  return { resourceType: resourceType.trim(), resourceId: resourceId.trim() };
}

export interface SurfaceWriteApprovalProposal {
  surfaceName: string;
  target: SurfaceWriteTarget;
  value: unknown;
  /** Live text captured from the target’s declared read twin, never model supplied. */
  currentValue?: string | null;
  actorLabel?: string;
  /**
   * Present when the agent sent an ANCHORED EDIT: the whole lines it touched,
   * before and after, cut from the live text by the seam (never model
   * supplied). The card diffs this instead of the whole value, so a one-word
   * edit is reviewed as one line.
   */
  patch?: { command: string; before: string; after: string };
}

export type SurfaceWriteApprovalDecision =
  | { kind: "approved" }
  | { kind: "declined"; instructions?: string }
  | { kind: "cancelled" };

// ---------------------------------------------------------------------------
// Per-run write-policy overrides — the BINDING's say over the surface default.
// ---------------------------------------------------------------------------

/**
 * The surface declares each target's DEFAULT policy
 * (`SurfaceWriteTarget.applyPolicy`); the binding (or shortcut — the same
 * system, one opinionated layer stronger) is where the USER controls it.
 * The launch path registers a run's merged `write_policies` here for the
 * run's lifetime; `applySurfaceWrite` consults the newest registration that
 * names the target, else the surface default.
 *
 * Deliberately additive-only in the safe direction to worry about: an
 * override can NEVER weaken `manual` → an agent write the surface refuses
 * stays refused unless the SURFACE itself declared the target `ask`/`auto`
 * or the override tightens it. (Loosening `manual` from a binding would let
 * any binding author grant agents a write the surface never opened.)
 */
interface WritePolicyRegistration {
  id: number;
  /** Replacement identity — a re-launch of the same (agent, surface) replaces
   * its prior registration instead of stacking forever. */
  key: string | null;
  /**
   * The surface the binding was FOR. Overrides apply only to targets resolved
   * on this surface — without this, two surfaces sharing a target NAME shared
   * each other's overrides (adversarial find D4, 2026-07-29).
   */
  surfaceName: string;
  policies: WritePolicyMap;
}

let nextPolicyRegId = 0;
let policyRegistrations: WritePolicyRegistration[] = [];

/**
 * Register a run's binding-resolved overrides. Returns unregister. Passing a
 * `key` (e.g. `"<agentId>::<surfaceName>"`) makes the registration
 * REPLACING: the same binding re-launched updates its policies in place
 * rather than accumulating one registration per run for the session.
 */
export function registerSurfaceWritePolicies(
  policies: WritePolicyMap,
  key: string | undefined,
  surfaceName: string,
): () => void {
  const id = ++nextPolicyRegId;
  // ALWAYS register, even with an empty map: an empty registration REPLACES a
  // stale keyed one, which is how "the user removed their overrides and
  // relaunched" actually takes effect (skipping empty maps left the removed
  // policy applying until reload).
  policyRegistrations = [
    ...policyRegistrations.filter((r) => !key || r.key !== key),
    { id, key: key ?? null, surfaceName, policies },
  ];
  return () => {
    policyRegistrations = policyRegistrations.filter((r) => r.id !== id);
  };
}

/** Effective policy for a target: newest override registered FOR the surface
 * the target resolved on that names it, else the surface default. */
function resolveApplyPolicy(
  target: SurfaceWriteTarget,
  surfaceName: string,
): SurfaceWritePolicy {
  const surfaceDefault = target.applyPolicy ?? "manual";
  for (let i = policyRegistrations.length - 1; i >= 0; i--) {
    if (policyRegistrations[i].surfaceName !== surfaceName) continue;
    const override = policyRegistrations[i].policies[target.name];
    if (!override) continue;
    // A binding may TIGHTEN (auto→ask→manual) freely; it may loosen only what
    // the surface opened (ask→auto). It can never open a manual target.
    if (surfaceDefault === "manual" && override !== "manual") return "manual";
    return override;
  }
  return surfaceDefault;
}

// ---------------------------------------------------------------------------
// THE ONE WRITE DOOR (Matrx Alchemy ALC-17)
// ---------------------------------------------------------------------------
//
// Every write to a manifest target lands through ONE `createWriteDoor` per app
// and comes back with a receipt. This seam keeps everything it does before a
// write (patch → declared type → value contract → the page's `validate`); the
// door then applies the target's EFFECTIVE policy (the surface default after
// the binding's overrides, `resolveApplyPolicy`) and calls the page's handler.
//
// A MOUNTED PAGE'S HANDLERS ARE LIVE ON THE DOOR FOR AS LONG AS IT IS MOUNTED
// (`routeMountedPages`): one route per (surface, target), registered when the
// page registers its write handlers and released when it unmounts. So an
// Action or a destination writing to an open page reaches that page's own
// handler, and with the page closed the door falls back to the headless
// handler or says `unapplicable`. A seam write is found on that same route by
// the `runId` it carries, so it runs this seam's own apply (rebase, re-check,
// receipt); any other write runs the page's handler with the door's value.
//
// AN APPROVAL BELONGS TO THE WRITE THAT ASKED FOR IT. Every seam write mints a
// run id (its conversation + a per-write number) and the door hands that id
// back on its approval request (`ApprovalRequest.runId`, alchemy 0.12.1), so
// the door's question is answered by exactly that write's own card — no
// matching by value, no queue per target. Two conversations writing the same
// value to the same target each get their own card, and a write from outside
// this seam is never answered by a seam write's card.
//
// THE VALUE CONTRACT IS THE DOOR'S (plan rule 10): a person's kind mismatch is
// applied with a warning and a fix; an agent's is refused with the reason,
// before any card. The seam only re-checks a value the door never saw — an
// agent's anchored edit rebased after approval.

/** Errors this seam already toasted and captured; the door must not capture them twice. */
const reportedErrors = new WeakSet<object>();

function reportedError(message: string): Error {
  const error = new Error(message);
  reportedErrors.add(error);
  return error;
}

function stableInput(value: unknown): string {
  try {
    return JSON.stringify(value ?? null) ?? "null";
  } catch {
    return String(value);
  }
}

function doorKey(surfaceName: string, targetName: string): string {
  return `${surfaceName}\u0000${targetName}`;
}

/** One seam write in flight on the door, found by the `runId` it carries. */
interface SeamWrite {
  conversationId: string | null;
  input: string;
  apply: () => Promise<WriteHandlerResult>;
  approve?: () => Promise<boolean>;
}

const seamWrites = new Map<string, SeamWrite>();

let writeSequence = 0;

function mintRunId(conversationId: string | null): string {
  writeSequence += 1;
  return `surface-write:${conversationId ?? "page"}:${writeSequence}`;
}

/**
 * The door's approvals port: answered by the approval flow of the seam write
 * whose run id the door names. No run id, no such write, an already-asked
 * write, or a different value (a sanity check, never the match) means nobody
 * here can approve — said so, never a silent "no".
 */
export const surfaceWriteApprovals: ApprovalPort = {
  async ask(request) {
    const write = request.runId ? seamWrites.get(request.runId) : undefined;
    const approve = write?.approve;
    if (!write || !approve || write.input !== stableInput(request.input)) {
      throw new Error(
        `No one is here to approve "${request.label}". Ask for it again from the conversation or page that should approve it.`,
      );
    }
    write.approve = undefined;
    return approve();
  },
};

const surfaceWriteDiagnostics: DiagnosticsPort = {
  capture(error, context) {
    if (error && typeof error === "object" && reportedErrors.has(error)) return;
    const message = error instanceof Error ? error.message : String(error);
    captureError({
      source: "surface-writeback",
      message: `[write-door:${context.area}] ${message}`,
      raw: { area: context.area, detail: context.detail },
    });
  },
};

const surfaceWriteKinds: KindValidatorPort = {
  async validate(kindKey, value) {
    const verdict = await contentIrKindValidator().validate(value, kindKey);
    if (!verdict.checked) {
      return {
        ok: false,
        unverifiable: true,
        sentence: `The "${kindKey}" contract could not be checked (${verdict.degradedReason}): ${verdict.errors[0] ?? "no detail"}`,
        remedy: "Check the connection, then try again.",
      };
    }
    if (!verdict.ok) {
      return {
        ok: false,
        sentence: `This value isn't shaped like the "${kindKey}" kind: ${verdict.errors.join("; ")}`,
        remedy: `Correct the value so it matches the "${kindKey}" kind, then try again.`,
      };
    }
    return { ok: true };
  },
};

/**
 * The declarations the door reads: every manifest, with each target's
 * EFFECTIVE policy, plus the BASELINE surface (`BASELINE_SURFACE_NAME`), which
 * declares the platform's own targets (`PLATFORM_WRITE_TARGETS`). The only
 * ancestry is the baseline: a resolved manifest already carries what it
 * inherits from its parents, so a surface's own target resolves on the surface
 * that is writing, and a platform target on the baseline every surface sits on.
 */
export const surfaceWriteDeclarations: WriteDoorDeclarations = {
  get(surfaceName) {
    if (surfaceName === BASELINE_SURFACE_NAME) {
      return { writeTargets: Object.values(PLATFORM_WRITE_TARGETS) };
    }
    const manifest = getManifest(surfaceName);
    if (!manifest) return undefined;
    return {
      writeTargets: (manifest.writeTargets ?? []).map((target) => ({
        ...target,
        applyPolicy: resolveApplyPolicy(target, surfaceName),
      })),
      ...(manifest.itemTypes ? { itemTypes: manifest.itemTypes } : {}),
    };
  },
  ancestry(surfaceName) {
    return surfaceName === BASELINE_SURFACE_NAME ? [] : [BASELINE_SURFACE_NAME];
  },
};

let surfaceDoor: Promise<WriteDoor> | null = null;

/**
 * THE app's one write door. Loaded on the first write (the operate engine is
 * not in every page's bundle); every caller — this seam, the host's Actions
 * and destinations — gets the same instance.
 */
export function loadSurfaceWriteDoor(): Promise<WriteDoor> {
  if (!surfaceDoor) {
    const loading = import("@ai-matrx/alchemy/operate").then(({ createWriteDoor }) =>
      createWriteDoor({
        ports: {
          diagnostics: surfaceWriteDiagnostics,
          kinds: surfaceWriteKinds,
          approvals: surfaceWriteApprovals,
        },
        declarations: surfaceWriteDeclarations,
      }),
    ).then((door) => {
      routeMountedPages(door);
      registerPlatformHandlers(door);
      return door;
    });
    surfaceDoor = loading;
    loading.catch(() => {
      if (surfaceDoor === loading) surfaceDoor = null;
    });
  }
  return surfaceDoor;
}

// ── The mounted pages' routes on the door ───────────────────────────────────

interface PageRoute {
  release: () => void;
  /** A mounted page on the global registry handles this target. */
  mounted: boolean;
  /** Seam writes holding the route open (a dormant copy's write). */
  holds: number;
}

const pageRoutes = new Map<string, PageRoute>();
let routedDoor: WriteDoor | null = null;

function releaseIfUnused(key: string, route: PageRoute): void {
  if (route.mounted || route.holds > 0) return;
  route.release();
  pageRoutes.delete(key);
}

function openRoute(door: WriteDoor, surfaceName: string, targetName: string): PageRoute {
  const key = doorKey(surfaceName, targetName);
  let route = pageRoutes.get(key);
  if (!route) {
    route = {
      release: door.registerLive(surfaceName, targetName, routePageWrite),
      mounted: false,
      holds: 0,
    };
    pageRoutes.set(key, route);
  }
  return route;
}

/** Every (surface, target) a mounted page handles right now has exactly one live route. */
function syncMountedRoutes(door: WriteDoor): void {
  const registry = getGlobalSurfaceRegistry();
  const handled = new Map<string, { surfaceName: string; targetName: string }>();
  for (const runtime of registry.stack()) {
    let handlers: SurfaceWriteHandlers;
    try {
      handlers = resolveHandlers(runtime, registry);
    } catch (error) {
      captureError({
        source: "surface-writeback",
        message: `[write-door:routes] ${runtime.surfaceName} could not list its write handlers: ${error instanceof Error ? error.message : String(error)}`,
        raw: { surfaceName: runtime.surfaceName },
      });
      continue;
    }
    for (const targetName of Object.keys(handlers)) {
      if (!splitHandler(handlers[targetName])) continue;
      handled.set(doorKey(runtime.surfaceName, targetName), { surfaceName: runtime.surfaceName, targetName });
    }
  }
  for (const { surfaceName, targetName } of handled.values()) {
    openRoute(door, surfaceName, targetName).mounted = true;
  }
  for (const [key, route] of [...pageRoutes]) {
    if (handled.has(key)) continue;
    route.mounted = false;
    releaseIfUnused(key, route);
  }
}

function routeMountedPages(door: WriteDoor): void {
  if (routedDoor === door) return;
  routedDoor = door;
  syncMountedRoutes(door);
  getGlobalSurfaceRegistry().subscribe(() => {
    if (routedDoor === door) syncMountedRoutes(door);
  });
}

/** The ONE live handler every route registers: a seam write by its run id, else the mounted page (or the platform's handler). */
const routePageWrite: WriteHandler = (request) => {
  const seam = request.runId ? seamWrites.get(request.runId) : undefined;
  if (seam) return seam.apply();
  if (isPlatformWriteTarget(request.target.name)) return applyPlatformHeadless(request);
  return applyMountedPageWrite(request);
};

/**
 * A write that did not come through this seam (an Action, a destination, a
 * menu): the door has already checked its type, its kind and its policy, so
 * the mounted page's own handler checks (`validate`) and applies the value.
 */
async function applyMountedPageWrite(request: WriteApplyRequest): Promise<WriteHandlerResult> {
  const label = request.target.label || request.target.name;
  if (request.ops) {
    throw new Error(`"${label}" takes a whole value on ${request.surfaceName}; send the finished text instead of edits.`);
  }
  if (request.item) {
    throw new Error(`"${label}" for one ${request.item.itemType} is applied from the page's own conversation; ask for it there.`);
  }
  const registry = getGlobalSurfaceRegistry();
  const runtime = registry.stack().find((entry) => entry.surfaceName === request.surfaceName);
  const handler = runtime ? splitHandler(resolveHandlers(runtime, registry)[request.target.name]) : null;
  if (!handler) {
    throw new Error(`"${label}" can only be saved with ${request.surfaceName} open, and it is no longer open.`);
  }
  if (handler.validate) await handler.validate(request.value);
  const outcome = toWriteOutcome(await handler.apply(request.value));
  return {
    status: "applied",
    ...(outcome?.summary ? { sentence: outcome.summary } : {}),
    // What the page's handler produced (ids of created records) rides the receipt (alchemy 0.12.3).
    ...(outcome?.data !== undefined ? { result: outcome.data as Json } : {}),
  };
}

/** One seam write through the door, carrying its own run id end to end. */
async function writeThroughDoor(
  request: { surfaceName: string; target: string; value: unknown; by: WriteCaller },
  conversationId: string | null,
  apply: () => Promise<WriteHandlerResult>,
  approve?: () => Promise<boolean>,
): Promise<Receipt> {
  const door = await loadSurfaceWriteDoor();
  const key = doorKey(request.surfaceName, request.target);
  const runId = mintRunId(conversationId);
  const write: SeamWrite = {
    conversationId,
    input: stableInput(request.value),
    apply,
    ...(approve ? { approve } : {}),
  };
  seamWrites.set(runId, write);
  // A write from a dormant copy (a board tile's capture) has no mounted route
  // of its own; it holds one open for exactly its own write.
  const route = openRoute(door, request.surfaceName, request.target);
  route.holds += 1;
  try {
    return await door.write({ ...request, runId });
  } finally {
    seamWrites.delete(runId);
    route.holds -= 1;
    releaseIfUnused(key, route);
  }
}

/** Neither a success nor a defect — the user declined. Silent by design. */
function declined(
  target: SurfaceWriteTarget,
  instructions?: string,
): SurfaceWriteResult {
  return {
    ok: false,
    declined: true,
    error: `The person chose to keep it as it was: "${target.label}" was not written.`,
    ...(instructions ? { instructions } : {}),
  };
}

/**
 * What an approved write needs at the moment it applies: the anchored edit to
 * re-resolve against the live text, and — filled in by `agentWriteAllowed` —
 * the live runtime and the (possibly rebased) value to hand the handler.
 */
interface ApprovedWriteAtApply {
  resolvePatch?: (
    runtime: SurfaceRuntimeValue,
  ) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  runtime?: SurfaceRuntimeValue;
  value?: string;
}

/** The registered runtime for the same surface: the original object when it is
 * still registered, else the surface's current registration (deepest first). */
function liveRuntimeFor(
  registry: SurfaceRegistry,
  runtime: SurfaceRuntimeValue,
): SurfaceRuntimeValue | null {
  const stack = registry.stack();
  if (stack.includes(runtime)) return runtime;
  return stack.find((entry) => entry.surfaceName === runtime.surfaceName) ?? null;
}

/**
 * ONE TARGET, ONE WRITE AT A TIME, PER CONVERSATION.
 *
 * A model may emit several writes to the same target in one turn, in parallel
 * (two str_replace edits to one note, 2026-10-02). Presented together, every
 * card snapshots the same original, and whichever is applied first makes the
 * rest stale. Queued, each write is resolved, shown and applied against the
 * text as the previous one left it. Keyed by conversation so a card left open
 * in one chat never holds another chat's writes.
 */
const targetWriteQueues = new Map<string, Promise<unknown>>();

function inTargetQueue<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = targetWriteQueues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  targetWriteQueues.set(key, settled);
  void settled.then(() => {
    if (targetWriteQueues.get(key) === settled) targetWriteQueues.delete(key);
  });
  return next;
}

/** Longest wait for the page to show a write before the next queued write
 * reads it. A React editor re-renders within a frame or two. */
const WRITE_SETTLE_TIMEOUT_MS = 1000;
const WRITE_SETTLE_POLL_MS = 16;

/**
 * Wait until the live text source reads the value just written, so the next
 * queued write never resolves its edit against the pre-write text (which
 * would silently undo this one). Bounded; a page that transforms the value on
 * write simply runs out the clock and the next write rebases at approval.
 */
async function awaitPageShows(
  registry: SurfaceRegistry,
  runtime: SurfaceRuntimeValue,
  sourceName: string,
  value: string,
): Promise<void> {
  const deadline = Date.now() + WRITE_SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const live = liveRuntimeFor(registry, runtime);
    if (!live) return;
    try {
      const scope = await live.getScope();
      const current = scope[sourceName];
      if (typeof current !== "string" || current === value) return;
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WRITE_SETTLE_POLL_MS));
  }
}

/**
 * Decide whether an agent-originated write may proceed. User-origin writes
 * never reach here.
 *
 * Returns `true` to apply, or the exact `SurfaceWriteResult` to hand back. A
 * `manual` refusal is LOUD — an agent attempting a write the surface never
 * opened up is a real contract break the author needs to see. A DECLINE is
 * silent: the user answered, and that is not a defect.
 */
async function agentWriteAllowed(
  target: SurfaceWriteTarget,
  surfaceName: string,
  actorLabel: string | undefined,
  value: unknown,
  requestApproval: ApplySurfaceWriteOptions["requestApproval"],
  runtime: SurfaceRuntimeValue,
  registry: SurfaceRegistry = getGlobalSurfaceRegistry(),
  patch?: SurfaceWriteApprovalProposal["patch"],
  atApply?: ApprovedWriteAtApply,
  context: SurfaceWriteContext = {},
): Promise<SurfaceWriteResult | true> {
  const policy = resolveApplyPolicy(target, surfaceName);
  if (policy === "auto") return true;
  if (policy === "manual") {
    // Return `fail`'s OWN result so the toast the user sees and the error the
    // caller reports are the same sentence.
    return fail(
      `"${target.label}" is not agent-writable on this surface (applyPolicy: manual). A person has to make this change.`,
      { targetName: target.name, surfaceName, policy },
    );
  }
  if (!requestApproval) {
    return fail(
      `"${target.label}" requires approval, but this agent write has no inline approval surface.`,
      { targetName: target.name, surfaceName, policy },
    );
  }
  // Read the owning live surface, not the agent's potentially stale context.
  // Append targets carry a fragment, not the replacement document.
  const originalName = target.comparisonValue ?? target.updatesValue;
  const originalDefinition = getManifest(surfaceName)?.values?.find(
    (entry) => entry.name === originalName,
  );
  // A string input can be an operation ON a structured record (add_note,
  // end_employment, etc.). Only an exact text read twin is a replacement.
  // THE CLASS FIX: replacement is the DEFAULT for a string written into a
  // string twin, so a target never ships an approval with no "before" just
  // because its manifest forgot a flag (the notes editor did, 2026-09-30 —
  // the person was asked to Apply a whole-note rewrite with no diff). Only an
  // explicit declaration makes the original REQUIRED; the default degrades to
  // the plain proposal when the live surface cannot supply it.
  const declaredComparison = target.approvalComparison === "text-replacement";
  const compareText =
    originalName !== undefined &&
    (originalDefinition?.valueType === "string" ||
      originalDefinition?.valueType === "document" ||
      handlerTextReader(target, runtime, registry, context) !== null) &&
    typeof value === "string" &&
    !/^(append|insert)/.test(target.name);
  let currentValue: string | null | undefined;
  async function readCurrentText(
    from: SurfaceRuntimeValue = runtime,
  ): Promise<string | null> {
    if (!originalName)
      throw new Error("The original text source is not declared.");
    const reader = handlerTextReader(target, from, registry, context);
    if (reader) return reader();
    const scope = await from.getScope();
    const current = scope[originalName];
    if (current !== null && typeof current !== "string") {
      throw new Error(
        `The current text for "${target.label}" is unavailable. Reopen the editor and request the change again.`,
      );
    }
    return current;
  }
  // False once an undeclared (default) comparison could not read its original.
  let comparing = compareText;
  if (compareText) {
    try {
      currentValue = await readCurrentText();
    } catch (error) {
      if (declaredComparison) {
        return fail(
          error instanceof Error
            ? error.message
            : "Could not read the original text for comparison.",
          { targetName: target.name, surfaceName, error },
        );
      }
      comparing = false;
    }
  }
  const decision = await requestApproval({
    surfaceName,
    target,
    value,
    actorLabel,
    ...(currentValue !== undefined ? { currentValue } : {}),
    ...(patch ? { patch } : {}),
  });
  if (decision.kind === "approved") {
    const changedMessage = `"${target.label}" changed while you were reviewing it. Nothing was applied. Request the change again to review an updated comparison.`;
    // THE SAME SURFACE, NOT THE SAME OBJECT. A provider re-registers on any
    // identity change (a parent re-render, a board tile remounting) and gets
    // a new runtime object; comparing by identity refused every open card
    // with the "changed" sentence although nothing had changed (2026-10-02).
    const live = liveRuntimeFor(registry, runtime);
    if (live && atApply) atApply.runtime = live;
    // Only a write that must re-read the page needs the page still open; a
    // platform target with no surface (window forms, custom fields) does not.
    if (!live && (comparing || atApply?.resolvePatch)) {
      const message = `"${target.label}" is no longer open here. Nothing was applied. Reopen it and request the change again.`;
      toast.error(message);
      return { ok: false, refused: true, error: message };
    }
    // AN ANCHORED EDIT IS RESOLVED AGAINST THE TEXT AT THE MOMENT IT APPLIES.
    // A sibling edit that landed first (two str_replace calls on different
    // lines in one turn) does not make this one stale: if its old text still
    // matches exactly once, it is rebased onto the current text. Only an edit
    // that truly no longer fits is refused.
    if (live && atApply?.resolvePatch) {
      const rebased = await atApply.resolvePatch(live);
      if (!rebased.ok) {
        toast.error(changedMessage);
        return {
          ok: false,
          refused: true,
          error: `${changedMessage} (${rebased.error})`,
        };
      }
      atApply.value = rebased.value;
      return true;
    }
    if (live && comparing) {
      try {
        if ((await readCurrentText(live)) !== currentValue) {
          toast.error(changedMessage);
          return { ok: false, refused: true, error: changedMessage };
        }
      } catch (error) {
        return fail(
          error instanceof Error
            ? error.message
            : "Could not verify the original text before applying.",
          { targetName: target.name, surfaceName, error },
        );
      }
    }
    return true;
  }
  return declined(
    target,
    decision.kind === "declined" ? decision.instructions : undefined,
  );
}

/**
 * THE VALUE CONTRACT for a value the door never saw.
 *
 * The door checks every write's declared `valueKind` (plan rule 10: a
 * person's mismatch applies with a warning and a fix, an agent's is refused
 * before any card). This re-check covers only what reaches the handler after
 * the door's check: an agent's anchored edit rebased onto the live text after
 * approval, which is agent-origin, so a mismatch is refused.
 *
 * A SKIP IS NEVER A PASS. `kindValidator.validate` (`@ai-matrx/content-ir`'s
 * `createKindValidator` over the app's `SchemaSourcePort`) reports `checked:false` when
 * the kind is not registered, has no schema, has an uncompilable schema, or
 * the catalog is unreachable. None of those mean "fine" — they mean the
 * platform cannot tell, which for a write into the user's page is a failure
 * naming the degraded reason, not a silent pass-through.
 */
async function valueContractHolds(
  target: SurfaceWriteTarget,
  surfaceName: string,
  value: unknown,
): Promise<SurfaceWriteResult | true> {
  const kind = target.valueKind;
  if (!kind) return true;

  const verdict = await contentIrKindValidator().validate(value, kind);

  if (!verdict.checked) {
    return fail(
      `"${target.label}" declares the value contract "${kind}", but that contract could not be checked (${verdict.degradedReason}): ${verdict.errors[0] ?? "no detail"}. The write was refused — an unverifiable contract is not an approved one.`,
      {
        targetName: target.name,
        surfaceName,
        valueKind: kind,
        degradedReason: verdict.degradedReason,
      },
    );
  }

  if (!verdict.ok) {
    return fail(
      `"${target.label}" expects a value shaped like the "${kind}" kind, and this one isn't: ${verdict.errors.join("; ")}`,
      {
        targetName: target.name,
        surfaceName,
        valueKind: kind,
        errors: verdict.errors,
      },
    );
  }

  return true;
}

function findDeclaredTarget(
  surfaceName: string,
  targetName: string,
): SurfaceWriteTarget | null {
  const manifest = getManifest(surfaceName);
  return (
    manifest?.writeTargets?.find((entry) => entry.name === targetName) ?? null
  );
}

function fail(
  message: string,
  raw: Record<string, unknown>,
): SurfaceWriteResult {
  toast.error(message);
  captureError({
    source: "surface-writeback",
    message: `[surface-writeback] ${message}`,
    raw,
  });
  return { ok: false, error: message };
}

/**
 * An anchored edit could not be placed in the current text.
 *
 * Loud to the caller, quiet in the repair queue — like `failUnapplicable` and
 * for the same reason. A missed anchor is almost always a stale read or an
 * ambiguous pattern, which is the seam WORKING: it declined to guess where a
 * change belonged. The one thing it must never be is silent, because a patch
 * that quietly changed nothing reads exactly like a patch that worked.
 */
function failPatch(
  message: string,
  raw: Record<string, unknown>,
): SurfaceWriteResult {
  toast.error("That edit didn't fit the current text", {
    description: message,
  });
  console.warn(`[surface-writeback] ${message}`, raw);
  return { ok: false, error: message };
}

/**
 * The page the user is looking at cannot apply this write at all.
 *
 * Loud on screen WITH the remedy (the user is the only one who can move to a
 * page that can apply it), but deliberately NOT `captureError`: no code is
 * broken. Treating "you are on the wrong page" as a platform defect fills the
 * repair queue with user navigation and trains everyone to ignore it.
 */
function failUnapplicable(
  message: string,
  raw: Record<string, unknown>,
): SurfaceWriteResult {
  toast.error("This page can't apply that change", { description: message });
  console.warn(`[surface-writeback] ${message}`, raw);
  return { ok: false, error: message, unapplicable: true };
}

/**
 * The one sentence a caller — human or model — gets when nothing on screen can
 * receive the write. It states the fact, then BOTH honest ways forward, so the
 * model can act on it instead of guessing (W49).
 */
/** What a mounted host says about reaching the items it holds (`SurfaceManifest.otherItemsHint`). */
function otherItemsHintSentence(surfaceNames: readonly string[]): string {
  const hints: string[] = [];
  for (const name of surfaceNames) {
    const hint = getManifest(name)?.otherItemsHint;
    if (hint && !hints.includes(hint)) hints.push(hint);
  }
  return hints.length > 0 ? ` ${hints.join(" ")}` : "";
}

function unapplicableMessage(targetName: string, detail: string): string {
  return (
    `${detail} No page open right now can apply "${targetName}", so nothing ` +
    `was written and nothing was changed. Open the page that owns this ` +
    `write — for a Rulebook that is the Rulebook's own workspace or its ` +
    `conduct page — and ask again there, or ask for a route that does not ` +
    `need that page.`
  );
}

/**
 * Apply one value to one declared write target on the live page.
 * See the module header for resolution + safety semantics.
 */
/**
 * Turn an anchored edit into the whole value the rest of the seam expects.
 *
 * Everything this needs is already declared: `patchable` says the target
 * accepts an edit, `updatesValue` says which SurfaceValue holds the text to
 * edit, and the live runtime scope holds its current contents. Reading the
 * LIVE scope (never the agent's context copy, which can be a minute stale) is
 * what makes an anchor trustworthy — if the user typed in the editor since
 * the agent last read the prompt, a stale anchor now misses and refuses
 * instead of silently overwriting their sentence.
 */
async function resolveTargetPatch(
  target: SurfaceWriteTarget,
  runtime: SurfaceRuntimeValue,
  patch: SurfaceWritePatch,
  registry: SurfaceRegistry = getGlobalSurfaceRegistry(),
  context: SurfaceWriteContext = {},
): Promise<
  | { ok: true; value: string; excerpt: { before: string; after: string } | null }
  | { ok: false; error: string }
> {
  if (!target.patchable) {
    return {
      ok: false,
      error:
        `"${target.label}" does not take an anchored edit — send the whole ` +
        `value for this target instead.`,
    };
  }
  // THE TEXT, not the read twin: when `updatesValue` names a reference (the
  // notes editor's `current_note` is a resource_ref object) the live text is
  // `comparisonValue` (`content`) — the same source the approval diff reads.
  // Anchoring into the reference refused every note patch (2026-10-01).
  const sourceName = target.comparisonValue ?? target.updatesValue;
  if (!sourceName) {
    // Manifest defect, not a caller mistake. Say so in those words so the
    // report names the repo and not the person typing.
    return {
      ok: false,
      error:
        `"${target.label}" is marked patchable but declares no updatesValue, ` +
        `so there is no current text to edit. This is a defect in the ` +
        `${runtime.surfaceName} manifest.`,
    };
  }
  let current: unknown;
  try {
    const reader = handlerTextReader(target, runtime, registry, context);
    if (reader) {
      current = await reader();
    } else {
      const scope = await runtime.getScope();
      current = scope[sourceName];
    }
  } catch (error) {
    return {
      ok: false,
      error:
        `Could not read the current "${target.label}" to edit it. Reopen the ` +
        `editor and try again.` +
        (error instanceof Error ? ` (${error.message})` : ""),
    };
  }
  const outcome = resolveSurfaceWritePatch(current, patch);
  if (!outcome.ok) {
    return {
      ok: false,
      error: `"${target.label}": ${outcome.reason}`,
    };
  }
  return { ok: true, value: outcome.next, excerpt: outcome.excerpt };
}

export async function applySurfaceWrite(
  targetName: string,
  rawValue: unknown,
  opts?: ApplySurfaceWriteOptions,
): Promise<SurfaceWriteResult> {
  // Agent writes to one target from one conversation run one at a time (see
  // `inTargetQueue`). User-origin writes are the person's own action — never
  // held behind an open card.
  if ((opts?.origin ?? "user") === "agent") {
    return inTargetQueue(`${opts?.conversationId ?? ""}::${targetName}`, () =>
      applySurfaceWriteNow(targetName, rawValue, opts),
    );
  }
  return applySurfaceWriteNow(targetName, rawValue, opts);
}

async function applySurfaceWriteNow(
  targetName: string,
  rawValue: unknown,
  opts?: ApplySurfaceWriteOptions,
): Promise<SurfaceWriteResult> {
  const registry = opts?.source ?? getGlobalSurfaceRegistry();
  const onScreen = registry.kind === "global";
  // The platform targets (declared on the baseline every surface inherits)
  // belong to the SCREEN, never to a capture; they land through the door too.
  if (onScreen && isPlatformWriteTarget(targetName)) {
    return applyPlatformWrite(targetName, rawValue, opts);
  }
  const stack = registry.stack().filter(
    (entry) => !opts?.surfaceName || entry.surfaceName === opts.surfaceName,
  );

  // A COPY THE AGENT WAS HANDED (a board item it opened) takes its write even
  // after another tile became the live one — resolved in that copy's capture,
  // held mounted through the card (`agent-write-sources.ts`).
  if (onScreen && opts?.origin === "agent") {
    const lease = await leaseAgentWriteSource({
      targetName,
      ...(opts.surfaceName ? { surfaceName: opts.surfaceName } : {}),
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      onScreenDeclares: stack.some((entry) =>
        Boolean(findDeclaredTarget(entry.surfaceName, targetName)),
      ),
    });
    if (lease) {
      try {
        return await applySurfaceWriteNow(targetName, rawValue, {
          ...opts,
          source: lease.source,
        });
      } finally {
        lease.release();
      }
    }
  }

  if (stack.length === 0) {
    return failUnapplicable(
      unapplicableMessage(
        targetName,
        opts?.surfaceName
          ? `Surface "${opts.surfaceName}" is not mounted here.`
          : "This screen mounts no writable surface.",
      ),
      { targetName, surfaceName: opts?.surfaceName ?? null },
    );
  }

  // The record this write is addressed to, bound into every handler phase.
  const writeContext: SurfaceWriteContext = opts?.item ? { item: opts.item } : {};

  // Deepest-first: first surface that DECLARES the target owns the write.
  for (const runtime of stack) {
    const target = findDeclaredTarget(runtime.surfaceName, targetName);
    if (!target) continue;

    const handlers = resolveHandlers(runtime, registry);
    const handler = splitHandler(handlers[targetName], writeContext);
    if (!handler) {
      // Declared but not wired — a real defect on the page, not the caller.
      return fail(
        `Surface "${runtime.surfaceName}" declares write target "${targetName}" but registered no handler for it.`,
        { targetName, surfaceName: runtime.surfaceName },
      );
    }

    // AN ANCHORED EDIT BECOMES A WHOLE VALUE HERE, before anything else in
    // this function looks at it. Resolving first is the whole design: the
    // value contract, the approval card and the page's own handler each go
    // on seeing one finished value, and no handler had to learn what a patch
    // is. A patch that cannot be placed is REFUSED with the reason (never
    // silently applied as "no change" — an edit that quietly did nothing is
    // the one outcome a caller cannot detect).
    // A patch sent JSON-ENCODED (`value: "{\"command\": \"str_replace\", …}"`)
    // is still a patch on a patchable target — models routinely string-encode
    // the envelope, and treating it as the literal new text wrote the JSON
    // into the record (or, on the canvas, was refused as "not a document").
    const patchInput = patchFromJsonString(target, rawValue) ?? rawValue;
    let value: unknown = patchInput;
    let patchExcerpt: SurfaceWriteApprovalProposal["patch"];
    if (isSurfaceWritePatch(patchInput)) {
      const resolved = await resolveTargetPatch(
        target,
        runtime,
        patchInput,
        registry,
        writeContext,
      );
      if (!resolved.ok) {
        return failPatch(resolved.error, {
          targetName: target.name,
          surfaceName: runtime.surfaceName,
          command: patchInput.command,
        });
      }
      value = resolved.value;
      if (resolved.excerpt) {
        patchExcerpt = { command: patchInput.command, ...resolved.excerpt };
      }
    }

    // THE DECLARED TYPE binds next: a JSON-encoded string for an object/array
    // target is parsed here (so the card, the contract and the handler all see
    // the real structure), and a value of the wrong type is refused BEFORE
    // anyone is asked — never an approval card for a value that cannot apply.
    const typed = coerceDeclaredValueType(target, value);
    if (!typed.ok) {
      return refuseBeforeApproval(typed.error, {
        targetName: target.name,
        surfaceName: runtime.surfaceName,
        valueType: target.valueType,
      });
    }
    value = typed.value;

    // The declared value contract is checked by THE DOOR (plan rule 10): an
    // agent's malformed value is refused there before any card is shown; a
    // person's is applied with the door's warning and fix (toasted below).

    // THE PAGE'S OWN PRE-APPROVAL CHECK (`{ validate, apply }` handlers). Runs
    // for every origin, before the approval card: a throw is the value's
    // refusal, handed back with its message, and the person is never asked to
    // approve something the page already knows it will reject.
    if (handler.validate) {
      try {
        await handler.validate(value);
      } catch (error) {
        return refuseBeforeApproval(
          error instanceof Error && error.message
            ? error.message
            : `"${target.label}" refused this value.`,
          { targetName: target.name, surfaceName: runtime.surfaceName, error },
        );
      }
    }

    let applyRuntime = runtime;
    const origin = opts?.origin ?? "user";
    // An anchored edit is re-resolved against the live text after approval
    // (rebased onto whatever a sibling write left there).
    const atApply: ApprovedWriteAtApply = {};
    if (origin === "agent" && isSurfaceWritePatch(patchInput)) {
      const patchValue = patchInput;
      atApply.resolvePatch = (live) =>
        resolveTargetPatch(target, live, patchValue, registry, writeContext);
    }
    // What this seam settled while the door ran, in its own words.
    let settled: SurfaceWriteResult | undefined;

    // THE APPROVAL STEP — the door asks (effective policy `ask`, agent) and
    // this write's existing flow answers: the inline card, the rebase, the
    // "changed while you were reviewing" check.
    const approve =
      origin === "agent"
        ? async (): Promise<boolean> => {
            const verdict = await agentWriteAllowed(
              target,
              runtime.surfaceName,
              opts?.actorLabel,
              value,
              opts?.requestApproval,
              runtime,
              registry,
              patchExcerpt,
              atApply,
              writeContext,
            );
            if (verdict === true) return true;
            settled = verdict;
            if (!verdict.ok && verdict.declined) return false;
            throw reportedError(verdict.ok ? `"${target.label}" was not applied.` : verdict.error);
          }
        : undefined;

    // THE PAGE'S HANDLER — live on the door for this write.
    const apply = async (): Promise<WriteHandlerResult> => {
      if (atApply.runtime) applyRuntime = atApply.runtime;
      if (atApply.value !== undefined && atApply.value !== value) {
        value = atApply.value;
        const rebasedContract = await valueContractHolds(
          target,
          runtime.surfaceName,
          value,
        );
        if (rebasedContract !== true) {
          settled = rebasedContract.ok
            ? rebasedContract
            : { ...rebasedContract, phase: "apply" };
          throw reportedError(rebasedContract.ok ? `"${target.label}" was not applied.` : rebasedContract.error);
        }
      }
      try {
        // Approval can span renders or navigation. Resolve the current handlers
        // again so draft/revision guards see the state at the time of the write.
        // The same SURFACE re-registered is still the page (`liveRuntimeFor`).
        const liveRuntime = liveRuntimeFor(registry, applyRuntime);
        if (!liveRuntime)
          throw new SurfaceWriteRefusalError("The page changed while approval was open. Review the current page before applying this change.");
        applyRuntime = liveRuntime;
        const currentHandler = splitHandler(
          resolveHandlers(applyRuntime, registry)[targetName],
          writeContext,
        );
        if (!currentHandler)
          throw new SurfaceWriteRefusalError("This operation is no longer available on the current page.");
        if (currentHandler.validate) {
          try { await currentHandler.validate(value); }
          catch (error) {
            throw new SurfaceWriteRefusalError(error instanceof Error && error.message
              ? error.message : `"${target.label}" refused this value.`);
          }
        }

        // Read the receipt after approval and current page validation.
        const before = await readPageValueBeforeWrite(
          target,
          applyRuntime,
          currentHandler.readCurrent,
        );
        const outcome = toWriteOutcome(await currentHandler.apply(value));
        // Hold the queue until the page shows this write, so a queued sibling
        // edit resolves against the new text, never the pre-write text.
        const textSource = target.comparisonValue ?? target.updatesValue;
        // A target read through its handler (a reference, not a scope value)
        // has persisted by the time `apply` returns — its next read is fresh.
        if (
          origin === "agent" &&
          textSource &&
          typeof value === "string" &&
          !currentHandler.readCurrent
        ) {
          await awaitPageShows(registry, applyRuntime, textSource, value);
        }
        // ui-mode writes are self-evident on screen (selection moved, view
        // changed) — no toast. Draft/entity writes confirm what landed where.
        if (!opts?.quiet && target.mode !== "ui") {
          const headline =
            target.mode === "entity"
              ? `${target.label} — done.`
              : `${target.label} staged — review and save.`;
          if (outcome?.summary) {
            toast.success(headline, { description: outcome.summary });
          } else {
            toast.success(headline);
          }
        }
        settled = {
          ok: true,
          surfaceName: runtime.surfaceName,
          target,
          ...(outcome ? { outcome } : {}),
          change: writeReceipt(target, value, before),
        };
        return {
          status: "applied",
          ...(outcome?.summary ? { sentence: outcome.summary } : {}),
        };
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : `Applying "${target.label}" failed.`;
        if (error instanceof SurfaceWriteRefusalError) {
          settled = { ok: false, refused: true, phase: "apply", error: message };
          return {
            status: "cannot-apply",
            cannotApply: "stale",
            sentence: message,
            remedy: "Review the current page, then ask for the change again.",
          };
        }
        const failure = fail(message, {
          targetName,
          surfaceName: runtime.surfaceName,
          error,
        });
        settled = failure.ok ? failure : { ...failure, phase: "apply" };
        throw reportedError(message);
      }
    };

    const receipt = await writeThroughDoor(
      {
        surfaceName: runtime.surfaceName,
        target: targetName,
        value,
        by: origin === "agent" ? "agent" : "person",
      },
      opts?.conversationId ?? null,
      apply,
      approve,
    );
    if (receipt.status === "applied" && receipt.warning && !opts?.quiet) {
      toast.warning(receipt.warning, receipt.fix ? { description: receipt.fix } : undefined);
    }
    const result: SurfaceWriteResult =
      settled ??
      // The door refused before this seam was asked anything.
      (receipt.status === "refused" && receipt.reason === "manual_only"
        ? fail(
            `"${target.label}" is not agent-writable on this surface (applyPolicy: manual). A person has to make this change.`,
            { targetName: target.name, surfaceName: runtime.surfaceName, policy: "manual" },
          )
        : fail(receipt.status === "refused" ? receipt.sentence : `"${target.label}" was not applied: ${receipt.sentence}`, {
            targetName,
            surfaceName: runtime.surfaceName,
            receipt,
          }));
    return { ...result, receipt };
  }

  return failUnapplicable(
    unapplicableMessage(
      targetName,
      `The page open here (${stack.map((entry) => entry.surfaceName).join(", ")}) declares no write target by that name.${otherItemsHintSentence(stack.map((entry) => entry.surfaceName))}`,
    ),
    {
      targetName,
      mounted: stack.map((entry) => entry.surfaceName),
    },
  );
}

// ── The PLATFORM write targets, through the door ────────────────────────────
//
// `window_form_fields`, `surface_feedback`, `custom_fields_add` and
// `custom_fields_set` are DECLARED once on the baseline surface
// (`_baseline.manifest.ts` `PLATFORM_WRITE_TARGETS`), which the door reads as
// every surface's root ancestor. Their handlers are registered HEADLESS on the
// baseline (`registerPlatformHandlers`), so an Action, a menu or a destination
// writing one from any surface lands; a seam write runs this seam's own apply
// (the card, the toast, the outcome) on its live route, like every target.

/** Applies one platform write. Throws `SurfaceWriteRefusalError` for the writer's to correct. */
async function applyPlatformTarget(
  name: PlatformWriteTargetName,
  value: unknown,
  context: { surfaceName: string; conversationId?: string; agentId?: string; actorLabel?: string },
): Promise<SurfaceWriteOutcome | undefined> {
  switch (name) {
    case "window_form_fields":
      await applyWindowFormChanges(value);
      return undefined;
    case "surface_feedback": {
      validateSurfaceFeedback(value);
      return saveSurfaceFeedback(value, {
        surfaceName: context.surfaceName,
        route: typeof window === "undefined" ? "" : window.location.pathname,
        organizationId: await feedbackOrganizationId(),
        ...(context.conversationId ? { conversationId: context.conversationId } : {}),
        ...(context.agentId ? { agentId: context.agentId } : {}),
        ...(context.actorLabel ? { agentName: context.actorLabel } : {}),
      });
    }
    case "custom_fields_add":
      if (!hasCustomFieldsDoors()) refuseSurfaceWrite("No custom-fields section is open on this page.");
      validateCustomFieldsWrite(value);
      return asRefusal(() => applyCustomFieldsWrite(value));
    case "custom_fields_set":
      if (!hasCustomFieldsSetDoors()) refuseSurfaceWrite("No custom-fields section is open on this page.");
      validateCustomFieldsSetWrite(value);
      return asRefusal(() => applyCustomFieldsSetWrite(value));
  }
}

/** The store's own refusal, or a part-way result naming what landed: the writer's to act on, not a platform fault. */
async function asRefusal<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SurfaceWriteRefusalError) throw error;
    throw new SurfaceWriteRefusalError(error instanceof Error && error.message ? error.message : "The write did not complete.");
  }
}

/**
 * Feedback is filed under the organization the person is acting in. The table
 * requires one; with none selected it is refused with the remedy rather than
 * open an organization picker just for feedback. "None yet" is not "none": a
 * write racing boot waits for its answer, and a FAILED organization read is
 * said as that, never as "pick one".
 */
async function feedbackOrganizationId(): Promise<string> {
  const active = readActiveOrganizationId(); // org-filter: write-target feedback is filed under the organization the person is acting in
  if (active) return active;
  // org-filter: write-target writes into the organization the person is working in; no list reads it
  const resolved = await awaitEffectiveOrganizationId();
  if (resolved.status === "ready") return resolved.organizationId;
  refuseSurfaceWrite(
    resolved.cause === "unreadable"
      ? "The person's organization could not be read just now, so nothing was saved. " +
          "Tell them their feedback was not filed and to send it again in a moment."
      : "No organization is selected, and every feedback row is filed under one, so nothing was saved. " +
          "Tell the person their feedback could not be filed until they pick their organization from the avatar menu, then send it again.",
  );
}

/** A platform write from outside this seam (an Action, a menu, a destination), on any surface. */
async function applyPlatformHeadless(request: WriteApplyRequest): Promise<WriteHandlerResult> {
  const name = request.target.name;
  if (!isPlatformWriteTarget(name)) throw new Error(`"${name}" is not a platform write target.`);
  if (request.ops) throw new Error(`"${request.target.label}" takes a whole value; send it instead of edits.`);
  try {
    const outcome = await applyPlatformTarget(name, request.value, {
      surfaceName: request.surfaceName === BASELINE_SURFACE_NAME ? "" : request.surfaceName,
    });
    return {
      status: "applied",
      ...(outcome?.summary ? { sentence: outcome.summary } : {}),
      ...(outcome?.data !== undefined ? { result: outcome.data as Json } : {}),
    };
  } catch (error) {
    // A refusal is the writer's to correct; the receipt carries it, nothing is captured.
    if (error instanceof SurfaceWriteRefusalError) throw reportedError(error.message);
    throw error;
  }
}

let platformHandlersOn: WriteDoor | null = null;

/** The platform targets' headless handlers, on the baseline surface every surface inherits — once per door. */
function registerPlatformHandlers(door: WriteDoor): void {
  if (platformHandlersOn === door) return;
  platformHandlersOn = door;
  for (const name of Object.keys(PLATFORM_WRITE_TARGETS)) {
    door.registerHeadless(BASELINE_SURFACE_NAME, name, (request) => applyPlatformHeadless(request));
  }
}

/** The offer's wording of a platform target (the custom-fields ones name the mounted sections). */
function platformTarget(name: PlatformWriteTargetName): SurfaceWriteTarget {
  if (name === CUSTOM_FIELDS_TARGET_NAME) return customFieldsTarget();
  if (name === CUSTOM_FIELDS_SET_TARGET_NAME) return customFieldsSetTarget();
  return PLATFORM_WRITE_TARGETS[name];
}

/**
 * A seam write to a platform target. Same order as every write: which surface
 * it is for → declared type → the target's own check (refused before any card)
 * → the door (policy: the card for an agent on an `ask` target) → apply →
 * outcome and receipt. `window_form_fields` and `custom_fields_add` go to the
 * primary (deepest) mounted surface, or the baseline with none mounted;
 * `surface_feedback` to the primary one, or `opts.surfaceName` when that names
 * another MOUNTED surface.
 */
async function applyPlatformWrite(
  name: PlatformWriteTargetName,
  rawValue: unknown,
  opts?: ApplySurfaceWriteOptions,
): Promise<SurfaceWriteResult> {
  const stack = getSurfaceRuntimeStack();
  let runtime: SurfaceRuntimeValue | undefined = stack[0];
  if (name === SURFACE_FEEDBACK_TARGET_NAME) {
    const mounted = stack.map((entry) => entry.surfaceName);
    if (stack.length === 0) {
      return failUnapplicable(
        unapplicableMessage(name, "This screen mounts no registered surface to give feedback on."),
        { targetName: name },
      );
    }
    runtime = opts?.surfaceName ? stack.find((entry) => entry.surfaceName === opts.surfaceName) : stack[0];
    if (!runtime) {
      return refuseBeforeApproval(
        `Surface "${opts?.surfaceName}" is not open here, so feedback cannot be filed for it. Open surfaces: ${mounted.join(", ")}. Nothing was saved.`,
        { targetName: name, surfaceName: opts?.surfaceName, mounted },
      );
    }
  }
  if (name === CUSTOM_FIELDS_TARGET_NAME ? !hasCustomFieldsDoors() : name === CUSTOM_FIELDS_SET_TARGET_NAME && !hasCustomFieldsSetDoors()) {
    return failUnapplicable(
      unapplicableMessage(name, "No custom-fields section is open on this page."),
      { targetName: name },
    );
  }
  const target = platformTarget(name);
  const surfaceName = runtime?.surfaceName ?? "";
  const approvalRuntime: SurfaceRuntimeValue = runtime ?? { surfaceName, getScope: () => ({}) };

  const typed = coerceDeclaredValueType(target, rawValue);
  if (!typed.ok) {
    return refuseBeforeApproval(typed.error, { targetName: name, surfaceName });
  }
  // The person approves what they can read: each window change names its field.
  const value = name === WINDOW_FORM_TARGET_NAME ? labelWindowFormWrite(typed.value) : typed.value;
  try {
    if (name === SURFACE_FEEDBACK_TARGET_NAME) validateSurfaceFeedback(value);
    if (name === CUSTOM_FIELDS_TARGET_NAME) validateCustomFieldsWrite(value);
    if (name === CUSTOM_FIELDS_SET_TARGET_NAME) validateCustomFieldsSetWrite(value);
  } catch (error) {
    return refuseBeforeApproval(
      error instanceof Error ? error.message : `"${target.label}" refused this value.`,
      { targetName: name, surfaceName },
    );
  }

  const origin = opts?.origin ?? "user";
  const askAgent = (): Promise<SurfaceWriteResult | true> =>
    agentWriteAllowed(target, surfaceName, opts?.actorLabel, value, opts?.requestApproval, approvalRuntime);
  // An `auto` target is never asked about by the door; a binding that
  // tightened it on this surface still holds (the policy is re-resolved here).
  if (origin === "agent" && target.applyPolicy === "auto") {
    const verdict = await askAgent();
    if (verdict !== true) return verdict;
  }

  let settled: SurfaceWriteResult | undefined;
  const approve =
    origin === "agent"
      ? async (): Promise<boolean> => {
          const verdict = await askAgent();
          if (verdict === true) return true;
          settled = verdict;
          if (!verdict.ok && verdict.declined) return false;
          throw reportedError(verdict.ok ? `"${target.label}" was not applied.` : verdict.error);
        }
      : undefined;

  const apply = async (): Promise<WriteHandlerResult> => {
    try {
      const outcome = await applyPlatformTarget(name, value, {
        surfaceName,
        ...(opts?.conversationId ? { conversationId: opts.conversationId } : {}),
        ...(opts?.agentId ? { agentId: opts.agentId } : {}),
        ...(opts?.actorLabel ? { actorLabel: opts.actorLabel } : {}),
      });
      if (!opts?.quiet) {
        if (name === WINDOW_FORM_TARGET_NAME) toast.success(`${target.label} — filled in. Review and save.`);
        else if (name === SURFACE_FEEDBACK_TARGET_NAME) toast.success("Feedback saved for the team.", { description: surfaceName });
        else if (outcome?.summary) toast.success(outcome.summary);
      }
      settled = {
        ok: true,
        surfaceName,
        target,
        ...(outcome ? { outcome } : {}),
        change: writeReceipt(target, value, NOT_READ),
      };
      return { status: "applied", ...(outcome?.summary ? { sentence: outcome.summary } : {}) };
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : `Applying "${target.label}" failed.`;
      if (error instanceof SurfaceWriteRefusalError) {
        settled =
          name === WINDOW_FORM_TARGET_NAME
            ? { ok: false, refused: true, error: message }
            : { ok: false, refused: true, phase: "apply", error: message };
      } else {
        const failure = fail(message, { targetName: name, surfaceName, error });
        settled = failure.ok ? failure : { ...failure, phase: "apply" };
      }
      throw reportedError(message);
    }
  };

  const receipt = await writeThroughDoor(
    { surfaceName: surfaceName || BASELINE_SURFACE_NAME, target: name, value, by: origin === "agent" ? "agent" : "person" },
    opts?.conversationId ?? null,
    apply,
    approve,
  );
  if (receipt.status === "applied" && receipt.warning && !opts?.quiet) {
    toast.warning(receipt.warning, receipt.fix ? { description: receipt.fix } : undefined);
  }
  const result: SurfaceWriteResult =
    settled ??
    fail(receipt.status === "refused" ? receipt.sentence : `"${target.label}" was not applied: ${receipt.sentence}`, {
      targetName: name,
      surfaceName,
      receipt,
    });
  return { ...result, receipt };
}

/**
 * The ONE delegated tool name through which an agent's RUN reaches this seam.
 *
 * `buildToolInjection` offers it as an inline spec whenever the mounted
 * surface stack has agent-writable targets (see `listAgentWritableTargets`),
 * and the delegated-call router dispatches it into `applySurfaceWrite` with
 * `origin: "agent"` — the stream side of the 360 loop. Deliberately the same
 * name as the kind-action registry key: one verb, two callers (a rendered
 * component's button vs. the model's own tool call).
 */
export const SURFACE_WRITE_TOOL_NAME = "apply_surface_write";

/**
 * The subset of live write targets an AGENT may currently drive: declared on
 * a mounted surface, wired to a handler, and resolving (surface default +
 * per-run binding overrides) to `ask` or `auto`. This is what the injected
 * `apply_surface_write` tool advertises each turn — a `manual` target is
 * never offered (advertising a write the platform will refuse reads as a
 * broken promise; mirrors aidream's `_write_targets_block`).
 *
 * Policies are re-resolved at APPLY time too, so a policy that tightened
 * between injection and call is still enforced — this list is the offer, not
 * the gate.
 */
export function listAgentWritableTargets(
  source?: SurfaceRegistry,
): ReadonlyArray<{
  surfaceName: string;
  target: SurfaceWriteTarget;
  policy: Exclude<SurfaceWritePolicy, "manual">;
}> {
  const out: Array<{
    surfaceName: string;
    target: SurfaceWriteTarget;
    policy: Exclude<SurfaceWritePolicy, "manual">;
  }> = [];
  for (const live of listLiveWriteTargets(source)) {
    const policy = resolveApplyPolicy(live.target, live.surfaceName);
    if (policy === "manual") continue;
    if (!live.hasHandler) {
      // A DECLARED DOOR WITH NOTHING BEHIND IT. Dropping it from the offer is
      // right — the model is never handed a write it cannot make — but doing
      // it silently is how the Masterwork Conductor spent a turn planning a
      // `rule_draft` write on a mount that had no handler (2026-09-12). The
      // drop announces itself with the remedy.
      reportUnwiredTarget(live.surfaceName, live.target);
      continue;
    }
    out.push({ surfaceName: live.surfaceName, target: live.target, policy });
  }
  return out;
}

/**
 * Every declared-but-unwired agent target on the live stack, for authoring and
 * debug chrome (and the reason the offer is smaller than the declaration).
 */
export function listUnwiredAgentTargets(): ReadonlyArray<{
  surfaceName: string;
  target: SurfaceWriteTarget;
}> {
  return listLiveWriteTargets()
    .filter(
      (live) =>
        !live.hasHandler &&
        resolveApplyPolicy(live.target, live.surfaceName) !== "manual",
    )
    .map((live) => ({ surfaceName: live.surfaceName, target: live.target }));
}

/**
 * One report per surface+target per page load: the offer is rebuilt on every
 * turn, and a line per turn would train everyone to ignore the channel.
 */
const reportedUnwiredTargets = new Set<string>();

function reportUnwiredTarget(
  surfaceName: string,
  target: SurfaceWriteTarget,
): void {
  const key = `${surfaceName}:${target.name}`;
  if (reportedUnwiredTargets.has(key)) return;
  reportedUnwiredTargets.add(key);
  const message =
    `[surface-writeback] Surface "${surfaceName}" declares agent-writable ` +
    `target "${target.name}", but the mounted page registered no handler for ` +
    `it — agents are not offered it here. Register it with ` +
    `useSurfaceWriteHandlers (or getWriteHandlers) on the component that owns ` +
    `that state, or drop the declaration from the manifest.`;
  // Deliberately the DEVELOPER channel, not `captureError`: a surface can be
  // mounted by several components and a mount that legitimately cannot service
  // every declared target is not a user-visible fault — the agent is told
  // plainly by the server's <surface_write_targets> block that the target is
  // declared but not writable this turn. A capture per page load here would be
  // a recovery that always fires, which trains everyone to ignore the channel.
  if (process.env.NODE_ENV !== "production") {
    console.warn(message);
  }
}

/** Test seam — the dedupe set is per page load, and a test IS one load. */
export function __resetUnwiredTargetReports(): void {
  reportedUnwiredTargets.clear();
}

/**
 * The write targets currently reachable (declared AND mounted), deepest
 * surface first — for authoring surfaces / debug chrome (the Surface Context
 * window can show "what could an agent write here right now").
 */
export function listLiveWriteTargets(
  source?: SurfaceRegistry,
): ReadonlyArray<{
  surfaceName: string;
  target: SurfaceWriteTarget;
  hasHandler: boolean;
}> {
  const registry = source ?? getGlobalSurfaceRegistry();
  const out: Array<{
    surfaceName: string;
    target: SurfaceWriteTarget;
    hasHandler: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const runtime of registry.stack()) {
    const manifest = getManifest(runtime.surfaceName);
    if (!manifest?.writeTargets) continue;
    const handlers = resolveHandlers(runtime, registry);
    for (const target of manifest.writeTargets) {
      const key = `${runtime.surfaceName}:${target.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        surfaceName: runtime.surfaceName,
        target,
        hasHandler: Boolean(handlers[target.name]),
      });
    }
  }
  // The platform targets below belong to the SCREEN, never to a capture.
  if (registry.kind !== "global") return out;
  // The platform target for unregistered windows: offered only while one
  // with fields is open, attributed to the primary surface.
  if (hasWindowForms()) {
    out.push({
      surfaceName: getSurfaceRuntimeStack()[0]?.surfaceName ?? "",
      target: WINDOW_FORM_TARGET,
      hasHandler: true,
    });
  }
  // The custom-fields target: offered while a custom-fields section is
  // mounted (any record page that embeds EntityCustomFields), attributed to
  // the primary surface — or none, like window forms.
  if (hasCustomFieldsDoors()) {
    out.push({
      surfaceName: getSurfaceRuntimeStack()[0]?.surfaceName ?? "",
      target: customFieldsTarget(),
      hasHandler: true,
    });
  }
  if (hasCustomFieldsSetDoors()) {
    out.push({
      surfaceName: getSurfaceRuntimeStack()[0]?.surfaceName ?? "",
      target: customFieldsSetTarget(),
      hasHandler: true,
    });
  }
  // The platform feedback target: offered whenever a registered surface is
  // mounted, attributed to the primary (deepest) one. The line names every
  // open surface so the agent can pass `surface` to file it for another.
  const mounted = getSurfaceRuntimeStack().map((entry) => entry.surfaceName);
  if (mounted.length > 0) {
    out.push({
      surfaceName: mounted[0],
      target:
        mounted.length > 1
          ? {
              ...SURFACE_FEEDBACK_TARGET,
              description: `${SURFACE_FEEDBACK_TARGET.description} Open surfaces: ${mounted.join(", ")}.`,
            }
          : SURFACE_FEEDBACK_TARGET,
      hasHandler: true,
    });
  }
  return out;
}

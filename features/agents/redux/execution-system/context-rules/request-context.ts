/**
 * THE ONE DOOR for a request's `context` — and the rows the screen shows.
 *
 * Contract: common-docs systems/scopes-context/context-delivery/RULES.md.
 *
 * Every value a turn can carry — the page's values, everything attached to the
 * chat, the attached files, and the first turn's system values (user, client,
 * route…) — becomes ONE `ResolvedContextRow` here, with every layer the server
 * applies (page, agent, the person's saved rule). The composer's table renders
 * these rows, and `buildContextWire(rows)` turns the SAME rows into the
 * request body, so what the person sees and what the request carries cannot
 * drift apart. The server's `context_receipt` is then compared with these rows
 * (`compareReceipt`) and any difference is loud.
 *
 * `pnpm check:context-single-door` fails any other code that puts a `context`
 * on an agent request.
 */

import type { RootState } from "@/lib/redux/store";
import {
  DEFAULT_INLINE_CAP,
  DEFAULT_SURFACE_KEY,
  applyReceiptToRows,
  buildContextWire,
  resolveContextRow,
  type ContextRowSource,
  type ResolvedContextRow,
} from "@ai-matrx/agents/context";
import { formatText } from "@ai-matrx/kit/text-case";
import { getManifest } from "@/features/surfaces/manifests/registry";
import {
  BASELINE_VALUES,
  PAGELESS_CONTENT_INLINE_CEILING,
  POINTER_INLINE_CEILINGS,
} from "@/features/surfaces/manifests/_baseline.manifest";
import {
  selectAgentAutoContextDisabled,
  selectAgentContextPolicies,
} from "@/features/agents/redux/agent-definition/selectors";
import { selectResourceContextPayload } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import {
  buildAmbientContext,
  isFirstTurn,
} from "@/features/agents/ui-first-tools/redux/build-ambient-context";
import { contextEntryLabel } from "@/features/agents/components/context-policies-display/contextEntryLabel";
import { selectSavedContextRuleRows } from "./context-rules.thunks";
import { toContextReceipt } from "./receipt-check";
import { resolveClientSurface } from "../utils/build-tool-injection";

export interface RequestContextOptions {
  /**
   * Include the first turn's system values (user, client, route brief,
   * organization…). Leave it unset: `ambientIncluded` decides from the
   * conversation itself, so the table and every send path agree. Only the
   * resume path forces it on (it re-sends them every resume).
   */
  includeAmbient?: boolean;
  /**
   * The Mandate's own context kill switch (`contract.auto_context_disabled`),
   * which the client learns from the resolved mandate. The agent's switch is
   * read from its definition here.
   */
  mandateKillSwitch?: boolean;
  /**
   * Values a send path adds for this request only (the resume's
   * "page values read after your writes" note). They become rows like
   * everything else — shown, governed by the person's rules, and sent only
   * through `buildContextWire`.
   */
  extraSources?: readonly ContextRowSource[];
}

export interface RequestContext {
  rows: ResolvedContextRow[];
  /** The request body's `context`, or undefined when nothing is included. */
  context: Record<string, unknown> | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validLimit(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function attachedFileLabel(state: RootState, conversationId: string, fileId: string): string {
  const resources = state.instanceResources?.byConversationId[conversationId];
  for (const resource of Object.values(resources ?? {})) {
    const source = resource.source;
    if (!isRecord(source)) continue;
    if (source.file_id !== fileId && source.fileId !== fileId) continue;
    for (const field of ["filename", "file_name", "name", "title", "label"]) {
      const v = source[field];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "Attached file";
}

/**
 * Whether the next turn carries the first turn's system values: on the first
 * turn of a conversation that sends through the agent door. The builder's
 * manual door (`apiEndpointMode: "manual"`) never has. ONE answer, read by the
 * table and the send path alike (a table that showed four system values the
 * manual send never carried was found live, 2026-09-30).
 */
export function ambientIncluded(state: RootState, conversationId: string): boolean {
  const mode = state.messages?.byConversationId?.[conversationId]?.apiEndpointMode ?? "agent";
  return mode !== "manual" && isFirstTurn(state, conversationId);
}

/** Every value this conversation's next turn would carry, before any rule. */
export function collectContextRowSources(
  state: RootState,
  conversationId: string,
  opts: RequestContextOptions = {},
): ContextRowSource[] {
  const conversation = state.conversations?.byConversationId[conversationId];
  const surfaceName = conversation?.surfaceName ?? null;
  const manifest = surfaceName ? getManifest(surfaceName) : undefined;
  // The agent record may not be loaded (or, in a narrow harness, not present):
  // then its layer is simply unknown here and the receipt is the referee.
  const agentId = conversation?.agentId ?? null;
  const agentLoaded = Boolean(agentId && state.agentDefinition?.agents?.[agentId]);
  const policies = agentLoaded ? selectAgentContextPolicies(state, agentId!) : undefined;
  const killSwitch =
    (agentLoaded && selectAgentAutoContextDisabled(state, agentId!)) ||
    opts.mandateKillSwitch === true;
  const policyFor = (key: string) => policies?.find((p) => p.key === key);
  const agentLayer = (key: string) => {
    const policy = policyFor(key);
    return {
      declared: Boolean(policy),
      max_inline_chars: validLimit(policy?.max_inline_chars),
      kill_switch: killSwitch,
    };
  };

  const byKey = new Map<string, ContextRowSource>();

  // 1. Everything in the conversation's context (page values + attached).
  const entries = Object.values(state.instanceContext?.byConversationId[conversationId] ?? {});
  for (const entry of entries) {
    const declared = manifest?.values.find((v) => v.name === entry.key);
    const pointer = POINTER_INLINE_CEILINGS[entry.key];
    const ownLimit = isRecord(entry.value) && "content" in entry.value
      ? validLimit(entry.value.max_inline_chars)
      : null;
    const pageLimit = pointer
      ? Math.max(pointer, declared?.inlineUpTo ?? 0)
      : (validLimit(declared?.inlineUpTo) ??
        (!surfaceName && entry.key === "content" ? PAGELESS_CONTENT_INLINE_CEILING : ownLimit));
    const baseline = (BASELINE_VALUES as Record<string, { description?: string }>)[entry.key];
    const policy = policyFor(entry.key);
    byKey.set(entry.key, {
      key: entry.key,
      label: contextEntryLabel(entry, policy?.label ?? declared?.label ?? null),
      // The server keys a value to the surface whose manifest declares it,
      // and everything else to the person's "_default" row (RULES.md §3).
      surfaceKey: declared && surfaceName ? surfaceName : DEFAULT_SURFACE_KEY,
      origin: declared ? "page" : "attached",
      value: entry.value,
      type: entry.type,
      // The person's pointer says they are pointing at this text; a page value
      // the page asked to inline carries the page's own description of it.
      ...(pointer && baseline?.description
        ? { description: baseline.description }
        : declared?.inlineUpTo && declared.description
          ? { description: declared.description }
          : {}),
      layers: {
        agent: agentLayer(entry.key),
        surface: {
          declared: Boolean(declared),
          auto_context: declared ? (declared.autoContext ?? true) : null,
          max_inline_chars: pageLimit,
        },
      },
    });
  }

  // 2. Attached files (server-resolved resource references).
  const resourceContext = selectResourceContextPayload(conversationId)(state);
  for (const [key, value] of Object.entries(resourceContext ?? {})) {
    const fileId = key.replace(/^attached_file_/, "");
    byKey.set(key, {
      key,
      label: attachedFileLabel(state, conversationId, fileId),
      surfaceKey: DEFAULT_SURFACE_KEY,
      origin: "attached",
      value,
      // The server measures a reference after resolving it.
      chars: null,
      layers: { agent: agentLayer(key), surface: null },
    });
  }

  // 3. The first turn's system values.
  const includeAmbient = opts.includeAmbient ?? ambientIncluded(state, conversationId);
  if (includeAmbient) {
    const ambient = buildAmbientContext(state, conversationId);
    for (const [key, value] of Object.entries(ambient ?? {})) {
      byKey.set(key, {
        key,
        label: formatText(key) || key,
        surfaceKey: DEFAULT_SURFACE_KEY,
        origin: "system",
        value,
        layers: { agent: agentLayer(key), surface: null },
      });
    }
  }

  for (const source of opts.extraSources ?? []) byKey.set(source.key, source);

  return [...byKey.values()];
}

/** The inline cap the server last reported (a platform knob), else the default. */
export function selectContextInlineCap(state: RootState, conversationId: string): number {
  return (
    state.instanceContext?.receiptByConversationId?.[conversationId]?.receipt.cap ??
    DEFAULT_INLINE_CAP
  );
}

/** Rows (what the table shows) and the request `context` built from them. */
export function buildRequestContext(
  state: RootState,
  conversationId: string,
  opts: RequestContextOptions = {},
): RequestContext {
  const saved = selectSavedContextRuleRows(state);
  const cap = selectContextInlineCap(state, conversationId);
  // The person's rules are looked up against the surface the request names as
  // its primary (`client.surface`) — the same surface the server's lookup
  // uses, so a value filed differently on each side still gets the same rule.
  const primarySurface = resolveClientSurface(state, conversationId) ?? null;
  const rows = collectContextRowSources(state, conversationId, opts).map((source) =>
    resolveContextRow(source, saved, cap, primarySurface),
  );
  const wire = buildContextWire(rows);
  return { rows, context: Object.keys(wire).length > 0 ? wire : undefined };
}

// ── The table's rows, memoized ──────────────────────────────────────────────

const EMPTY_ROWS: ResolvedContextRow[] = [];

function displayInputs(state: RootState, conversationId: string): readonly unknown[] {
  const conversation = state.conversations?.byConversationId[conversationId];
  const agentId = conversation?.agentId ?? null;
  return [
    state.instanceContext?.byConversationId[conversationId],
    conversation?.surfaceName ?? null,
    agentId ? state.agentDefinition?.agents[agentId] : null,
    state.instanceResources?.byConversationId[conversationId],
    selectSavedContextRuleRows(state),
    state.instanceContext?.receiptByConversationId?.[conversationId]?.receipt.cap ?? null,
    ambientIncluded(state, conversationId),
    resolveClientSurface(state, conversationId) ?? null,
  ];
}

const rowsMemo = new Map<string, { inputs: readonly unknown[]; rows: ResolvedContextRow[] }>();

/**
 * The rows the composer's context table shows for the NEXT turn — the same
 * function the send path uses, so the table is exactly what will be sent.
 * Recomputed only when one of its inputs changes identity.
 */
export const selectResolvedContextRows =
  (conversationId: string, mandateKillSwitch = false) =>
  (state: RootState): ResolvedContextRow[] => {
    const inputs = [...displayInputs(state, conversationId), mandateKillSwitch];
    const memoKey = conversationId;
    const hit = rowsMemo.get(memoKey);
    if (hit && hit.inputs.length === inputs.length && hit.inputs.every((v, i) => v === inputs[i])) {
      return hit.rows;
    }
    const { rows } = buildRequestContext(state, conversationId, { mandateKillSwitch });
    const out = rows.length === 0 ? EMPTY_ROWS : rows;
    rowsMemo.set(memoKey, { inputs, rows: out });
    return out;
  };

// ── The rows a built request came from ──────────────────────────────────────

const rowsByRequest = new WeakMap<object, ResolvedContextRow[]>();

/** Record the rows an assembled request body was built from. */
export function rememberRequestContextRows(request: object, rows: ResolvedContextRow[]): void {
  rowsByRequest.set(request, rows);
}

/**
 * The rows a request body was built from, without their values (the receipt
 * check needs the rules, not a second copy of every value in the store).
 */
export function contextRowsForRequest(request: object): ResolvedContextRow[] {
  return (rowsByRequest.get(request) ?? EMPTY_ROWS).map((row) => ({ ...row, value: undefined }));
}

// ── What the table DISPLAYS ─────────────────────────────────────────────────

const displayMemo = new Map<
  string,
  { rows: ResolvedContextRow[]; receipt: unknown; out: ResolvedContextRow[] }
>();

/**
 * The rows the chip and the full view DISPLAY: `selectResolvedContextRows`,
 * with the values the server resolves itself (references, `*_id` lookups)
 * filled in from the latest receipt — their size and delivery are the server's
 * to report, never the client's to guess (`applyReceiptToRows`). Display only:
 * the send path and the receipt check use the unfilled rows.
 */
export const selectDisplayContextRows =
  (conversationId: string, mandateKillSwitch = false) =>
  (state: RootState): ResolvedContextRow[] => {
    const rows = selectResolvedContextRows(conversationId, mandateKillSwitch)(state);
    const receipt = state.instanceContext?.receiptByConversationId?.[conversationId]?.receipt;
    if (!receipt) return rows;
    const hit = displayMemo.get(conversationId);
    if (hit && hit.rows === rows && hit.receipt === receipt) return hit.out;
    const out = applyReceiptToRows(rows, toContextReceipt(receipt));
    displayMemo.set(conversationId, { rows, receipt, out });
    return out;
  };

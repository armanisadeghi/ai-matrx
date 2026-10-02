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

import type { RootState } from "@host/lib/redux/store";
import {
  DEFAULT_INLINE_CAP,
  DEFAULT_SURFACE_KEY,
  applyReceiptToRows,
  buildContextWire,
  compareReceipt,
  resolveContextRow,
  type ContextRowSource,
  type ResolvedContextRow,
  humanizeContextKey,
  systemRowsToResolved,
  withheldKeys,
} from "@ai-matrx/agents/context";
import { getManifest } from "@host/features/surfaces/manifests/registry";
import {
  BASELINE_VALUES,
  PAGELESS_CONTENT_INLINE_CEILING,
  POINTER_INLINE_CEILINGS,
} from "@host/features/surfaces/manifests/_baseline.manifest";
import {
  selectAgentAutoContextDisabled,
  selectAgentContextPolicies,
  selectAgentReadyForExecution,
} from "../../agent-definition/selectors";
import { selectResourceContextPayload } from "../instance-resources/instance-resources.selectors";
import {
  buildAmbientContext,
  isFirstTurn,
} from "../../../ui-first-tools/redux/build-ambient-context";
import { selectSavedContextRuleRows } from "./context-rules.thunks";
import { deliveredFieldsFor, toContextReceipt } from "./receipt-check";
import { resolveClientSurface } from "../utils/build-tool-injection";
import { surfaceWritesNoteSource } from "../utils/surface-writes-note";

export interface RequestContextOptions {
  /**
   * Include the first turn's system values (user, client, route brief,
   * organization…). Leave it unset: `ambientIncluded` decides from the
   * conversation itself, so the table and EVERY send path — resume included —
   * agree. Tests only; `check:context-single-door` refuses it elsewhere.
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
  /**
   * The request body's `context_withheld`: every key this client holds a value
   * for but is not sending (off by the page, the agent or the person's rule),
   * from the SAME rows. The server then lists saved off-rules only for these
   * keys. Always sent — an empty list means nothing was withheld.
   */
  context_withheld: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validLimit(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * A label someone wrote wins; a "label" that is the key itself is the key in
 * words — the package's `humanizeContextKey`, the one rule the server's
 * receipt uses too (`note_id` → "Note ID"), so one value is never named two ways.
 */
function rowLabel(key: string, ...written: Array<string | null | undefined>): string {
  for (const label of written) {
    const text = label?.trim();
    if (text && text !== key) return text;
  }
  return humanizeContextKey(key) || key;
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

function agentContextLayerKnownFor(state: RootState, agentId: string | null): boolean {
  return Boolean(agentId && selectAgentReadyForExecution(state, agentId));
}

/**
 * Whether the rows can name the agent's layer (its Context Policies and kill
 * switch): true with no agent, or once its execution definition is loaded.
 */
export function agentContextLayerKnown(state: RootState, conversationId: string): boolean {
  const agentId = state.conversations?.byConversationId[conversationId]?.agentId ?? null;
  return !agentId || agentContextLayerKnownFor(state, agentId);
}

/** Every value this conversation's next turn would carry, before any rule. */
export function collectContextRowSources(
  state: RootState,
  conversationId: string,
  opts: RequestContextOptions = {},
): ContextRowSource[] {
  const conversation = state.conversations?.byConversationId[conversationId];
  // THE PAGE LAYER IS THE PRIMARY SURFACE'S, for every source. The server
  // applies the page layer of the request's primary surface (`client.surface`)
  // to every value it receives — a page value, an attached file, a first-turn
  // system value alike — so the client reads the same manifest for all of
  // them. A system value the page also declares (`conversation` on
  // `matrx-user/chat`, limit 1000) went amber on every new chat's first turn
  // while the client gave system rows no page layer at all.
  const surfaceName = resolveClientSurface(state, conversationId) ?? null;
  const manifest = surfaceName ? getManifest(surfaceName) : undefined;
  const declaredValue = (key: string) => manifest?.values.find((v) => v.name === key);
  /** The page layer for a value the primary surface declares; null otherwise. */
  const surfaceLayer = (key: string, pageLimit: number | null = null) => {
    const declared = declaredValue(key);
    if (!declared) return { surfaceKey: DEFAULT_SURFACE_KEY, surface: null };
    return {
      surfaceKey: surfaceName ?? DEFAULT_SURFACE_KEY,
      surface: {
        declared: true,
        auto_context: declared.autoContext ?? true,
        max_inline_chars: pageLimit ?? validLimit(declared.inlineUpTo),
      },
    };
  };
  // The agent's context layer counts only from a record that READ it (fetch
  // status execution or fuller — `agentContextLayerKnown`). A list-fetched
  // record carries defaults it never read (`autoContextDisabled: false`), and
  // trusting it showed a kill-switch agent's page values as sent. The send
  // path loads the definition first (`ensureContextRulesReady`); the chip
  // waits for it.
  const agentId = conversation?.agentId ?? null;
  const agentLoaded = agentContextLayerKnownFor(state, agentId);
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
    const declared = declaredValue(entry.key);
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
      label: rowLabel(entry.key, policy?.label, declared?.label, entry.label),
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
    const fileId = key.replace(/^resource_file_/, "");
    const page = surfaceLayer(key);
    byKey.set(key, {
      key,
      label: attachedFileLabel(state, conversationId, fileId),
      surfaceKey: page.surfaceKey,
      origin: "attached",
      value,
      // The server measures a reference after resolving it.
      chars: null,
      layers: { agent: agentLayer(key), surface: page.surface },
    });
  }

  // 3. The first turn's system values.
  const includeAmbient = opts.includeAmbient ?? ambientIncluded(state, conversationId);
  if (includeAmbient) {
    const ambient = buildAmbientContext(state, conversationId);
    for (const [key, value] of Object.entries(ambient ?? {})) {
      const page = surfaceLayer(key);
      byKey.set(key, {
        key,
        label: rowLabel(key, declaredValue(key)?.label),
        surfaceKey: page.surfaceKey,
        origin: "system",
        value,
        layers: { agent: agentLayer(key), surface: page.surface },
      });
    }
  }

  for (const source of opts.extraSources ?? []) byKey.set(source.key, source);

  return [...byKey.values()];
}

/**
 * The resume path's context: the same rows the chip shows for this
 * conversation (one rule for system values: `ambientIncluded`), plus the note
 * that the page values were read AFTER the writes this conversation made.
 */
export function buildResumeRequestContext(
  state: RootState,
  conversationId: string,
  mandateKillSwitch: boolean,
): RequestContext {
  const writesNote = surfaceWritesNoteSource(state, conversationId);
  return buildRequestContext(state, conversationId, {
    mandateKillSwitch,
    extraSources: writesNote ? [writesNote] : [],
  });
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
  return {
    rows,
    context: Object.keys(wire).length > 0 ? wire : undefined,
    context_withheld: withheldKeys(rows),
  };
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

// ── Durable attachments: what is attached NOW ───────────────────────────────

/** A document attached to the conversation right now (a platform.associations edge). */
export interface DurableAttachment {
  key: string;
  label: string;
}

/**
 * One kind of durable attachment and the key prefixes the server files it
 * under. `items` null = not read yet: rows of that kind are left as they are.
 */
export interface DurableAttachmentGroup {
  prefixes: readonly string[];
  items: readonly DurableAttachment[] | null;
}

/** Documents (processed documents, files) — platform.associations edges. */
export const DOCUMENT_ATTACHMENT_PREFIXES = ["attached_document_", "resource_file_"] as const;
/** Connector resources (repos, Google files, synced records) — `attachmentContextKey`. */
export const RESOURCE_ATTACHMENT_PREFIXES = ["attached_resource_"] as const;

/**
 * The context key the server seeds an attached document under (aidream
 * context_sources `_attached_document_key` / `_seed_file`); null for a token
 * the server does not seed as a document.
 */
export function durableAttachmentKey(token: string, resourceId: string): string | null {
  if (token === "processed_document") return `attached_document_${resourceId}`;
  if (token === "file") return `resource_file_${resourceId}`;
  return null;
}

/**
 * Reconcile the display rows' server-added attachments with what is attached
 * NOW, kind by kind: one detached since the last receipt is dropped, and one
 * attached since then is added (its size unknown until the next receipt). A
 * kind not read yet leaves its rows unchanged.
 */
export function reconcileDurableAttachments(
  state: RootState,
  conversationId: string,
  rows: ResolvedContextRow[],
  groups: readonly DurableAttachmentGroup[],
): ResolvedContextRow[] {
  const read = groups.filter((g): g is DurableAttachmentGroup & { items: readonly DurableAttachment[] } => g.items !== null);
  if (read.length === 0) return rows;
  const current = new Set(read.flatMap((g) => g.items.map((a) => a.key)));
  const governed = (key: string) => read.some((g) => g.prefixes.some((p) => key.startsWith(p)));
  const kept = rows.filter((row) => !(row.fromReceipt && governed(row.key)) || current.has(row.key));
  const shown = new Set(kept.map((row) => row.key));
  const saved = selectSavedContextRuleRows(state);
  const cap = selectContextInlineCap(state, conversationId);
  const primarySurface = resolveClientSurface(state, conversationId) ?? null;
  const added = read
    .flatMap((g) => g.items)
    .filter((a) => !shown.has(a.key))
    .map((a): ResolvedContextRow => {
      const row = resolveContextRow(
        { key: a.key, label: a.label, surfaceKey: DEFAULT_SURFACE_KEY, origin: "attached", value: undefined, chars: null },
        saved,
        cap,
        primarySurface,
      );
      // The server resolves it: its size and delivery are the next receipt's to say.
      return { ...row, serverResolved: true, delivery: row.include ? "server" : "off" };
    });
  return added.length === 0 && kept.length === rows.length ? rows : [...kept, ...added];
}

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

/** The receipt persisted on the conversation's most recent sent message, if any. */
function lastPersistedReceipt(state: RootState, conversationId: string) {
  const entry = state.messages?.byConversationId?.[conversationId];
  const ids = entry?.orderedIds ?? [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const record = entry?.byId?.[ids[i]];
    if (record?.role !== "user") continue;
    const receipt = record.modelContext?.delivery?.receipt;
    if (receipt) return receipt;
  }
  return undefined;
}

const displayMemo = new Map<
  string,
  {
    rows: ResolvedContextRow[];
    receipt: unknown;
    expected: unknown;
    saved: unknown;
    out: ResolvedContextRow[];
  }
>();

/**
 * The rows the chip and the full view DISPLAY: `selectResolvedContextRows`,
 * with the values the server resolves itself (references, `*_id` lookups)
 * filled in from the latest receipt — their size and delivery are the server's
 * to report, never the client's to guess (`applyReceiptToRows`) — followed by
 * every value the SERVER added that turn (its own attachments, scope seeds,
 * saved off-rules: `compareReceipt(expected, receipt).systemRows`), each a
 * governable row with the normal Include switch and Inline max, saved under
 * the surface key the server filed it with. Display only: the send path and
 * the receipt check use the unfilled rows, and these rows carry no value, so
 * they can never reach the wire. No receipt yet: only the client's rows.
 */
export const selectDisplayContextRows =
  (conversationId: string, mandateKillSwitch = false) =>
  (state: RootState): ResolvedContextRow[] => {
    const rows = selectResolvedContextRows(conversationId, mandateKillSwitch)(state);
    // This session's latest receipt; on a fresh load, the receipt persisted on
    // the conversation's last sent message — so values the server adds every
    // turn (a durable attachment) show on load, not only after a send.
    const live = state.instanceContext?.receiptByConversationId?.[conversationId]?.receipt;
    const receipt = live ?? lastPersistedReceipt(state, conversationId);
    if (!receipt) return rows;
    // Request rows belong to the live receipt only.
    const expected = live ? state.instanceContext?.expectedByConversationId?.[conversationId] : undefined;
    const saved = selectSavedContextRuleRows(state);
    const hit = displayMemo.get(conversationId);
    if (
      hit &&
      hit.rows === rows &&
      hit.receipt === receipt &&
      hit.expected === expected &&
      hit.saved === saved
    ) {
      return hit.out;
    }
    const actual = toContextReceipt(receipt);
    const shown = new Set(rows.map((row) => row.key));
    // The rows nobody on this screen sent. Normally `compareReceipt` against
    // the rows the request was built from; when those are not held (a
    // persisted receipt, a send path that recorded none), every row the
    // client did not supply. Rows the client's CURRENT rows hold are its own.
    const unsent = expected
      ? compareReceipt(expected.rows, actual).systemRows
      : actual.rows.filter((row) => row.origin !== "client");
    // Each row shows the person's CURRENT rule (a switch they just flipped
    // reads flipped at once), over the layers the server applied last turn.
    const cap = selectContextInlineCap(state, conversationId);
    const primarySurface = resolveClientSurface(state, conversationId) ?? null;
    const serverAdded = systemRowsToResolved(unsent)
      .filter((row) => !shown.has(row.key))
      .map((row) => ({
        ...resolveContextRow(
          {
            key: row.key,
            label: row.label,
            surfaceKey: row.surfaceKey,
            origin: row.origin,
            value: undefined,
            chars: row.chars,
            layers: row.layers,
          },
          saved,
          cap,
          primarySurface,
        ),
        serverResolved: true,
        fromReceipt: true,
      }));
    // A value the server resolves is NAMED by the server too (a note reference
    // reads as the note's title), so a row filled from the receipt takes the
    // receipt's label with its numbers.
    const receiptLabel = (row: ResolvedContextRow) =>
      (actual.rows.find((r) => r.key === row.key && r.surface_key === row.surfaceKey) ??
        actual.rows.find((r) => r.key === row.key))?.label;
    const filled = applyReceiptToRows(rows, actual).map((row) => {
      const label = row.fromReceipt ? receiptLabel(row) : undefined;
      return label && label !== row.label ? { ...row, label } : row;
    });
    // WHAT THE MODEL READ (RULES.md §5 `delivered`): every row the receipt
    // carries it for shows the server's rendering, never the client's copy.
    const out = [...filled, ...serverAdded].map((row) => {
      const fields = deliveredFieldsFor(receipt, row.key, row.surfaceKey);
      return Object.keys(fields).length > 0 ? { ...row, ...fields } : row;
    });
    displayMemo.set(conversationId, { rows, receipt, expected, saved, out });
    return out;
  };

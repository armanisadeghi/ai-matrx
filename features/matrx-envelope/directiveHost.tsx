"use client";

/**
 * THE MATRX DIRECTIVE HOST for `@ai-matrx/content-ir-react`.
 *
 * The package owns the Kind Directives grammar, decoder, naming, item summary,
 * renderer registry, the side-effect card, the fallback floor and the Apply
 * control (`@ai-matrx/content-ir` 0.11.0 + `@ai-matrx/content-ir-react`
 * 0.11.0). It refuses to know six things that are HOST property, and this
 * module is all six of them, wired once:
 *
 *  1. `confirm` — `POST /directives/confirm` through `confirmDirective`, with
 *     this app's resolved backend base URL and Supabase session. The server
 *     re-validates every item against the model registered for that SLUG and
 *     runs the ONE handler as the user under RLS; handlers are idempotent, so a
 *     double-click cannot duplicate rows.
 *  2. `openItem` — the `directiveItemWindow` overlay (multi-instance: comparing
 *     two proposed items is the normal reason to open one at all).
 *  3. `renderCopy` — this app's `CopyButtons`, at the batch and at the item.
 *  4. `nouns` — the mirrored catalog (`catalog-nouns.generated.ts`).
 *  5. `itemKind` — THE DIRECTIVE⇄KIND SEAM, server-derived, `null` when honest.
 *  6. `reportError` — the Error Inspector (`captureError`).
 *
 * WHY THE STORE IS READ IMPERATIVELY. A `DirectiveHost` is a plain object, not
 * a component, so it cannot use hooks. The store singleton is the same store
 * the provider tree mounts, so `confirm`/`openItem` reach exactly the state and
 * dispatch a `useAppSelector` would — and the host stays a module singleton
 * whose identity never churns a memo inside the package. It is read through the
 * cycle-free leaf (`store-singleton`) rather than `@/lib/redux/store`, which
 * would drag the whole reducer/middleware graph into every chunk that renders a
 * directive. NOTHING FAILS SILENTLY: an unmounted store throws with the remedy
 * rather than returning a quietly wrong answer.
 */

import type {
  DirectiveHost,
  DirectiveValueRef,
  DirectiveApplyResult,
  DirectiveApplyState,
  DirectiveShell,
  DirectiveAskRequest,
  DirectiveCopyProps,
  DirectiveOpenItemOptions,
} from "@ai-matrx/content-ir-react";
import type {
  DirectiveItemKindLookup,
  DirectiveNounCatalog,
  DirectiveNounEntry,
} from "@ai-matrx/content-ir";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  DirectiveRecordLink,
  appliedRecords,
  useDirectiveRecordName,
  directiveConsequenceDialog,
} from "@/features/matrx-envelope/components/DirectiveConsequence";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  CATALOG_ALIASES,
  CATALOG_NOUNS,
  CATALOG_NOUN_DISPLAY,
  DIRECTIVE_ITEM_KINDS,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import {
  confirmDirective,
  fetchDirectiveApplyState,
} from "@/features/directive-catalog/service";
import type { DirectiveShellState } from "@/features/directive-catalog/types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { provideDirectiveHost } from "@/features/content-ir/host/directiveHostSlot";
import { invalidateReferenceLabel } from "@/features/matrx-envelope/referenceResolvers";
import { BackendApiError } from "@/lib/api/errors";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { selectOrganizations } from "@/features/scopes/redux/selectors/tree";
import { readDirectiveRecord } from "@/features/matrx-envelope/directiveRecordRow";
import { CATALOG_ENUM_FIELDS } from "@/features/matrx-envelope/catalog-enum-fields.generated";
import { valueWord } from "@/features/directive-catalog/valueVocabulary";
import { explainDirectiveFailure } from "@/features/matrx-envelope/directiveFailureWords";
import { referenceTypeDisplayLabel } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

const DIRECTIVE_ITEM_OVERLAY_ID = "directiveItemWindow" as const;

/**
 * THE AUTO-VIEW's naming half. A noun's LABEL is the one name the record type
 * has everywhere — the reference picker's (`referenceTypeDisplayLabel`), so a
 * card never says "Conversation" where the picker says "Chat". Family and title
 * column come from the catalog; a noun it does not carry has neither.
 * Guard: `__tests__/a-record-type-has-one-name.test.ts` (every noun and alias).
 */
export const matrxDirectiveNouns: DirectiveNounCatalog = (
  noun: string,
): DirectiveNounEntry | undefined => {
  // An alias reads as its canonical type.
  const canonical = (CATALOG_ALIASES as Record<string, string>)[noun] ?? noun;
  const display = CATALOG_NOUN_DISPLAY[canonical];
  const entry = CATALOG_NOUNS[canonical];
  // A type the catalog does not carry still has its one name (the picker's).
  // ONE record type, ONE name: the picker's display name, never the server
  // catalog's own word ("Chat", not "Conversation").
  const label = referenceTypeDisplayLabel(noun);
  // A group named like its type says nothing ("Create Chat · Chat").
  const family = display?.family && display.family !== label ? display.family : null;
  return {
    label,
    family,
    titleColumn: entry?.title_column ?? null,
  };
};

/**
 * THE DIRECTIVE⇄KIND SEAM. Server-derived (`ShapeSpec.item_kind` → the
 * published catalog manifest → `catalog-nouns.generated.ts`); `null` is HONEST,
 * never a gap-filler — an item model that is a plain Pydantic shape has no
 * kind, so the consumer degrades to the generic structured viewer.
 */
export const matrxDirectiveItemKind: DirectiveItemKindLookup = (
  slug: string,
): string | null => {
  const kind = (DIRECTIVE_ITEM_KINDS as Record<string, string | undefined>)[slug];
  return typeof kind === "string" && kind ? kind : null;
};

/**
 * ONE VALUE, ONE WORD — the package's `valueLabel` seam. A pick-list field's
 * stored value reads as the SAME word the write forms and the record's own
 * screens show (`valueWord`: a task's "incomplete" is "Inbox", a project's
 * "paused" is "Paused"); a field that is not a pick-list (per the server
 * catalog's schemas, `CATALOG_ENUM_FIELDS`) keeps its value as written. G8A
 * review, 2026-10-02: the card said "Status incomplete → completed".
 * Guard: `__tests__/a-value-has-one-word.test.ts` (every enum field in the
 * catalog snapshot).
 */
export function matrxDirectiveValueLabel({ noun, field, value }: DirectiveValueRef): string | null {
  const canonical = (CATALOG_ALIASES as Record<string, string>)[noun] ?? noun;
  const fields = CATALOG_ENUM_FIELDS[noun] ?? CATALOG_ENUM_FIELDS[canonical];
  if (!fields?.includes(field)) return null;
  return valueWord(noun, field, value);
}

/** The live store, or a stated failure — never a silent no-op. */
function requireStore() {
  const store = getStoreSingleton();
  if (!store) {
    throw new Error(
      "The Redux store is not mounted yet, so this directive cannot be applied. Reload the page and try again.",
    );
  }
  return store;
}

/**
 * THE CONSEQUENCE, NAMED BEFORE THE CLICK — the package's `ask` seam.
 *
 * A side-effect directive that lands in CONTENT renders as a card with an Apply
 * button (the package's `SideEffectDirectiveCard`). That button used to run a
 * server-side write on ONE unguarded click; then (9ea2888a3f) it asked, but in
 * words that named no record ("Delete this task?"), on a blue button, from
 * INSIDE `confirm` — so the card already read "Applying 1 item…" while the
 * question was still open (reviewer, 2026-09-30).
 *
 * Now the package calls `ask` FIRST and stays idle until the answer; the dialog
 * names every record by its live name (`DirectiveConsequence`), lists what an
 * update overwrites, and a delete is styled destructive and says where the
 * record goes — matching the Tasks page ("This moves 'X' to the trash.").
 *
 * `ProposedDirectivesZone` does NOT come through here (it calls
 * `confirmDirective` directly and already carries the server-composed
 * consequence sentence), so an agent proposal is not asked twice.
 *
 * Law: common-docs/policies/no-dead-ends.md — a generic
 * "Are you sure?" fails; the sentence has to name what changes.
 */
/** An organization id → its name, from the person's memberships (null when unknown). */
function organizationNameOf(organizationId: string): string | null {
  const store = getStoreSingleton();
  if (!store) return null;
  return selectOrganizations(store.getState())[organizationId]?.name?.trim() || null;
}

function ask(request: DirectiveAskRequest): Promise<boolean> {
  return askDirective(request);
}

/**
 * THE ONE QUESTION, for every surface that runs a directive: the cards (via
 * `ask`) and the admin builder (`surface: "admin"` — no "this text" there).
 */
export function askDirective(
  request: DirectiveAskRequest,
  { surface = "text" }: { surface?: "text" | "admin" } = {},
): Promise<boolean> {
  // The organization the write will land in — the one `authedDirectiveHeaders`
  // sends with every directive write (the active organization is for writes).
  const organizationName = selectActiveOrganizationName(requireStore().getState());
  // An update or delete reads its records first and holds its yes until it has
  // (`ready`) — a confirm never asks before it can say what it will do (G8A).
  return confirmDialog(
    directiveConsequenceDialog(request, matrxDirectiveNouns, organizationName, organizationNameOf, {
      valueLabel: matrxDirectiveValueLabel,
      surface,
    }),
  );
}

async function confirm(shell: DirectiveShell): Promise<DirectiveApplyResult> {
  const baseUrl = selectResolvedBaseUrl(requireStore().getState());
  try {
    const result = await confirmDirective(baseUrl, {
      // The SLUG is the identity — the server's DirectiveConfirmRequest refuses
      // to guess at what it is confirming.
      directive: shell.__kind,
      items: shell.items,
      // WHERE the card sits is its namespace: a chat message's conversation —
      // the same key the agent proposal's Approve uses, so one action never
      // applies twice — else (a note) the person's.
      ...(shell.conversationId ? { conversation_id: shell.conversationId } : {}),
      // "Run again", after the person said yes to a question that named it.
      ...(shell.force ? { force: true } : {}),
    });
    const records = appliedRecords(shell.__kind, result.receipts);
    // Every label, trash state and "old value" on screen naming a record this
    // apply changed reads it again — the card's own row never keeps the name it
    // just overwrote, and another card's confirm never shows the value this one
    // replaced (G7). The package's Apply announces the same records; this host
    // door covers any caller of `confirm` that is not the package's button.
    for (const record of records) invalidateReferenceLabel(record.id);
    return {
      applied: result.applied,
      failed: result.failed,
      // The server's own receipt sentence — never recomposed here (DD-118).
      message: result.message,
      // THE TALLY IS A DOOR: every record the apply wrote, so "Applied 1" is a
      // way into what was created/changed (no dead ends).
      records,
      // What an update replaced — the card's record of the change.
      before: beforeByIndex(result.receipts, shell.items.length),
    };
  } catch (error) {
    // Prefer the server's gentle user_message; never dump Pydantic/wire detail.
    // The package shows an Error's message verbatim, so it must already be safe.
    if (error instanceof BackendApiError) throw new Error(error.userMessage);
    throw error;
  }
}

/**
 * An update's replaced values for item `index`, read by NARROWING: aidream
 * ledgers `before` per item since 1122747fb5 (G6A review — the card draws
 * "old → new" from it after the apply, never from a live re-read), and the
 * generated contract in @ai-matrx/agents does not carry it yet. An older server
 * omits it → null, and the card says only what each field was set to.
 */
function beforeOf(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== "object" || !("before" in entry)) return null;
  const before = (entry as { before?: unknown }).before;
  return before && typeof before === "object" && !Array.isArray(before)
    ? (before as Record<string, unknown>)
    : null;
}

/** Per-item `before`, by the receipts' own `index` (a failed item has none). */
function beforeByIndex(
  receipts: ReadonlyArray<unknown>,
  count: number,
): Array<Record<string, unknown> | null> {
  const out: Array<Record<string, unknown> | null> = Array.from({ length: count }, () => null);
  receipts.forEach((receipt, position) => {
    const index =
      receipt && typeof receipt === "object" && "index" in receipt && typeof receipt.index === "number"
        ? receipt.index
        : position;
    if (index >= 0 && index < count) out[index] = beforeOf(receipt);
  });
  return out;
}

interface PendingStateRead {
  shell: DirectiveShell;
  resolve: (answer: DirectiveApplyState) => void;
  reject: (error: unknown) => void;
}

/** Every card that mounts in the same tick joins ONE `/directives/apply_state` read. */
let pendingStateReads: PendingStateRead[] = [];
let stateFlushQueued = false;

/**
 * One shell's per-item ledger answer → the card's three states.
 *  - every item applied → `applied`, with the ledger's own sentence (for ONE
 *    item; a batch line is never composed here) and every record it wrote;
 *  - any item mid-apply → `in_flight` (the card says it is finishing);
 *  - otherwise → `not_applied`: still approvable, and confirm replays any
 *    member the ledger already holds.
 * An unreadable shell is not "not applied" — it is unknown, so it rejects with
 * the server's reason and the card reports it.
 */
function toApplyState(state: DirectiveShellState): DirectiveApplyState {
  if (state.unreadable) throw new Error(state.unreadable);
  const items = state.items;
  if (items.length > 0 && items.every((item) => item.state === "applied")) {
    // `resource_ids` are the LATEST copy's (aidream `applied_summary`), so after
    // "Run again" the tally opens the newest record, not the first.
    const records = appliedRecords(
      state.directive,
      items.map((item) => ({ resource_kind: state.noun, resource_ids: item.resource_ids })),
    );
    const message = items.length === 1 ? (items[0].message ?? null) : null;
    // How many times the block has applied (1 + every Run again). The server
    // answers `copies` per item since aidream cc87e4e53c; the generated
    // contract in @ai-matrx/agents does not carry it yet, so it is read by
    // narrowing, never by a cast — an older server simply omits it (→ 1).
    const copies = Math.max(
      1,
      ...items.map((item) =>
        "copies" in item && typeof item.copies === "number" ? item.copies : 1,
      ),
    );
    return {
      state: "applied",
      message,
      records,
      copies,
      before: items.map((item) => beforeOf(item)),
    };
  }
  if (items.some((item) => item.state === "in_flight")) return { state: "in_flight" };
  return { state: "not_applied" };
}

async function flushStateReads(): Promise<void> {
  stateFlushQueued = false;
  const pending = pendingStateReads;
  pendingStateReads = [];
  // ONE read per namespace: the cards in one conversation together, a note's
  // cards (no conversation — the person's namespace) together.
  const byNamespace = new Map<string, PendingStateRead[]>();
  for (const read of pending) {
    const key = read.shell.conversationId ?? "";
    byNamespace.set(key, [...(byNamespace.get(key) ?? []), read]);
  }
  await Promise.all(
    [...byNamespace].map(([conversationId, batch]) => readNamespace(conversationId, batch)),
  );
}

async function readNamespace(conversationId: string, batch: PendingStateRead[]): Promise<void> {
  try {
    const baseUrl = selectResolvedBaseUrl(requireStore().getState());
    const result = await fetchDirectiveApplyState(
      baseUrl,
      {
        // The ledger is asked in the SAME namespace `confirm` applies in
        // (aidream `keys.human_door_namespace`): the conversation the card
        // renders in, else — a note — the person's.
        shells: batch.map((read) => ({ __kind: read.shell.__kind, items: read.shell.items })),
        ...(conversationId ? { conversation_id: conversationId } : {}),
      },
      // A background read never raises the organization picker — nobody pressed anything.
      { interactive: false },
    );
    batch.forEach((read, index) => {
      const state = result.shells[index];
      if (!state) {
        read.reject(new Error("The ledger read answered fewer blocks than it was asked about."));
        return;
      }
      try {
        read.resolve(toApplyState(state));
      } catch (error) {
        read.reject(error);
      }
    });
  } catch (error) {
    const safe = error instanceof BackendApiError ? new Error(error.userMessage) : error;
    batch.forEach((read) => read.reject(safe));
  }
}

/**
 * THE CARD SURVIVES A RELOAD — the package's `applyState` seam (0.14.0).
 *
 * After a reload the card's own state is gone; the server's action ledger is
 * not. Whether a block was applied is decided by a FROZEN server key over the
 * VALIDATED items, so the host asks (`POST /directives/apply_state`) — it never
 * computes. Reads are batched per tick so a note with ten cards costs one
 * request.
 */
function applyState(shell: DirectiveShell): Promise<DirectiveApplyState> {
  return new Promise<DirectiveApplyState>((resolve, reject) => {
    pendingStateReads.push({ shell, resolve, reject });
    if (!stateFlushQueued) {
      stateFlushQueued = true;
      setTimeout(() => void flushStateReads(), 0);
    }
  });
}

function openItem(options: DirectiveOpenItemOptions): void {
  const store = getStoreSingleton();
  if (!store) {
    // A control that cannot do its job SAYS SO. Silence here would read as a
    // dead row, which is the one thing the seam exists to prevent.
    captureError({
      source: "content-ir",
      message:
        "[kind-directives] Could not open the directive item: the Redux store is not mounted.",
      callSite: "matrxDirectiveHost.openItem",
      hint: "Reload the page — the overlay system needs the store.",
    });
    return;
  }
  const instanceId = `directive-item-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  store.dispatch(
    openOverlay({
      overlayId: DIRECTIVE_ITEM_OVERLAY_ID,
      instanceId,
      data: {
        windowInstanceId: instanceId,
        item: options.item,
        itemKind: options.itemKind,
        title: options.title,
        subtitle: options.subtitle,
      },
    }),
  );
}

/** Close one directive-item window (the opener's other half, for callers that keep a handle). */
export function closeDirectiveItemWindow(instanceId: string): void {
  getStoreSingleton()?.dispatch(
    closeOverlay({ overlayId: DIRECTIVE_ITEM_OVERLAY_ID, instanceId }),
  );
}

/**
 * A record row's copy control, labelled by the record's live name — the same
 * one the row shows — and "this task" (the package's type-generic label) while
 * it loads, never an id (G9).
 */
function RecordCopy({ props }: { props: DirectiveCopyProps & { record: NonNullable<DirectiveCopyProps["record"]> } }) {
  const { name } = useDirectiveRecordName(props.record.noun, props.record.id, props.label);
  return <ItemCopy {...props} label={name ?? props.label} />;
}

function renderCopy(props: DirectiveCopyProps) {
  return props.record ? <RecordCopy props={{ ...props, record: props.record }} /> : <ItemCopy {...props} />;
}

function ItemCopy({ label, value, kind, size }: DirectiveCopyProps) {
  return (
    <CopyButtons
      label={label}
      human={() => JSON.stringify(value, null, 2)}
      agent={{
        kind: kind ?? "matrx-directive",
        location: "AI Matrx — pending directive in a conversation",
        description: kind
          ? `One item of a pending directive (kind: ${kind}). Not yet applied.`
          : `A pending directive, proposed but NOT yet applied.`,
        data: value,
      }}
      json={value}
      size={size}
      appearance="bare"
    />
  );
}

/**
 * The single directive-host instance. A module singleton on purpose — the
 * registries and store it points at are singletons, and a per-render object
 * would churn every memo inside the package.
 */
export const matrxDirectiveHost: DirectiveHost = {
  ask,
  confirm,
  applyState,
  // An update card and its confirm say "old → new" from the record as it is now.
  readRecord: readDirectiveRecord,
  // A pick-list value reads as the app's word, on the card and in the confirm.
  valueLabel: matrxDirectiveValueLabel,
  renderRecord: (props) => <DirectiveRecordLink {...props} />,
  openItem,
  renderCopy,
  nouns: matrxDirectiveNouns,
  itemKind: matrxDirectiveItemKind,
  // A failure the app recognises gets its own plain words; the raw server text
  // stays behind the card's "Details".
  explainFailure: explainDirectiveFailure,
  reportError: (message: string) =>
    captureError({
      source: "content-ir",
      message,
      callSite: "matrxDirectiveHost",
      hint: "The emitter minted a slug outside the directive_v<version>_<class>_<noun> grammar.",
    }),
};

// The content-ir host reads this through a leaf slot, never by importing this
// module — that import closed a 13-module static cycle (G13). Guard:
// `pnpm check:host-cycles`.
provideDirectiveHost(matrxDirectiveHost);

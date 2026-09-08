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
  DirectiveApplyResult,
  DirectiveCopyProps,
  DirectiveOpenItemOptions,
} from "@ai-matrx/content-ir-react";
import type {
  DirectiveItemKindLookup,
  DirectiveNounCatalog,
  DirectiveNounEntry,
} from "@ai-matrx/content-ir";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  CATALOG_NOUNS,
  CATALOG_NOUN_DISPLAY,
  DIRECTIVE_ITEM_KINDS,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import { confirmDirective } from "@/features/directive-catalog/service";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { BackendApiError } from "@/lib/api/errors";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const DIRECTIVE_ITEM_OVERLAY_ID = "directiveItemWindow" as const;

/**
 * THE AUTO-VIEW's naming half: the catalog is the authority for a noun's label,
 * family and title column. A noun the mirror does not carry returns `undefined`
 * and the package degrades to a title-cased token — legible, honestly derived,
 * never blank.
 */
export const matrxDirectiveNouns: DirectiveNounCatalog = (
  noun: string,
): DirectiveNounEntry | undefined => {
  const display = CATALOG_NOUN_DISPLAY[noun];
  const entry = CATALOG_NOUNS[noun];
  if (!display && !entry) return undefined;
  return {
    label: display?.label ?? null,
    family: display?.family ?? null,
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

async function confirm(shell: {
  __kind: string;
  items: Record<string, unknown>[];
}): Promise<DirectiveApplyResult> {
  const baseUrl = selectResolvedBaseUrl(requireStore().getState());
  try {
    const result = await confirmDirective(baseUrl, {
      // The SLUG is the identity — the server's DirectiveConfirmRequest refuses
      // to guess at what it is confirming.
      directive: shell.__kind,
      items: shell.items,
    });
    return { applied: result.applied, failed: result.failed };
  } catch (error) {
    // Prefer the server's gentle user_message; never dump Pydantic/wire detail.
    // The package shows an Error's message verbatim, so it must already be safe.
    if (error instanceof BackendApiError) throw new Error(error.userMessage);
    throw error;
  }
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

function renderCopy({ label, value, kind, size }: DirectiveCopyProps) {
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
  confirm,
  openItem,
  renderCopy,
  nouns: matrxDirectiveNouns,
  itemKind: matrxDirectiveItemKind,
  reportError: (message: string) =>
    captureError({
      source: "content-ir",
      message,
      callSite: "matrxDirectiveHost",
      hint: "The emitter minted a slug outside the directive_v<version>_<class>_<noun> grammar.",
    }),
};

// features/window-panels/detail/DetailHost.tsx
//
// THE host binding for the Detail primitive (`lib/detail`) — the light half.
// Mounted once in app/Providers.tsx so `useOpenDetail()` works on every
// surface. Every line here injects APP IDENTITY into the package-shaped
// module; nothing here re-implements any of its logic:
//
//   presentation knob   → lib/scoped-config (the ONE ladder-resolved read of
//                         `ui.detail.default_presentation`, and the per-record
//                         -type map `ui.detail.presentation_by_type`).
//   save the setting    → lib/scoped-config/service (the platform write door).
//   open / close        → the typed overlay openers (`detailWindow`,
//                         `detailDocked`).
//   navigate            → next/navigation; `page` is the only presentation
//                         that changes the URL — and the only one that can be
//                         LEFT, which is why `canGoBack` / `toRecordHome` live
//                         here (D1).
//   doors               → EntityDoorControls / MatrxUuidCell / doors.ts.
//   associations        → which tokens may anchor and the default set.
//   history             → `public.version_list` (history.row_versions).
//   notify / copyText   → @/lib/toast and the app's clipboard funnel.
//
// The SHELLS (window / docked / page chrome) and the TYPE MAP (`resolveType`
// → the item-presentation registry through `resolveItemDetailType`, THE type
// map, never a second one) are NOT bound here: the window shell parses
// `WindowPanel` and the type map pulls the registry and the right-click menu,
// none of which belongs in a boot bundle. Each presentation's entry binds them
// right above the presentation (`shells/`, `detailTypeBinding.ts`).

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ASSOCIATION_TARGET_TYPES } from "@ai-matrx/associations";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";

import { DetailHostProvider, type DetailHostPorts, type DetailPresentationSetting } from "@/lib/detail/host";
import {
  DETAIL_PRESENTATION_BY_TYPE_KNOB,
  DETAIL_PRESENTATION_KNOB,
  isDetailPresentation,
  presentationForTypeFromMap,
  type DetailHistoryEntry,
  type DetailPresentation,
  type DetailRef,
} from "@/lib/detail/types";
import {
  getSessionKnob,
  resolveSessionKnob,
  useSessionKnob,
} from "@/lib/scoped-config/sessionKnob";
import { savePresentation } from "./savePresentation";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import {
  isUuidValue,
  resolveEntityDoors,
  tokenFromColumnName,
} from "@/components/official/entity-ref/doors";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { useCloseDetailDocked, useOpenDetailDocked } from "@/features/overlays/openers/detailDocked";
import { useCloseDetailWindow, useOpenDetailWindow } from "@/features/overlays/openers/detailWindow";
import { encodeListQuery } from "./detailOverlayData";

/** `/detail/<type>/<id>` — the page presentation's route. */
export function detailPageHref(
  ref: { type: string; id: string },
  extra?: { list?: { items: { type: string; id: string }[]; index: number } | null },
): string {
  return (
    `/detail/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.id)}` +
    encodeListQuery(extra?.list ?? null)
  );
}

// ─── Leaving the page presentation (D1) ─────────────────────────────────────

/**
 * 🚨 D1. The detail pages THIS TAB pushed. A `/detail/<type>/<id>` reached by a
 * pasted link, a new tab or a bookmark is NOT in here — and `back()` from one
 * of those left the tab on `about:blank` with the whole app gone
 * (VERIFY-U-P1, D1). Module scope, so it dies with the tab: a reload is a
 * fresh tab with a fresh history, and the set is empty again, which is the
 * safe answer.
 */
const pagesPushedInThisTab = new Set<string>();

function pageKey(ref: DetailRef): string {
  return `${ref.type}.${ref.id}`;
}

function markPagePushed(ref: DetailRef): void {
  pagesPushedInThisTab.add(pageKey(ref));
}

function pageWasPushedInThisTab(ref: DetailRef): boolean {
  return pagesPushedInThisTab.has(pageKey(ref));
}

/**
 * Where a detail page goes when it is left and nothing is behind it: the
 * record's own canonical route, or the dashboard when its type has none.
 * Never `about:blank`, never a route that does not exist.
 */
function recordHomeHref(ref: DetailRef, entityToken: string | null): string {
  const token = entityToken ?? ref.type;
  const href = resolveEntityDoors(token, ref.id).href;
  return href && href !== detailPageHref(ref) ? href : "/dashboard";
}

// ─── The presentation setting ───────────────────────────────────────────────

function describeSettingValue(raw: unknown): string {
  return `the setting holds ${JSON.stringify(raw)}, not one of window, docked or page`;
}

/**
 * PER-RECORD-TYPE OVERRIDE. `ui.detail.presentation_by_type` is a json map
 * (`{"file":"docked"}`) on the same organization → user ladder, read BEFORE
 * the platform default for the type being opened. Its knob row is seeded by
 * `migrations/detail_presentation_by_type_knob.sql`; until that file is
 * applied `knob_resolve` RAISES for the key by design, and that raise must not
 * cost the base setting its answer — so the miss is caught, announced once per
 * tab with the remedy, and the default answers.
 */
let byTypeUnavailable: string | null = null;

function noteByTypeUnavailable(error: unknown): undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (byTypeUnavailable !== message) {
    byTypeUnavailable = message;
    console.warn(
      `[detail] ${DETAIL_PRESENTATION_BY_TYPE_KNOB} could not be read (${message}). ` +
        "Per-record-type overrides are not being applied; every type opens as " +
        `${DETAIL_PRESENTATION_KNOB} says. Remedy: apply ` +
        "migrations/detail_presentation_by_type_knob.sql, which registers the key.",
    );
  }
  return undefined;
}

/** The effective presentation for this session and record type — failure named. */
function usePresentationSetting(type: string): DetailPresentationSetting {
  const raw = useSessionKnob(DETAIL_PRESENTATION_KNOB);
  const rawByType = useSessionKnob(DETAIL_PRESENTATION_BY_TYPE_KNOB);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveSessionKnob(DETAIL_PRESENTATION_KNOB)
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    void resolveSessionKnob(DETAIL_PRESENTATION_BY_TYPE_KNOB).catch(noteByTypeUnavailable);
    return () => {
      cancelled = true;
    };
  }, []);
  const forType = presentationForTypeFromMap(rawByType, type);
  if (forType) return { value: forType, error: null };
  if (raw === undefined) return { value: undefined, error };
  if (!isDetailPresentation(raw)) return { value: undefined, error: describeSettingValue(raw) };
  return { value: raw, error: null };
}

async function resolvePresentation(type: string): Promise<DetailPresentation> {
  const forType = await resolveSessionKnob(DETAIL_PRESENTATION_BY_TYPE_KNOB)
    .then((value) => presentationForTypeFromMap(value, type))
    .catch(noteByTypeUnavailable);
  if (forType) return forType;
  const raw = await resolveSessionKnob(DETAIL_PRESENTATION_KNOB);
  if (raw === undefined) {
    throw new Error("no organization is active in this session, so no setting could be resolved");
  }
  if (!isDetailPresentation(raw)) throw new Error(describeSettingValue(raw));
  return raw;
}

function warmPresentation(_type: string): void {
  void getSessionKnob(DETAIL_PRESENTATION_KNOB);
  void getSessionKnob(DETAIL_PRESENTATION_BY_TYPE_KNOB);
}

// ─── The remaining ports ────────────────────────────────────────────────────

async function listHistory(
  token: string,
  id: string,
  signal: AbortSignal,
): Promise<DetailHistoryEntry[]> {
  const { data, error } = await supabase
    .rpc("version_list", { p_token: token, p_id: id, p_limit: 50 })
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    version: r.version,
    operation: r.operation,
    actorId: r.actor_id ?? null,
    occurredAt: r.occurred_at,
    isCurrent: r.is_current,
  }));
}

const ANCHOR_TOKENS: ReadonlySet<string> = new Set(ASSOCIATION_TARGET_TYPES);

/** The record's own doors, pinned visible (a title bar is a touch-first row). */
function RecordDoors({ token, id, name }: { token: string; id: string; name?: string | null }) {
  return <EntityDoorControls token={token} id={id} name={name} alwaysShowActions />;
}

function RefCell({ value, label, token }: { value: string; label: string; token: string }) {
  return <MatrxUuidCell value={value} label={label} token={token} />;
}

export function DetailHost({ children }: { children: ReactNode }) {
  const router = useRouter();
  const openWindow = useOpenDetailWindow();
  const openDocked = useOpenDetailDocked();
  const closeWindow = useCloseDetailWindow();
  const closeDocked = useCloseDetailDocked();

  const ports: Omit<DetailHostPorts, "shells" | "resolveType"> = {
    usePresentationSetting,
    resolvePresentation,
    warmPresentation,
    savePresentation,
    open: ({ presentation, data }) => {
      if (presentation === "docked") openDocked(data);
      else openWindow(data);
    },
    close: (presentation) => {
      if (presentation === "docked") closeDocked();
      else closeWindow();
    },
    navigate: {
      pageHref: detailPageHref,
      toPage: (ref, extra) => {
        markPagePushed(ref);
        router.push(detailPageHref(ref, extra));
      },
      back: () => router.back(),
      canGoBack: pageWasPushedInThisTab,
      toRecordHome: (ref, entityToken) => router.replace(recordHomeHref(ref, entityToken)),
    },
    doors: { RecordDoors, RefCell, tokenFromColumnName, isUuidValue },
    associations: {
      defaultTokens: ["task", "note", "file", "project"],
      canAnchor: (token) => ANCHOR_TOKENS.has(token),
    },
    history: { list: listHistory },
    notify: {
      error: (message) => toast.error(message),
      success: (message) => toast.success(message),
    },
    copyText: (text) => copyToClipboard(text, { formatJson: false }),
  };

  return <DetailHostProvider ports={ports}>{children}</DetailHostProvider>;
}

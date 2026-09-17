// features/window-panels/detail/DetailHost.tsx
//
// THE host binding for the Detail primitive (`lib/detail`) — the light half.
// Mounted once in app/Providers.tsx so `useOpenDetail()` works on every
// surface. Every line here injects APP IDENTITY into the package-shaped
// module; nothing here re-implements any of its logic:
//
//   presentation knob   → lib/scoped-config (the ONE ladder-resolved read of
//                         `ui.detail.default_presentation`).
//   open / close        → the typed overlay openers (`detailWindow`,
//                         `detailDocked`).
//   navigate            → next/navigation; `page` is the only presentation
//                         that changes the URL.
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
  DETAIL_PRESENTATION_KNOB,
  isDetailPresentation,
  type DetailHistoryEntry,
  type DetailPresentation,
} from "@/lib/detail/types";
import { getSessionKnob, resolveSessionKnob, useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { isUuidValue, tokenFromColumnName } from "@/components/official/entity-ref/doors";
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

function describeSettingValue(raw: unknown): string {
  return `the setting holds ${JSON.stringify(raw)}, not one of window, docked or page`;
}

/** The effective presentation for this session — with its failure named. */
function usePresentationSetting(_type: string): DetailPresentationSetting {
  const raw = useSessionKnob(DETAIL_PRESENTATION_KNOB);
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
    return () => {
      cancelled = true;
    };
  }, []);
  if (raw === undefined) return { value: undefined, error };
  if (!isDetailPresentation(raw)) return { value: undefined, error: describeSettingValue(raw) };
  return { value: raw, error: null };
}

async function resolvePresentation(_type: string): Promise<DetailPresentation> {
  const raw = await resolveSessionKnob(DETAIL_PRESENTATION_KNOB);
  if (raw === undefined) {
    throw new Error("no organization is active in this session, so no setting could be resolved");
  }
  if (!isDetailPresentation(raw)) throw new Error(describeSettingValue(raw));
  return raw;
}

function warmPresentation(_type: string): void {
  void getSessionKnob(DETAIL_PRESENTATION_KNOB);
}

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
      toPage: (ref, extra) => router.push(detailPageHref(ref, extra)),
      back: () => router.back(),
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

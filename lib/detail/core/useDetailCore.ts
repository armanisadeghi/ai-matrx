// lib/detail/core/useDetailCore.ts
//
// THE core, as state: resolve the registration, load the row, derive title /
// about / fields / health, and the list-navigation + presentation-switch
// commands every presentation's header uses. The three presentations differ
// only in which shell they hand this to.

"use client";

import { useEffect } from "react";

import { requireResolveType, useDetailHost } from "../host";
import { useDetailKeyboard, type DetailKeyboard } from "../useDetailKeyboard";
import { useDetailRecord } from "../useDetailRecord";
import type {
  DetailField,
  DetailFrameContext,
  DetailInstanceData,
  DetailListContext,
  DetailPresentation,
  DetailRecordType,
  DetailRef,
  DetailRow,
  DetailSourceHealth,
  DetailStatus,
} from "../types";

export interface DetailCore {
  ref: DetailRef;
  data: DetailInstanceData;
  presentation: DetailPresentation;
  /** `null` when the host has no registration for this type — the body says so. */
  recordType: DetailRecordType | null;
  status: DetailStatus;
  /** Set when `status === "error"`. */
  errorMessage: string | null;
  row: DetailRow | null;
  title: string;
  /** The title is a stand-in (loading / not found / failed), not a record's name. */
  titleIsStandIn: boolean;
  /** Human label for the record type ("File"), for a header that must say what this is. */
  typeLabel: string;
  about: string | null;
  fields: DetailField[];
  health: DetailSourceHealth | null;
  /** The entity token doors / associations / history key off; null = none. */
  entityToken: string | null;
  frameCtx: DetailFrameContext | null;
  keyboard: DetailKeyboard;
  list: {
    context: DetailListContext | null;
    hasPrev: boolean;
    hasNext: boolean;
    prev: () => void;
    next: () => void;
  };
  /** Re-open this record in another presentation and leave the current one. */
  switchTo: (presentation: DetailPresentation) => void;
  close: () => void;
}

function neighbour(list: DetailListContext | null, delta: 1 | -1): DetailRef | null {
  if (!list) return null;
  const target = list.index + delta;
  if (target < 0 || target >= list.items.length) return null;
  return list.items[target] ?? null;
}

export function useDetailCore(
  data: DetailInstanceData,
  presentation: DetailPresentation,
  options: { onClose: () => void },
): DetailCore {
  const host = useDetailHost();
  const ref: DetailRef = { type: data.type, id: data.id };
  const recordType = requireResolveType(host)(data.type);
  const state = useDetailRecord(recordType, data.id);

  const row = state.status === "ready" ? state.row : null;
  const typeLabel = recordType?.label ?? data.type;
  const seedName = data.seed?.name?.trim() || null;
  // 🚨 D5 — A FAILED OR UNFINISHED LOAD NEVER CLAIMS A RECORD. The
  // registration's `title()` answers `Untitled <Label>` when it has no row,
  // which read as a real, unnamed record sitting above its own error notice
  // (VERIFY-U-P1, D5). A title is invented ONLY from something that exists:
  // the loaded row, or the name the opener already knew (the seed). With
  // neither, the header says what is actually happening and marks itself a
  // stand-in so the presentations can render it as one.
  const loadedTitle =
    (state.status === "ready" || state.status === "none") && recordType
      ? recordType.title(row, data.seed)
      : null;
  const standInTitle =
    state.status === "not-found"
      ? `This ${typeLabel.toLowerCase()} could not be found`
      : state.status === "error"
        ? `This ${typeLabel.toLowerCase()} could not be loaded`
        : `Loading this ${typeLabel.toLowerCase()}…`;
  const titleIsStandIn = !loadedTitle && !seedName;
  const title = loadedTitle ?? seedName ?? standInTitle;
  const about = data.seed?.about?.trim() || null;
  const fields: DetailField[] =
    row && recordType ? recordType.fields(row) : [];
  const health = row && recordType?.health ? recordType.health(row) : null;
  const entityToken = recordType?.entityToken ?? null;

  const frameCtx: DetailFrameContext | null = recordType
    ? {
        ref,
        recordType,
        title,
        about,
        status: state.status,
        fields,
        presentation,
      }
    : null;

  // Keep the setting warm for this type so a switch or a neighbour opens
  // without an awaited round-trip.
  const warmPresentation = host.warmPresentation;
  useEffect(() => {
    warmPresentation(data.type);
  }, [warmPresentation, data.type]);

  const openNeighbour = (delta: 1 | -1) => {
    const target = neighbour(data.list, delta);
    if (!target || !data.list) return;
    const list: DetailListContext = { items: data.list.items, index: data.list.index + delta };
    const next: DetailInstanceData = { ...target, seed: null, list };
    if (presentation === "page") {
      host.navigate.toPage(target, { list });
    } else {
      host.open({ presentation, data: next });
    }
  };

  const close = () => options.onClose();

  const switchTo = (target: DetailPresentation) => {
    if (target === presentation) return;
    if (target === "page") {
      host.navigate.toPage(ref, { seed: data.seed, list: data.list });
      if (presentation !== "page") host.close(presentation);
      return;
    }
    host.open({ presentation: target, data });
    if (presentation !== "page") {
      host.close(presentation);
      return;
    }
    // 🚨 D1 — THE PAGE IS LEFT FOR A REAL DESTINATION, NEVER `back()` BLINDLY.
    // `/detail/<type>/<id>` is reached by a shared deep link as often as by an
    // in-app push, and a tab opened straight onto it has NO history entry
    // behind it: `back()` there left the person on `about:blank` with the app
    // gone (VERIFY-U-P1, D1). The window is already open by this line, so the
    // page must go somewhere that exists — back only when this tab actually
    // came from somewhere, otherwise the record's own home.
    if (host.navigate.canGoBack(ref)) host.navigate.back();
    else host.navigate.toRecordHome(ref, entityToken);
  };

  const hasPrev = neighbour(data.list, -1) !== null;
  const hasNext = neighbour(data.list, 1) !== null;

  const keyboard = useDetailKeyboard({
    onClose: close,
    onPrev: hasPrev ? () => openNeighbour(-1) : null,
    onNext: hasNext ? () => openNeighbour(1) : null,
  });

  return {
    ref,
    data,
    presentation,
    recordType,
    status: state.status,
    errorMessage: state.status === "error" ? state.message : null,
    row,
    title,
    titleIsStandIn,
    typeLabel,
    about,
    fields,
    health,
    entityToken,
    frameCtx,
    keyboard,
    list: {
      context: data.list,
      hasPrev,
      hasNext,
      prev: () => openNeighbour(-1),
      next: () => openNeighbour(1),
    },
    switchTo,
    close,
  };
}

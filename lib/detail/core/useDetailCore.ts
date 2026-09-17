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
  const title =
    recordType?.title(row, data.seed) ??
    data.seed?.name?.trim() ??
    `Untitled ${data.type}`;
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
    if (presentation === "page") {
      host.navigate.back();
    } else {
      host.close(presentation);
    }
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

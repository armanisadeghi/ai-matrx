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
  /**
   * 🚨 NEW-9 — WHETHER THE RECORD'S OWN DOORS MAY SHOW. A question about the
   * RECORD, not about its name: a record that exists but stores nothing more
   * here still opens in its home, and a title that could not be loaded has no
   * record behind it to open. The header hung the doors off `titleIsStandIn`,
   * which is why a type with no source became a named dead end.
   */
  doorsAvailable: boolean;
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
  /**
   * 🚨 D1 — THE ONE EXIT FROM THE PAGE PRESENTATION. Back chevron, Escape and
   * a switch that leaves the route all come here; no host, route or shell may
   * call `back()` itself.
   */
  leave: () => void;
  close: () => void;
}

function entityTokenOf(recordType: DetailRecordType | null): string | null {
  return recordType?.entityToken ?? null;
}

/** One console line per subject per tab — a remedy, never a per-render spam. */
const announced = new Set<string>();
function announceOnce(key: string, message: string): void {
  if (announced.has(key)) return;
  announced.add(key);
  console.warn(message);
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
  /**
   * `onClose` is how an IN-PLACE presentation is dismissed (the overlay's
   * close). The page presentation needs none: it is left through `leave`,
   * which is the guarded exit — see `close` below.
   */
  options: { onClose?: () => void },
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
  //
  // 🚨 NEW-1 (VERIFY-U-P1-R2) — `none` IS NOT A LOADED ROW EITHER. A record
  // type with no `detailSource` resolves to `status: "none"`, and treating that
  // as a successful load put the registration's invented `Untitled <Label>` in
  // the header, in foreground weight, with the record's DOORS beside it, above
  // a body saying no details were available. Every unregistered type — the
  // agent-emitted type the registry deliberately supports — landed there. Only
  // `ready` is a loaded row; `none` gets the honest absent state below.
  const loadedTitle =
    state.status === "ready" && recordType ? recordType.title(row, data.seed) : null;
  //
  // 🚨 NEW-9 (VERIFY-U-P1-R3) — AND THE `none` STAND-IN IS NEVER A SENTENCE.
  // Round 2's fix put "No detail is registered for session records" in the
  // header, which is where the record's NAME goes: the screen named a real
  // record with a developer's sentence, printed a repo path in the body, and
  // dropped the doors, so a session (or a note reached by `/detail/note/<id>`)
  // became a named dead end. A record that exists but stores nothing more here
  // is named from what is certain — its type and its own id — the body says in
  // one plain sentence that there is nothing more, and the doors stay.
  const shortId = data.id.length > 8 ? data.id.slice(0, 8) : data.id;
  const standInTitle =
    state.status === "not-found"
      ? `This ${typeLabel.toLowerCase()} could not be found`
      : state.status === "error"
        ? `This ${typeLabel.toLowerCase()} could not be loaded`
        : state.status === "none"
          ? `${typeLabel} ${shortId}`
          : `Loading this ${typeLabel.toLowerCase()}…`;
  const titleIsStandIn = !loadedTitle && !seedName;
  const title = loadedTitle ?? seedName ?? standInTitle;
  // The record plausibly exists: only a failed or missing read says otherwise.
  const doorsAvailable =
    entityTokenOf(recordType) !== null &&
    state.status !== "not-found" &&
    state.status !== "error";
  const about = data.seed?.about?.trim() || null;
  const fields: DetailField[] =
    row && recordType ? recordType.fields(row) : [];
  const health = row && recordType?.health ? recordType.health(row) : null;
  const entityToken = entityTokenOf(recordType);

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

  // 🚨 NEW-9 — THE REMEDY GOES WHERE THE DEVELOPER IS. The person sees a plain
  // sentence; the registry instruction is a console warning, once per type per
  // tab, so it is impossible to miss in development and impossible to read on a
  // screen in production.
  useEffect(() => {
    if (!recordType) {
      announceOnce(
        `no-type:${data.type}`,
        `[detail] Nothing is registered for the record type "${data.type}", so its detail shows ` +
          "the type, the id and the doors only. Remedy: add an entry for it in the item registry " +
          "(features/item-presentation/registry.tsx).",
      );
      return;
    }
    if (state.status === "none") {
      announceOnce(
        `no-source:${data.type}`,
        `[detail] The record type "${data.type}" has no \`detailSource\`, so its detail can show ` +
          "nothing beyond what the opener already knew. Remedy: give the type a `detailSource` in " +
          "the item registry (features/item-presentation/registry.tsx), or leave it sourceless " +
          "deliberately and say why there.",
      );
    }
  }, [recordType, state.status, data.type]);

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
      // 🚨 NEW-14 — one history entry for the whole detail visit: moving to a
      // neighbour REPLACES the entry showing the current record, so Back leaves
      // to the list instead of walking back through every record arrowed past.
      host.navigate.toPage(target, { list, replacing: ref });
    } else {
      host.open({ presentation, data: next });
    }
  };

  /**
   * 🚨 D1 — LEAVING THE PAGE, ONCE, FOR A DESTINATION THAT EXISTS.
   * `/detail/<type>/<id>` is reached by a shared deep link as often as by an
   * in-app push, and a tab opened straight onto it has NO history entry behind
   * it: `back()` there leaves the person on `about:blank` with the app gone
   * (VERIFY-U-P1 D1). Round 1 guarded the presentation SWITCH only, and
   * VERIFY-U-P1-R2 reproduced the same failure through the page header's Back
   * chevron and through Escape, because the route handed the presentation a raw
   * `router.back()`. The decision lives here now — the one place that knows the
   * record and its token — so every control that leaves the page inherits it.
   */
  const leave = () => {
    if (host.navigate.canGoBack(ref)) host.navigate.back();
    else host.navigate.toRecordHome(ref, entityToken);
  };

  const close = () => {
    if (presentation === "page") {
      leave();
      return;
    }
    if (!options.onClose) {
      throw new Error(
        "[detail] The " +
          presentation +
          " presentation was mounted without an `onClose`, so nothing can dismiss it. " +
          "Pass the overlay's close from the presentation's entry.",
      );
    }
    options.onClose();
  };

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
    // The new presentation is already open by this line, so the page must go
    // somewhere that exists: the ONE guarded exit (D1).
    leave();
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
    doorsAvailable,
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
    leave,
    close,
  };
}

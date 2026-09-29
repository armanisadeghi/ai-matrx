"use client";

/**
 * Opener for the `saveToTable` overlay — THE one "Save to a table" (lane SAVE-AS-TABLE-EVERYWHERE,
 * 2026-09-29). Every surface that shows a table, a list, `Key: value` lines, CSV/TSV, a kind value or
 * JSON rows opens THIS: the rich-document registry action (chat ⋯ and right-click, notes, every
 * RichDocument), the table "Save to" menu, the canvas table artifact, the CSV/JSON/data-table blocks,
 * the selection toolbar. None builds its own dialog. Hand-maintained opener — see
 * features/overlays/FEATURE.md.
 */

import { useCallback, useContext } from "react";
import { ReactReduxContext } from "react-redux";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createSaveToTableCallbackGroup,
  type SaveToTableHandlers,
} from "@/features/overlays/callbacks/saveToTable";

const OVERLAY_ID = "saveToTable" as const;

export interface OpenSaveToTableOptions extends SaveToTableHandlers {
  /** Markdown, CSV/TSV, a note, an answer — every shape in it is offered. */
  text?: string;
  /** A kind value or JSON rows (must be plain JSON). */
  value?: unknown;
  /** Rows a renderer already holds. */
  grid?: { headers: string[]; rows: string[][] };
  /** What it came from, in words — offered as the new table's name. */
  title?: string | null;
  /** When the text holds several shapes, the one to open on. */
  shapeIndex?: number;
  /** The organization the content belongs to; absent → the active one (the picker holds when none). */
  organizationId?: string | null;
}

export interface SaveToTableHandle {
  instanceId: string;
  close: () => void;
}

/**
 * The opener, or `null` where there is no app store to open an overlay in (a block rendered on a
 * bare page, a server render, a test harness): the caller then draws no "Save to a table" control
 * rather than one that throws or does nothing.
 */
export function useOpenSaveToTable(): ((options: OpenSaveToTableOptions) => SaveToTableHandle) | null {
  const redux = useContext(ReactReduxContext);
  const dispatch = redux?.store.dispatch ?? null;
  const open = useCallback(
    (options: OpenSaveToTableOptions): SaveToTableHandle => {
      const instanceId = `saveToTable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const callbacks = options.onSaved ? createSaveToTableCallbackGroup({ onSaved: options.onSaved }) : null;
      dispatch?.(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            text: options.text ?? null,
            value: options.value === undefined ? null : options.value,
            hasValue: options.value !== undefined,
            grid: options.grid ?? null,
            title: options.title ?? null,
            shapeIndex: options.shapeIndex ?? 0,
            organizationId: options.organizationId ?? null,
            callbackGroupId: callbacks?.callbackGroupId ?? null,
          },
        }),
      );
      return {
        instanceId,
        close: () => {
          dispatch?.(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
          callbacks?.dispose();
        },
      };
    },
    [dispatch],
  );
  return dispatch ? open : null;
}

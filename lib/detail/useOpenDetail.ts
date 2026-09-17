// lib/detail/useOpenDetail.ts
//
// THE ONE OPENER. Every surface that names a record and wants its detail
// calls this; nothing else decides how a record opens. It resolves the
// person's setting (`ui.detail.default_presentation`, per record type), opens
// in place, and never navigates away — `page` is the only presentation that
// changes the URL, and it offers "open as window" back.

"use client";

import { useEffect } from "react";

import { useDetailHost } from "./host";
import {
  DETAIL_PRESENTATION_KNOB,
  type DetailInstanceData,
  type DetailOpenRequest,
  type DetailPresentation,
} from "./types";

export type OpenDetail = (request: DetailOpenRequest) => Promise<DetailPresentation>;

/**
 * @param warmType a record type this surface will open — its setting is
 * resolved on mount so the click is synchronous.
 */
export function useOpenDetail(warmType?: string | null): OpenDetail {
  const host = useDetailHost();

  useEffect(() => {
    if (warmType) host.warmPresentation(warmType);
  }, [host, warmType]);

  return async (request) => {
    const data: DetailInstanceData = {
      type: request.type,
      id: request.id,
      seed: request.seed ?? null,
      list: request.list ?? null,
    };
    let presentation = request.presentation;
    if (!presentation) {
      try {
        presentation = await host.resolvePresentation(request.type);
      } catch (error: unknown) {
        // The knob resolver RAISES for an unregistered key by design. The
        // stand-in announces itself with the remedy and uses the platform
        // default the knob would have carried.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[detail] ${DETAIL_PRESENTATION_KNOB} could not be resolved`, error);
        host.notify.error(
          `Your detail presentation setting could not be read (${DETAIL_PRESENTATION_KNOB}: ${message}). ` +
            "Opening as a window until it can be read; an administrator can register or repair the setting.",
        );
        presentation = "window";
      }
    }
    if (presentation === "page") {
      host.navigate.toPage({ type: data.type, id: data.id }, { seed: data.seed, list: data.list });
    } else {
      host.open({ presentation, data });
    }
    return presentation;
  };
}

"use client";

/**
 * useSourcePartsText — the full text of one Source's parts, read only when a
 * person searches its parts by words.
 *
 * The manifest never carries bodies (only each part's opening words, A5), so a
 * word that sits deep inside a part is found by reading the Source once
 * through THE one server step (`POST /sources/resolve`, the same text the run
 * receives) and splitting it back into parts by their ids. One read per Source
 * and form per page load; nothing is persisted.
 */

import { useEffect, useState } from "react";
import { createSourceRef, createSourceSet, type SourceRef } from "@ai-matrx/agents/sources";
import { resolveSourceSet } from "./sourceSetApi";
import { partTextFromGrounded, type PartTextIndex } from "./partsSearch";

const cache = new Map<string, Promise<PartTextIndex>>();

function keyOf(ref: SourceRef): string {
  return `${ref.resource_type}:${ref.resource_id}:${ref.representation ?? ""}`;
}

/** Read (once) the whole Source in the chosen form, split by part id. */
export function readSourcePartsText(ref: SourceRef): Promise<PartTextIndex> {
  const key = keyOf(ref);
  let pending = cache.get(key);
  if (!pending) {
    // The whole Source in the chosen form: no parts, no limit, text included.
    const whole = createSourceRef(ref.resource_type, ref.resource_id, {
      representation: ref.representation,
    });
    pending = resolveSourceSet(createSourceSet([whole])).then((resolved) =>
      partTextFromGrounded(resolved.sources[0]?.text ?? ""),
    );
    // A failed read is not remembered — the next search asks again.
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

export interface SourcePartsText {
  text: PartTextIndex | undefined;
  /** Reading the Source's text so words inside a part can be found. */
  reading: boolean;
  /** Said under the search when the text could not be read (the preview still matches). */
  error: string | null;
}

export function useSourcePartsText(ref: SourceRef | null, enabled: boolean): SourcePartsText {
  const [state, setState] = useState<{ key: string; text?: PartTextIndex; error?: string } | null>(
    null,
  );
  const key = ref ? keyOf(ref) : null;
  useEffect(() => {
    if (!enabled || !ref || !key) return undefined;
    let live = true;
    readSourcePartsText(ref)
      .then((text) => live && setState({ key, text }))
      .catch(
        () =>
          live &&
          setState({
            key,
            error:
              "Only part titles and opening words are searched — the full text could not be read just now.",
          }),
      );
    return () => {
      live = false;
    };
    // `ref` is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  const mine = state && state.key === key ? state : null;
  return {
    text: mine?.text,
    reading: enabled && !!key && !mine,
    error: mine?.error ?? null,
  };
}

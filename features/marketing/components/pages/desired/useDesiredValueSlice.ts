"use client";

/**
 * useDesiredValueSlice — the ONE local-state contract for a card's desired-
 * value area (web.page.desired_values[key]).
 *
 *   - seeds the draft from the row's slice;
 *   - reseeds ONLY when the server slice changes while the draft is clean —
 *     another card's save (which refetches the whole page) can never wipe an
 *     in-progress edit here;
 *   - saves ONLY this key through the single read-merge-write mutation
 *     (updatePageDesiredValues), so sibling areas are never clobbered.
 */

import { useState } from "react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useUpdatePageDesiredValues } from "@/features/marketing/data/hooks";
import {
  readPageDesiredValues,
  type MarketingPage,
  type PageDesiredValues,
  type PageDesiredValuesKey,
} from "@/features/marketing/types";

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export interface DesiredValueSlice<K extends PageDesiredValuesKey> {
  draft: PageDesiredValues[K] | undefined;
  setDraft: (value: PageDesiredValues[K] | undefined) => void;
  dirty: boolean;
  saving: boolean;
  save: () => Promise<void>;
  /** Reset the draft back to the server slice. */
  reset: () => void;
}

export function useDesiredValueSlice<K extends PageDesiredValuesKey>(
  page: MarketingPage,
  key: K,
): DesiredValueSlice<K> {
  const serverValue = readPageDesiredValues(page)[key];
  const serverJson = stable(serverValue);
  const [draft, setDraft] = useState<PageDesiredValues[K] | undefined>(
    serverValue,
  );
  // The seed is state, not a ref: `dirty` is rendered (it enables Save), so a
  // ref mutation would leave it showing a stale answer until something else
  // re-rendered the card.
  const [seededFrom, setSeededFrom] = useState(serverJson);
  const dirty = stable(draft) !== seededFrom;

  // Reseed while clean — adjusted during render (React's documented
  // "derive state from props" pattern), never via an effect, so there is no
  // second render pass and no cascade.
  if (serverJson !== seededFrom && !dirty) {
    setSeededFrom(serverJson);
    setDraft(serverValue);
  }

  const mutation = useUpdatePageDesiredValues();

  const save = async () => {
    try {
      const patch = { [key]: draft } as Partial<PageDesiredValues>;
      await mutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        patch,
      });
      setSeededFrom(stable(draft));
      toast.success("Desired values saved");
    } catch (error) {
      toast.error("Could not save desired values", {
        description: extractErrorMessage(error),
      });
    }
  };

  const reset = () => {
    setSeededFrom(serverJson);
    setDraft(serverValue);
  };

  return { draft, setDraft, dirty, saving: mutation.isPending, save, reset };
}

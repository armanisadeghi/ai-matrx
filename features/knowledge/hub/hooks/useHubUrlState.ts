"use client";

/**
 * The hub's state, read from and written to the URL — the ONE store for the
 * view, the query, the layout and the peek (Linear: filters in the address).
 * Filter / view / layout changes push history (Back undoes them); typing and
 * the peek replace it so Back is not a keystroke-by-keystroke rewind.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  hubHref,
  hubStateFromParams,
  type HubState,
} from "@/features/knowledge/hub/hubState";

export interface HubUrlState {
  state: HubState;
  /** Write a new state. `replace` for typing and peek; push otherwise. */
  setState: (next: HubState, opts?: { replace?: boolean }) => void;
  pending: boolean;
}

export function useHubUrlState(): HubUrlState {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const state = hubStateFromParams(params);
  const setState = (next: HubState, opts: { replace?: boolean } = {}) => {
    const href = hubHref(next);
    startTransition(() => {
      if (opts.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  };
  return { state, setState, pending };
}

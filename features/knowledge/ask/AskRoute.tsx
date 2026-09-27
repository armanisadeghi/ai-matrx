"use client";

/**
 * `/knowledge/ask` — Ask on its own page, over the filter in the URL (the same
 * address format as the hub: `?q=…&types=…&kinds=…&within=…`). The hub docks
 * `AskPanel` beside its results; this page is where a shared Ask link lands and
 * the fallback seat for ⌘↵ until the hub mounts the dock. Close returns to the
 * hub with the same filter.
 */

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AskPanel } from "@/features/knowledge/ask/AskPanel";
import {
  DEFAULT_HUB_STATE,
  hubStateFromParams,
  hubStateToParams,
} from "@/features/knowledge/hub/hubState";

export function AskRoute() {
  const params = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { query } = hubStateFromParams(params);

  const backToHub = () => {
    const p = hubStateToParams({ ...DEFAULT_HUB_STATE, query: { ...query, mode: "find" } });
    const qs = p.toString();
    startTransition(() => router.push(qs ? `/knowledge?${qs}` : "/knowledge"));
  };

  return (
    <div className="flex h-full justify-center overflow-hidden bg-textured pt-[var(--shell-header-h)]">
      <AskPanel query={query} onClose={backToHub} className="w-full max-w-2xl border-r" />
    </div>
  );
}

export default AskRoute;

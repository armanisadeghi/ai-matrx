"use client";

// features/spaces/workspace/SpacesHome.tsx — /spaces opens the last Space visited, else the first one.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LAST_SPACE_KEY, useSpaces } from "../state/SpacesProvider";

export function SpacesHome() {
  const router = useRouter();
  const { ready, byId, childrenOf } = useSpaces();
  const first = childrenOf(null)[0]?.id ?? null;
  useEffect(() => {
    if (!ready) return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_SPACE_KEY);
    } catch {
      last = null;
    }
    const target = last && byId.has(last) ? last : first;
    if (target) router.replace(`/spaces/${target}`);
  }, [ready, first, byId, router]);
  return <div className="spaces-page" aria-busy="true" />;
}

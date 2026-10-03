"use client";

// lib/entity-list/useLaneParam.ts
//
// THE LANE AS URL STATE, for a list that is NOT an <EntityListPage> (a card
// manager, a side panel). The shell keeps the same `?scope=` through
// `urlQuery.ts`; this is the standalone face of it, beside `useOrgFilterParam`:
//
//   const [lane, setLane] = useLaneParam("webhooks", ["all", "mine", "team", "orgs"]);
//
// Where the list opens: a lane the address names wins; otherwise the Feature
// Knob `lists.landing_tab/<token>` (platform value `all`, organization and person
// may override) through `defaultListScopeFor`; until that answers, All. A lane
// the person picks is always written, so a knob that lands on Mine can never
// pull them back from All on reload. Never the active organization.

import { useEffect, useState } from "react";
import { commitUrlParams } from "@ai-matrx/kit/url-state";
import { defaultListScopeFor } from "@/lib/list-scope";
import { DEFAULT_LIST_SCOPE, type ListScopeKind } from "@/lib/list-scope/types";
import { useListSearchParams } from "./useListSearchParams";
import { ENTITY_LIST_URL_PARAMS } from "./urlQuery";

export function useLaneParam(
  token: string,
  offered: readonly ListScopeKind[],
): [ListScopeKind, (lane: ListScopeKind) => void] {
  const params = useListSearchParams();
  const named = params.get(ENTITY_LIST_URL_PARAMS.scope) as ListScopeKind | null;
  const fromUrl = named && offered.includes(named) ? named : null;
  const [landing, setLanding] = useState<ListScopeKind>(DEFAULT_LIST_SCOPE.kind);
  const offeredKey = offered.join(",");

  useEffect(() => {
    let cancelled = false;
    void defaultListScopeFor(token).then((scope) => {
      if (!cancelled && offeredKey.split(",").includes(scope.kind)) setLanding(scope.kind);
    });
    return () => {
      cancelled = true;
    };
  }, [token, offeredKey]);

  const setLane = (lane: ListScopeKind) => {
    commitUrlParams({ [ENTITY_LIST_URL_PARAMS.scope]: lane }, "push");
  };
  return [fromUrl ?? landing, setLane];
}

// features/window-panels/detail/DetailPageRoute.tsx
//
// The PAGE presentation's client body for `/detail/[type]/[id]` — the one
// presentation that changes the URL. Binds the page shell (RouteHeader +
// scroll body) right above the presentation and offers "open as window"
// back through the header switcher. `?l=type.id,…&i=<n>` carries the list the
// record was opened from so the arrows and `[` / `]` keep working on the page.
//
// It binds NO exit: leaving the page is `core.leave` inside the primitive.

"use client";

import { useState } from "react";

import { decodeListQuery, type DetailInstanceData } from "@ai-matrx/detail";
import { DetailHostProvider, DetailPagePresentation } from "@ai-matrx/detail/react";
import { DETAIL_TYPE_BINDING } from "./detailTypeBinding";
import { takePageSeed } from "./pageSeedHandoff";
import { DetailPageShell } from "./shells/DetailPageShell";

const SHELLS = { Page: DetailPageShell };

export function DetailPageRoute({
  type,
  id,
  list,
  index,
  listTotal,
}: {
  type: string;
  id: string;
  list: string | null;
  index: string | null;
  /** `lt` — the length of the list this URL's window was cut from (NEW-7). */
  listTotal?: string | null;
}) {
  // 🚨 NEW-9 — WHAT THE OPENER KNEW, WHEN IT CAME FROM INSIDE THIS TAB. The
  // route used to pass `seed: null` always, so a record whose type has no single
  // canonical table arrived with nothing to show even when the surface that
  // opened it was holding the name. Taken ONCE, on arrival (a re-render must not
  // resurrect a name the record has since loaded past); a pasted or bookmarked
  // link finds nothing and shows what the record's own loader answers.
  const [seed] = useState(() => takePageSeed({ type, id }));
  const data: DetailInstanceData = {
    type,
    id,
    seed,
    list: decodeListQuery(list, index, listTotal),
  };
  return (
    <DetailHostProvider ports={{ ...DETAIL_TYPE_BINDING, shells: SHELLS }}>
      {/* 🚨 D1 — NO `onBack` HERE, EVER. The route hands over the record and
          nothing else: leaving the page is the primitive's one guarded exit
          (`core.leave` → `canGoBack` / `toRecordHome`, bound in DetailHost).
          A raw `router.back()` passed in from here is what left a pasted or
          bookmarked detail link on `about:blank` through the Back chevron and
          Escape after round 1 had fixed the switch (VERIFY-U-P1-R2, D1). */}
      <DetailPagePresentation data={data} />
    </DetailHostProvider>
  );
}

// features/window-panels/detail/DetailPageRoute.tsx
//
// The PAGE presentation's client body for `/detail/[type]/[id]` — the one
// presentation that changes the URL. Binds the page shell (RouteHeader +
// scroll body) right above the presentation and offers "open as window"
// back through the header switcher. `?l=type.id,…&i=<n>` carries the list the
// record was opened from so `[` / `]` keep working on the page.

"use client";

import { useRouter } from "next/navigation";

import { DetailHostProvider } from "@/lib/detail/host";
import { DetailPagePresentation } from "@/lib/detail/presentations";
import type { DetailInstanceData } from "@/lib/detail/types";
import { decodeListQuery } from "./detailOverlayData";
import { DETAIL_TYPE_BINDING } from "./detailTypeBinding";
import { DetailPageShell } from "./shells/DetailPageShell";

const SHELLS = { Page: DetailPageShell };

export function DetailPageRoute({
  type,
  id,
  list,
  index,
}: {
  type: string;
  id: string;
  list: string | null;
  index: string | null;
}) {
  const router = useRouter();
  const data: DetailInstanceData = {
    type,
    id,
    seed: null,
    list: decodeListQuery(list, index),
  };
  return (
    <DetailHostProvider ports={{ ...DETAIL_TYPE_BINDING, shells: SHELLS }}>
      <DetailPagePresentation data={data} onBack={() => router.back()} />
    </DetailHostProvider>
  );
}

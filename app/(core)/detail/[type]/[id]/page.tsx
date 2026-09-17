// app/(core)/detail/[type]/[id]/page.tsx
//
// The Detail primitive's PAGE presentation (`lib/detail`): the same core a
// record shows in its window and its docked panel, as a full route body under
// the shell header. Opened by `useOpenDetail({ presentation: "page" })` or by
// a person's `ui.detail.default_presentation` setting; never linked to from a
// working surface (a surface that names a record opens its window).

import type { Metadata } from "next";

import { DetailPageRoute } from "@/features/window-panels/detail/DetailPageRoute";

interface Props {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ l?: string; i?: string }>;
}

export const metadata: Metadata = { title: "Record" };

export default async function DetailPage({ params, searchParams }: Props) {
  const { type, id } = await params;
  const { l, i } = await searchParams;
  return (
    <DetailPageRoute
      type={decodeURIComponent(type)}
      id={decodeURIComponent(id)}
      list={l ?? null}
      index={i ?? null}
    />
  );
}

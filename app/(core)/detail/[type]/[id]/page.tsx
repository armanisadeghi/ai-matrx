// app/(core)/detail/[type]/[id]/page.tsx
//
// The Detail primitive's PAGE presentation (`lib/detail`): the same core a
// record shows in its window and its docked panel, as a full route body under
// the shell header. Opened by `useOpenDetail({ presentation: "page" })` or by a
// person's `ui.detail.default_presentation` setting.
//
// 🚨 WHAT THIS ROUTE IS (ruling R35, chair 2026-09-18; V-22 NEW-7). It is the
// durable ADDRESS a record has: `hrefFor` in the entity registry resolves here
// for every token with no screen of its own, so a deep link, a pasted URL, an
// Open-in-new-tab and `pnpm check:dead-ends` all land on this page, and a record
// without it has no address at all. This line used to read "never linked to from
// a working surface", which read as a ban on the door F-82 had just registered —
// two contradicting contracts about the one open path, written the same day.
// The rule is narrower than that sentence: a surface that HOLDS the record opens
// it IN PLACE (`useOpenItemPresentation` → window by default), and must not
// NAVIGATE here as its primary door, because navigating costs the person the
// surface they were working in. Both are required; they are not alternatives.

import type { Metadata } from "next";

import { DetailPageRoute } from "@/features/window-panels/detail/DetailPageRoute";

interface Props {
  params: Promise<{ type: string; id: string }>;
  // `l` = the list the record was opened from, `i` = the index in it, `lt` = the
  // length of the list that list is a capped WINDOW of (NEW-7).
  searchParams: Promise<{ l?: string; i?: string; lt?: string }>;
}

export const metadata: Metadata = { title: "Record" };

export default async function DetailPage({ params, searchParams }: Props) {
  // Next.js already decodes dynamic segment params before handing them to
  // the page (App Router router-decoded contract) — decoding again here
  // double-decodes a literal `%` (an id/type segment carrying `%25` came in
  // as `%` and a second decodeURIComponent then threw a URIError, failing
  // the whole route). `detailPageHref` is the one place that encodes these
  // segments; nothing below this page may decode them a second time
  // (Bugbot LOW, frontend PR 228, comment 4041625800).
  const { type, id } = await params;
  const { l, i, lt } = await searchParams;
  return (
    <DetailPageRoute
      type={type}
      id={id}
      list={l ?? null}
      index={i ?? null}
      listTotal={lt ?? null}
    />
  );
}

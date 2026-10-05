// app/(core)/make/templates/[id]/route.ts — the old install address (lane CHAIR-GALLERY, 2026-10-05).
// Every template now lives at /templates/<slug>, the same page signed in or out; this answers a
// permanent 301 to it (an organization's own saved template keeps its id there and opens signed in).

import { NextResponse, type NextRequest } from "next/server";

import { publicTemplateHref } from "@/features/make/gallery/publicGallery";
import { readTemplatePage } from "@/features/make/gallery/publicCatalogue.server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await readTemplatePage(decodeURIComponent(id));
  const path = page ? publicTemplateHref(page.card) : `/templates/${encodeURIComponent(id)}`;
  const to = new URL(path, request.nextUrl.origin);
  to.search = request.nextUrl.search;
  return NextResponse.redirect(to, 301);
}

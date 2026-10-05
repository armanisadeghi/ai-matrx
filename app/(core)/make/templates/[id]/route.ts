// app/(core)/make/templates/[id]/route.ts — the old install address (lane CHAIR-GALLERY, 2026-10-05).
// Every template now lives at /templates/<slug>, the same page signed in or out; this answers a
// permanent 301 to it (an organization's own saved template keeps its id there and opens signed in).

import { NextResponse, type NextRequest } from "next/server";

/** The address the person asked on (the Host header), so a redirect keeps their host. */
function originOf(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

import { publicTemplateHref } from "@/features/make/gallery/publicGallery";
import { readTemplatePage } from "@/features/make/gallery/publicCatalogue.server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await readTemplatePage(decodeURIComponent(id));
  const path = page ? publicTemplateHref(page.card) : `/templates/${encodeURIComponent(id)}`;
  const to = new URL(path, originOf(request));
  to.search = request.nextUrl.search;
  return NextResponse.redirect(to, 301);
}

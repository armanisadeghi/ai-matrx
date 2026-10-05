// app/(core)/make/templates/route.ts — the gallery has one route for everyone: /templates (308).

import { NextResponse, type NextRequest } from "next/server";

/** The address the person asked on (the Host header), so a redirect keeps their host. */
function originOf(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/templates", originOf(request)), 308);
}

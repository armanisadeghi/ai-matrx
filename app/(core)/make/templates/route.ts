// app/(core)/make/templates/route.ts — the gallery has one route for everyone: /templates (308).

import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/templates", request.nextUrl.origin), 308);
}

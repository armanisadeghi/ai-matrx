// The private calendar link: webcal:// or https://<host>/api/calendar-feed/<token>.ics
//
// A true Next-only concern (a calendar app cannot hold a session). The token is the only credential;
// the database resolves it and answers THE VIEW AS THE PERSON WHO MADE THE LINK (users.calendar_feed_read
// takes that person's identity and the ordinary `authenticated` role before reading, so their wall and
// ladder decide every row). This route is only the transport: it uses the service lane to call that one
// door and reads nothing else.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { buildIcs, type FeedRead } from "@/features/calendar-feed/ics";

export const dynamic = "force-dynamic";

type LooseRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^mxcal_[0-9a-f]{64}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const users = createAdminClient().schema("users") as unknown as { rpc: LooseRpc };
  const { data, error } = await users.rpc("calendar_feed_read", { p_token: token });
  if (error) return new NextResponse("The calendar could not be read right now.", { status: 502, headers: { "Retry-After": "300" } });
  const feed = data as FeedRead | null;
  if (!feed || feed.status !== "ok") return new NextResponse("This calendar link has ended.", { status: 410 });
  const origin = new URL(request.url).origin;
  const body = buildIcs(feed, { origin });
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="calendar.ics"',
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

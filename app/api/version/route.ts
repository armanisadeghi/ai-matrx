// GET /api/version — the current production deployment's identity.
//
// Consumed by NewVersionWatcher (components/errors/NewVersionWatcher.tsx) to
// detect that a newer build shipped while a tab stayed open. Custom fetch()
// calls are NOT pinned by Vercel Skew Protection (only framework-managed
// requests are), so this endpoint always answers from the LATEST production
// deployment — exactly what makes the comparison work.
//
// Locally / self-hosted VERCEL_DEPLOYMENT_ID is absent → deploymentId: null,
// and the watcher stays dormant.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}

// GET /api/version — the current production deployment's identity.
//
// Consumed by NewVersionWatcher (components/errors/NewVersionWatcher.tsx) to
// detect that a newer build shipped while a tab stayed open. Custom fetch()
// calls are NOT pinned by Vercel Skew Protection (only framework-managed
// requests are), so this endpoint always answers from the LATEST production
// deployment — exactly what makes the comparison work.
//
// It also answers `commit`: the git SHA this production deployment was built
// from. scripts/vercel-ignore-build.sh asks the LIVE site for it to learn what
// this project last actually deployed — Vercel's VERCEL_GIT_PREVIOUS_SHA is
// empty here (it is only exposed for an Ignored Build Step configured in
// project settings, not one declared in vercel.json), and without that fact the
// step cannot tell a release commit it already built from one still waiting.
// The repository is public, so the SHA is not a secret.
//
// Locally / self-hosted VERCEL_DEPLOYMENT_ID is absent → deploymentId: null,
// and the watcher stays dormant.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

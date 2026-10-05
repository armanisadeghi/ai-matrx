import { NextResponse } from "next/server";
import {
  MATRX_DESKTOP_FEED_REVALIDATE_SECONDS,
  getMatrxDesktopMacRelease,
} from "@/features/matrx-local-download/desktop-release";

/**
 * The stable address for the Mac download. It reads the update feed (revalidated) and sends the
 * browser to the zip the feed names, so the link is always the latest and never holds a version.
 * If the feed cannot be read it says so plainly; it never falls back to an old file.
 */
export async function GET() {
  const release = await getMatrxDesktopMacRelease();
  if (!release) {
    return NextResponse.json(
      {
        error:
          "The Mac download is not reachable right now. Please try again in a few minutes.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(release.url, {
    status: 307,
    headers: {
      "Cache-Control": `public, s-maxage=${MATRX_DESKTOP_FEED_REVALIDATE_SECONDS}`,
    },
  });
}

// NOTE: The `prompt_apps` table has been moved to the graveyard schema.
// This route returns 410 Gone so callers fail visibly rather than 500.
import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest, _context: { params: Promise<{ id: string }> }) {
    console.warn("[api/prompt-apps/[id]/duplicate] POST: prompt_apps table is in graveyard schema — decommissioned");
    return NextResponse.json({ error: "Prompt Apps have been decommissioned", code: "DECOMMISSIONED" }, { status: 410 });
}

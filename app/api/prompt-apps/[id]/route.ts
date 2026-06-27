import { NextRequest, NextResponse } from "next/server";

// NOTE: The `prompt_apps` table has been moved to the graveyard schema and is no longer
// reachable via PostgREST. This route is part of the decommissioned prompt-apps surface.
// All handlers return 410 Gone with a clear error so callers fail visibly rather than 500.

const GONE = { error: "Prompt Apps have been decommissioned", code: "DECOMMISSIONED" };

export async function GET(_request: NextRequest, _context: { params: Promise<{ id: string }> }) {
    console.warn("[api/prompt-apps/[id]] GET: prompt_apps table is in graveyard schema — decommissioned");
    return NextResponse.json(GONE, { status: 410 });
}

export async function PATCH(_request: NextRequest, _context: { params: Promise<{ id: string }> }) {
    console.warn("[api/prompt-apps/[id]] PATCH: prompt_apps table is in graveyard schema — decommissioned");
    return NextResponse.json(GONE, { status: 410 });
}

export async function DELETE(_request: NextRequest, _context: { params: Promise<{ id: string }> }) {
    console.warn("[api/prompt-apps/[id]] DELETE: prompt_apps table is in graveyard schema — decommissioned");
    return NextResponse.json(GONE, { status: 410 });
}

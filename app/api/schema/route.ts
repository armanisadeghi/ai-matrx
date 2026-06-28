// Legacy entity-system schema endpoint — retired with the entities decommission.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "The entity schema endpoint was removed with the legacy entity system.",
    },
    { status: 410 },
  );
}

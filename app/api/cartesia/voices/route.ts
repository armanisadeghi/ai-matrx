// GET /api/cartesia/voices — full voice catalog, server-side.
//
// Voice listing/management is NOT covered by Cartesia access-token grants
// (tokens grant only tts/stt), so these calls must run here with the
// server-only CARTESIA_API_KEY. The browser never holds a Cartesia key
// (D113); clients call this route via lib/cartesia/cartesiaUtils.ts.

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/utils/supabase/resolveUser";
import { CARTESIA_API_VERSION } from "@/lib/cartesia/config";

const CARTESIA_BASE_URL = "https://api.cartesia.ai";

interface CartesiaVoiceSummary {
  id: string;
  name: string;
  description: string;
  is_public?: boolean;
  language?: string;
  created_at?: string;
}

interface CartesiaVoicesPage {
  data: CartesiaVoiceSummary[];
  has_more: boolean;
  next_page?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await resolveUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "CARTESIA_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const voices: CartesiaVoiceSummary[] = [];
    let startingAfter: string | null = null;
    do {
      const params = new URLSearchParams({ limit: "100" });
      if (startingAfter) params.set("starting_after", startingAfter);
      const res = await fetch(
        `${CARTESIA_BASE_URL}/voices/?${params.toString()}`,
        {
          headers: {
            "X-API-Key": apiKey,
            "Cartesia-Version": CARTESIA_API_VERSION,
          },
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Cartesia voices request failed (${res.status} ${res.statusText})${body ? `: ${body.slice(0, 300)}` : ""}`,
        );
      }
      const page = (await res.json()) as CartesiaVoicesPage;
      if (!Array.isArray(page.data)) {
        throw new Error(
          "Cartesia voices response missing expected `data` array — API contract changed.",
        );
      }
      voices.push(...page.data);
      const lastId =
        page.data.length > 0 ? page.data[page.data.length - 1].id : null;
      startingAfter = page.has_more ? (page.next_page ?? lastId) : null;
    } while (startingAfter);

    return NextResponse.json({ voices });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Voice listing failed";
    console.error("[/api/cartesia/voices] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

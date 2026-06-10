import { CartesiaClient } from "@cartesia/cartesia-js";
import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/utils/supabase/resolveUser";
import { CARTESIA_API_VERSION } from "@/lib/cartesia/config";

export async function GET(request: NextRequest) {
  try {
    const { user } = await resolveUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Authentication required. Provide a session cookie or Bearer token.",
        },
        { status: 401 },
      );
    }

    // The access token must be minted with the SAME Cartesia-Version that the
    // client uses when opening the TTS websocket. Without this, the SDK's auth
    // client defaults to an older version (2024-06-10) and the websocket — which
    // connects at CARTESIA_API_VERSION — gets a 404 "No API schema exists for
    // the requested Cartesia-Version."
    const cartesia = new CartesiaClient({
      apiKey: process.env.CARTESIA_API_KEY,
      cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
    });

    const resp = await cartesia.auth.accessToken({ grants: { tts: true } });

    return NextResponse.json(resp);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Token generation failed";
    console.error("[/api/cartesia] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

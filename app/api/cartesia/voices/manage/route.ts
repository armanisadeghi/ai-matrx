// POST /api/cartesia/voices/manage — voice clone, server-side.
//
// Voice management is not covered by access-token grants, so it runs here
// with the server-only CARTESIA_API_KEY:
//   - multipart/form-data (fields: file, name, description?, language?)
//     → clone a voice from audio
// Clients call these only via lib/cartesia/cartesiaUtils.ts.

import CartesiaClient, { toFile, type Cartesia } from "@cartesia/cartesia-js";
import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/utils/supabase/resolveUser";
import { CARTESIA_API_VERSION } from "@/lib/cartesia/config";

const SUPPORTED_LANGUAGES: readonly Cartesia.SupportedLanguage[] = [
  "en", "fr", "de", "es", "pt", "zh", "ja", "hi", "it", "ko", "nl", "pl", "ru", "sv", "tr",
];

function toSupportedLanguage(value: unknown): Cartesia.SupportedLanguage {
  return SUPPORTED_LANGUAGES.find((l) => l === value) ?? "en";
}

function serverClient(): CartesiaClient {
  return new CartesiaClient({
    apiKey: process.env.CARTESIA_API_KEY,
    defaultHeaders: { "Cartesia-Version": CARTESIA_API_VERSION },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await resolveUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    if (!process.env.CARTESIA_API_KEY) {
      return NextResponse.json(
        { error: "CARTESIA_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const name = form.get("name");
      if (!(file instanceof File) || typeof name !== "string" || !name) {
        return NextResponse.json(
          { error: "Voice clone requires a `file` and a `name`." },
          { status: 400 },
        );
      }
      const description = form.get("description");
      const language = form.get("language");

      const cloned = await serverClient().voices.clone({
        clip: await toFile(file),
        name,
        description: typeof description === "string" ? description : undefined,
        language: toSupportedLanguage(language),
      });
      return NextResponse.json(cloned);
    }
    return NextResponse.json(
      { error: "Voice cloning requires multipart form data with an audio file and name." },
      { status: 415 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Voice management failed";
    console.error("[/api/cartesia/voices/manage] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

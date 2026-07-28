// POST /api/cartesia/voices/manage — voice create/clone, server-side.
//
// Voice management is not covered by access-token grants, so it runs here
// with the server-only CARTESIA_API_KEY. Two actions, discriminated by
// content type:
//   - multipart/form-data (fields: file, name, description?, mode?,
//     language?, enhance?, transcript?)  → clone a voice from audio
//   - application/json {action:"create", name, description, embedding}
//     → create a voice from an embedding
// Clients call these only via lib/cartesia/cartesiaUtils.ts.

import { CartesiaClient, type Cartesia } from "@cartesia/cartesia-js";
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
    // MATRX-EXCEPTION: stale vendor literal type; runtime accepts newer versions.
    cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
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
      const mode = form.get("mode");
      const language = form.get("language");
      const enhance = form.get("enhance");
      const transcript = form.get("transcript");

      const cloned = await serverClient().voices.clone(file, {
        name,
        description: typeof description === "string" ? description : undefined,
        mode: mode === "stability" ? "stability" : "similarity",
        language: toSupportedLanguage(language),
        enhance: enhance === "true",
        ...(typeof transcript === "string" && transcript ? { transcript } : {}),
      });
      return NextResponse.json(cloned);
    }

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      name?: string;
      description?: string;
      embedding?: number[];
    } | null;
    if (
      !body ||
      body.action !== "create" ||
      !body.name ||
      !Array.isArray(body.embedding)
    ) {
      return NextResponse.json(
        {
          error:
            'Expected JSON {action:"create", name, description, embedding[]} or multipart clone form.',
        },
        { status: 400 },
      );
    }

    const created = await serverClient().voices.create({
      name: body.name,
      description: body.description ?? "",
      embedding: body.embedding,
    });
    return NextResponse.json(created);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Voice management failed";
    console.error("[/api/cartesia/voices/manage] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

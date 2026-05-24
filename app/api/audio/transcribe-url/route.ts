/**
 * URL-based Audio Transcription API Route
 *
 * For audio files > 4.5 MB that cannot be POSTed directly through Vercel.
 * Client uploads to cld_files via the universal file handler, mints a
 * signed URL (`fileHandler.use(...).as({ kind: "html_src" })` or via
 * `Files.getSignedUrl`), and passes that URL here. Groq fetches the
 * bytes directly. Server-side because GROQ_API_KEY is a secret.
 * Groq Developer Plan supports up to 100 MB via URL parameter.
 */

import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { resolveUser } from "@/utils/supabase/resolveUser";
import { logTranscriptionError } from "@/features/audio/services/audioErrorLogger";
import { filterWhisperHallucinations } from "@/features/audio/utils/hallucinationFilter";
import { extractErrorMessage } from "@/utils/errors";

export const maxDuration = 300;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Allowlist for URLs Groq is permitted to fetch: our Python backend tiers
// + AWS S3 signed URLs (which the backend emits for cld_files reads).
// Prevents this route from being used as an arbitrary URL fetch oracle.
const ALLOWED_URL_HOSTS = [
  process.env.NEXT_PUBLIC_BACKEND_URL_PROD,
  process.env.NEXT_PUBLIC_BACKEND_URL_DEV,
  process.env.NEXT_PUBLIC_BACKEND_URL_EC2,
  process.env.NEXT_PUBLIC_BACKEND_URL_STAGING,
  process.env.NEXT_PUBLIC_BACKEND_URL_LOCAL,
  process.env.NEXT_PUBLIC_BACKEND_URL_GPU,
]
  .filter((v): v is string => typeof v === "string" && v.length > 0)
  .map((v) => v.replace(/\/$/, ""));

function isAllowedUrl(url: string): boolean {
  if (ALLOWED_URL_HOSTS.some((host) => url.startsWith(host))) return true;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".amazonaws.com")) return true;
  } catch {
    return false;
  }
  return false;
}

const MAX_RETRIES = 3;
const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryable(status: number): boolean {
  return RETRYABLE_CODES.has(status);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeUrlWithRetry(
  options: Record<string, unknown>,
  userId: string,
): Promise<{ data: unknown; attempts: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await groq.audio.transcriptions.create(options as never);
      return { data: result, attempts: attempt };
    } catch (err: unknown) {
      lastError =
        err instanceof Error ? err : new Error(extractErrorMessage(err));
      const status = (err as { status?: number })?.status;
      const retryAfter = (
        err as { headers?: { get?: (k: string) => string | null } }
      )?.headers?.get?.("retry-after");

      await logTranscriptionError({
        userId,
        errorCode: status ? `HTTP_${status}` : "SDK_ERROR",
        errorMessage: lastError.message,
        fileSizeBytes: 0,
        attemptNumber: attempt,
        apiRoute: "/api/audio/transcribe-url",
        metadata: {
          retryAfter,
          willRetry:
            attempt < MAX_RETRIES && (status ? isRetryable(status) : true),
        },
      });

      if (attempt < MAX_RETRIES && (status ? isRetryable(status) : true)) {
        const baseDelay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 1000 * Math.pow(2, attempt - 1);
        const delay = Math.min(baseDelay, 8000);
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("URL transcription failed after retries");
}

export async function POST(request: NextRequest) {
  let userId = "anonymous";

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
    userId = user.id;

    const body = await request.json();
    const { url, language, prompt } = body as {
      url?: string;
      language?: string;
      prompt?: string;
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: 'Missing or invalid "url" parameter' },
        { status: 400 },
      );
    }

    if (!isAllowedUrl(url)) {
      return NextResponse.json(
        {
          error:
            "URL is not on the transcription allowlist (cld_files signed URLs only).",
        },
        { status: 400 },
      );
    }

    const transcriptionOptions: Record<string, unknown> = {
      url,
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      temperature: 0.0,
    };

    if (language) transcriptionOptions.language = language;
    if (prompt) transcriptionOptions.prompt = prompt;

    const { data: transcription, attempts } = await transcribeUrlWithRetry(
      transcriptionOptions,
      userId,
    );

    const response = transcription as Record<string, unknown>;
    const rawText = (transcription as { text: string }).text ?? "";

    // Filter Whisper's well-known silence hallucinations using segment-level
    // confidence signals. See features/audio/utils/hallucinationFilter.ts.
    const filtered = filterWhisperHallucinations(rawText, response.segments);

    return NextResponse.json({
      success: true,
      text: filtered.text,
      language: response.language ?? null,
      duration: response.duration ?? null,
      segments: filtered.segments,
      _meta: {
        attempts,
        hallucinationsFiltered: filtered.droppedSegments.length,
      },
    });
  } catch (error: unknown) {
    const err =
      error instanceof Error ? error : new Error(extractErrorMessage(error));
    const status = (error as { status?: number })?.status;

    console.error("[/api/audio/transcribe-url] Final failure:", err.message);

    if (status === 429) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          code: "RATE_LIMIT",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: "URL transcription failed",
        details: err.message,
        code: "TRANSCRIPTION_ERROR",
      },
      { status: 500 },
    );
  }
}

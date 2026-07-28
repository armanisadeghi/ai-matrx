/**
 * Cartesia voice catalog + management, browser-side.
 *
 * The browser NEVER holds a Cartesia API key (D113). Listing and management
 * (clone/create) are not covered by access-token grants, so they go through
 * our authenticated Next.js routes, which hold the server-only key:
 *   - GET  /api/cartesia/voices         → listVoices
 *   - POST /api/cartesia/voices/manage  → cloneVoiceFromFile / createVoice
 * TTS itself uses the access-token path — see lib/cartesia/connection.ts.
 */

import { Language } from "./cartesia.types";

export interface CartesiaVoiceSummary {
    id: string;
    name: string;
    description: string;
    is_public?: boolean;
    language?: string;
    created_at?: string;
}

async function parseOrThrow<T>(res: Response, label: string): Promise<T> {
    const body = (await res.json().catch(() => null)) as
        | (T & { error?: string })
        | null;
    if (!res.ok || body === null) {
        throw new Error(
            (body && body.error) || `${label} failed (HTTP ${res.status})`,
        );
    }
    return body;
}

export const listVoices = async (): Promise<CartesiaVoiceSummary[]> => {
    const res = await fetch("/api/cartesia/voices");
    const body = await parseOrThrow<{ voices: CartesiaVoiceSummary[] }>(
        res,
        "Cartesia voices request",
    );
    if (!Array.isArray(body.voices)) {
        throw new Error("Cartesia voices response missing `voices` array.");
    }
    return body.voices;
};

interface CloneVoiceOptions {
    name: string;
    description?: string;
    mode?: "similarity" | "stability";
    language?: Language;
    enhance?: boolean;
    transcript?: string;
}

/** Clone a voice from an audio file (routes through the server; no client key). */
export const cloneVoiceFromFile = async (
    file: File | Blob,
    options: CloneVoiceOptions,
): Promise<unknown> => {
    const form = new FormData();
    form.set("file", file);
    form.set("name", options.name);
    if (options.description) form.set("description", options.description);
    if (options.mode) form.set("mode", options.mode);
    if (options.language) form.set("language", options.language);
    if (options.enhance !== undefined)
        form.set("enhance", String(options.enhance));
    if (options.transcript) form.set("transcript", options.transcript);

    const res = await fetch("/api/cartesia/voices/manage", {
        method: "POST",
        body: form,
    });
    return parseOrThrow<unknown>(res, "Voice clone");
};

/** Create a voice from an embedding (routes through the server; no client key). */
export const createVoice = async (
    name: string,
    description: string,
    embedding: number[],
): Promise<unknown> => {
    const res = await fetch("/api/cartesia/voices/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", name, description, embedding }),
    });
    return parseOrThrow<unknown>(res, "Voice create");
};

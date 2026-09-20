/**
 * The Media Source Catalog's transcript read — one transcript, direct from Supabase.
 *
 * WHY DIRECT AND NOT THROUGH THE SERVER. House rule: rows go direct to Supabase,
 * the Python server is for work the client cannot do. A transcript IS a row —
 * `transcripts.transcripts`, one id, RLS as the ceiling — so reading it here is
 * the declared path. (The catalog's LIST of videos still goes through the server
 * because it is a scoped join the contract computes; see ./api.ts's header.)
 *
 * WHAT THE COLUMN ACTUALLY IS. `segments` is `jsonb NOT NULL DEFAULT '[]'`, and
 * this repo patches the generated `Json` alias to `unknown` (scripts/patch-db-types.sh),
 * so the row hands us a bare `unknown`. Nothing here casts it. Every segment is
 * checked at runtime, and a segment that does not check out is REPORTED — it is
 * never dropped in silence and never replaced with a plausible-looking blank.
 *
 * THE TWO SHAPES THIS TABLE REALLY HOLDS. The contract (API-CONTRACT.md §7.1)
 * specifies what the media lane writes:
 *
 *   { "index": 0, "start": 0.0, "end": 4.12, "text": "…",
 *     "speaker": null, "source": "youtube_captions", "language": "en" }
 *
 * The same table has carried the in-app recorder's older cue shape since long
 * before this feature existed — `{ id, text, seconds, timecode }` — and rows in
 * that shape are in the live table today. Both are read; a recorder cue has no
 * end time, so `end` is null rather than a guessed number. Anything else is
 * malformed and says so.
 */

import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";
import type { TranscriptLane } from "./types";

type TranscriptRow = Database["transcripts"]["Tables"]["transcripts"]["Row"];

/** One transcript cue, in the contract's §7.1 field names. */
export interface MediaTranscriptSegment {
    /** The row's own `index` when it carried one, else this cue's position. */
    index: number;
    /** Seconds from the start of the media. */
    start: number;
    /** Seconds, or null when the writer stored no end (recorder-shaped cues). */
    end: number | null;
    text: string;
    speaker: string | null;
    /** e.g. "youtube_captions". Null when the writer stored none. */
    source: string | null;
    /** BCP-47 tag, e.g. "en". Null when the writer stored none. */
    language: string | null;
}

/** The `metadata.media` block the transcription lanes write (§7.1). */
export interface MediaTranscriptProvenance {
    adapter: string | null;
    external_id: string | null;
    url: string | null;
    library_id: string | null;
    lane: TranscriptLane | null;
    caption_language: string | null;
    is_auto_generated: boolean | null;
}

/** One stored cue this read could not honestly turn into a segment. */
export interface MalformedSegment {
    /** Its position in the stored array. */
    position: number;
    /** A sentence naming what was wrong with it. */
    reason: string;
}

export interface MediaTranscript {
    id: string;
    title: string;
    description: string | null;
    segments: MediaTranscriptSegment[];
    /** Empty when every stored cue parsed. Never hidden — the panel prints it. */
    malformed: MalformedSegment[];
    /** How many entries the stored array held, malformed ones included. */
    storedSegmentCount: number;
    /** Null when `metadata.media` is absent — this transcript came from elsewhere. */
    provenance: MediaTranscriptProvenance | null;
    /** The whole metadata object, for a surface that wants a field we do not name. */
    metadata: JsonObject | null;
    sourceType: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * A read that could not produce a transcript. Always carries a sentence a screen
 * can print as-is, plus a remedy when there is one — never a bare code.
 */
export class TranscriptReadError extends Error {
    readonly code:
        | "transcript_not_found"
        | "transcript_unreadable"
        | "transcript_segments_malformed";
    readonly remedy: string | null;

    constructor(
        message: string,
        code: TranscriptReadError["code"],
        remedy: string | null = null,
    ) {
        super(message);
        this.name = "TranscriptReadError";
        this.code = code;
        this.remedy = remedy;
    }
}

function readNumber(source: JsonObject, key: string): number | null {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(source: JsonObject, key: string): string | null {
    const value = source[key];
    return typeof value === "string" ? value : null;
}

function readBoolean(source: JsonObject, key: string): boolean | null {
    const value = source[key];
    return typeof value === "boolean" ? value : null;
}

function readLane(source: JsonObject, key: string): TranscriptLane | null {
    const value = source[key];
    return value === "free_captions" || value === "paid_agent" ? value : null;
}

interface ParsedSegments {
    segments: MediaTranscriptSegment[];
    malformed: MalformedSegment[];
    storedCount: number;
}

/**
 * Turn the raw `segments` jsonb into typed cues.
 *
 * Throws only when the column is not an array at all — that is a broken row, not
 * a broken cue, and pretending it is an empty transcript would be a lie. Individual
 * cues that do not check out come back in `malformed` so the screen can say how
 * many and why.
 */
function parseSegments(raw: unknown, noun: string): ParsedSegments {
    if (!Array.isArray(raw)) {
        throw new TranscriptReadError(
            `This transcript's stored segments are a ${raw === null ? "null value" : typeof raw}, not a list of cues, so it cannot be displayed.`,
            "transcript_segments_malformed",
            `Re-run transcription for this ${noun} to rewrite its segments.`,
        );
    }

    const segments: MediaTranscriptSegment[] = [];
    const malformed: MalformedSegment[] = [];

    raw.forEach((entry: unknown, position: number) => {
        if (!isJsonObject(entry)) {
            malformed.push({
                position,
                reason: `Cue ${position + 1} is not an object, so it carries no text or timing.`,
            });
            return;
        }

        const text = readString(entry, "text");
        if (text === null) {
            malformed.push({
                position,
                reason: `Cue ${position + 1} has no text field, so there is nothing to show for it.`,
            });
            return;
        }

        // Contract shape first (`start`), then the recorder's older cue (`seconds`).
        const start = readNumber(entry, "start") ?? readNumber(entry, "seconds");
        if (start === null) {
            malformed.push({
                position,
                reason: `Cue ${position + 1} has no start time, so it cannot open the ${noun} at its moment.`,
            });
            return;
        }

        const index = readNumber(entry, "index");
        segments.push({
            index: index === null ? position : Math.trunc(index),
            start,
            end: readNumber(entry, "end"),
            text,
            speaker: readString(entry, "speaker"),
            source: readString(entry, "source"),
            language: readString(entry, "language"),
        });
    });

    return { segments, malformed, storedCount: raw.length };
}

function parseProvenance(metadata: JsonObject | null): MediaTranscriptProvenance | null {
    if (metadata === null) return null;
    const media = metadata.media;
    if (!isJsonObject(media)) return null;
    return {
        adapter: readString(media, "adapter"),
        external_id: readString(media, "external_id"),
        url: readString(media, "url"),
        library_id: readString(media, "library_id"),
        lane: readLane(media, "lane"),
        caption_language: readString(media, "caption_language"),
        is_auto_generated: readBoolean(media, "is_auto_generated"),
    };
}

function mapRow(row: TranscriptRow, noun: string): MediaTranscript {
    const { segments, malformed, storedCount } = parseSegments(row.segments, noun);
    const metadata = isJsonObject(row.metadata) ? row.metadata : null;
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        segments,
        malformed,
        storedSegmentCount: storedCount,
        provenance: parseProvenance(metadata),
        metadata,
        sourceType: row.source_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * Read ONE transcript by id.
 *
 * Rejects with a `TranscriptReadError` carrying a printable sentence when the row
 * is gone, is not readable by this user, or holds segments that are not a list.
 * Soft-deleted rows (`deleted_at`) are treated as gone, the same way every other
 * transcripts reader in this repo treats them.
 *
 * `noun` is the Library's own word for one item (D6b, jobs-bar cold-walk-12) —
 * "video" by default, since this table is not itself Library-scoped and every
 * existing caller is the YouTube-era panel; a caller that knows its adapter
 * (`SourceDetailPanel`) passes its own.
 */
export async function fetchMediaTranscript(
    transcriptId: string,
    noun: string = "video",
): Promise<MediaTranscript> {
    const { data, error } = await supabase
        .schema("transcripts")
        .from("transcripts")
        .select("*")
        .eq("id", transcriptId)
        .is("deleted_at", null)
        .maybeSingle();

    if (error) {
        throw new TranscriptReadError(
            `This ${noun}'s transcript could not be read: ${error.message}`,
            "transcript_unreadable",
            "Try again in a moment; if it keeps failing, the transcript may belong to an organization you are not in.",
        );
    }

    if (!data) {
        throw new TranscriptReadError(
            `This ${noun} is marked as transcribed, but its transcript row is missing or is not visible to you.`,
            "transcript_not_found",
            `Re-run transcription for this ${noun} to produce a new transcript.`,
        );
    }

    return mapRow(data, noun);
}

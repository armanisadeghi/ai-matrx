/**
 * D6b (jobs-bar cold-walk-12, 2026-09-19): PODCAST EPISODES ARE NOT VIDEOS.
 *
 * The walk fed this feature a podcast Library and watched it say "Transcribe 3
 * videos", "3 videos selected" and "Free, from YouTube's own captions" — while
 * the very same screen's own per-row failure text correctly said "a podcast".
 * One Library primitive spans YouTube, podcasts, blogs and decks
 * (`vocabulary.ts`'s own header comment), and `sourceVocabulary(library)` is
 * the ONE place a source-kind word is allowed to be chosen. Every other file
 * in this feature must read it, never spell "video(s)" itself.
 *
 * This is a static census, not a behavioural test: it reads every `.ts`/`.tsx`
 * file this feature ships (excluding tests and `vocabulary.ts` itself, which
 * is where the word legitimately lives — in the `youtube` entry) and fails on
 * any PROSE string literal — one containing a space, so it reads as words a
 * person sees, not a wire key like `videos` or `video_id` — that still spells
 * "video"/"videos". `ALLOWED_PROSE` is the named, reasoned exception list; a
 * new entry needs a comment saying why, exactly like the two below.
 *
 * RED PROOF: before this task's fix, this failed on real lines including
 * `catalog/listConfig.tsx`'s `bulkSelection: { noun: "video", ... }` (a bare
 * word, so a stronger version of this scan restricted to whole-word literals
 * would have caught it too), `hooks/useActionRunner.tsx`'s
 * `` `${...} ${pending.selection.count} videos` `` job name, and
 * `components/ActionRunDialog.tsx`'s `"Free, from YouTube's own captions"`
 * label. Reverting any one of those hardcodes reproduces this test's failure.
 */

import fs from "fs";
import path from "path";

const FEATURE_ROOT = path.resolve(__dirname, "..");

/** The one file where the word "video" is the correct, declared vocabulary. */
const EXCLUDED_FILES = new Set<string>(["vocabulary.ts"]);

/**
 * Sentences this census intentionally does not fail on, each with why. Every
 * entry here is either (a) about YouTube specifically and unreachable for any
 * other adapter, or (b) a paste-box sentence that lists every supported kind
 * side by side, so "video" appears next to "podcast", "blog" and "deck" in
 * the same breath rather than standing in for all of them.
 */
const ALLOWED_PROSE: string[] = [
    // CatalogPasteBox's own placeholder — names every supported kind at once;
    // "video link" here means literally that, beside its podcast/blog/deck
    // siblings, not "whatever this Library turns out to hold".
    "YouTube channel, handle, playlist or video link; a podcast name, Apple Podcasts link or RSS feed; a blog, Substack or Medium address; or a SlideShare or Speaker Deck profile",
    // CatalogPasteBox's classification of ONE input kind it detected — a
    // pasted URL that IS a YouTube video, never a stand-in for "the Source".
    "read as a video — we catalogued the channel it belongs to",
    // SourceDetailPanel's `captionsSentence`/`captionsLabel`: `has_captions`
    // and `caption_languages` are populated by the YouTube caption probe and
    // nothing else adapter-side reaches these three sentences today. Real,
    // adjacent defect (this sentence renders unconditionally, so it is also
    // wrong on a podcast row that happens to carry these fields) — flagged
    // for a follow-up task rather than folded into this one, which is about
    // the word "video(s)" standing in for another kind's own noun.
    "YouTube flags this video as captioned, but no caption track has been probed yet, so the languages are not known.",
    "YouTube reports no caption track for this video, so a transcript has to come from the paid lane.",
    "Nothing has probed this video for captions yet, so whether it has any is unknown.",
];

/**
 * A bare `"video"`/`"videos"` allowed in ONE specific, named spot outside the
 * wire layer: `transcriptService.ts`'s `fetchMediaTranscript(transcriptId,
 * noun = "video")` default — a fallback for a caller with no Library row to
 * build a noun from. There is exactly one caller today (`SourceDetailPanel`)
 * and it always passes its own `vocabulary.item.one`, so the default is never
 * actually read; keyed by file, never by value, so it cannot swallow a real
 * offender the way an `ALLOWED_PROSE` entry of just `"video"` would.
 */
const BARE_VIDEO_ALLOWED_FILES = new Set<string>(["transcriptService.ts"]);

function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listSourceFiles(full));
        } else if (/\.(ts|tsx)$/.test(entry.name) && !EXCLUDED_FILES.has(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Rough but sufficient: every `"..."`, `'...'` and `` `...` `` on one line,
 * with a template literal's `${expr}` interpolations blanked out first — an
 * interpolation is CODE (a prop or variable name, e.g. `` `${video.title}` ``
 * where `video` is the row variable, not the word "video" in prose) and must
 * never be read as part of the sentence around it.
 */
function extractStringLiterals(line: string): string[] {
    const literals: string[] = [];
    const re = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
        const raw = match[0].slice(1, -1);
        // A blanked interpolation leaves no trace — `` `videos[${index}]` ``
        // is a wire-path label ("videos[3]"), never a sentence, so it must not
        // gain a space (and therefore look like prose) purely from the blank.
        literals.push(raw.replace(/\$\{[^}]*\}/g, ""));
    }
    return literals;
}

const VIDEO_WORD = /\bvideos?\b/i;
const BARE_VIDEO = /^videos?$/i;

/**
 * The wire/schema layer, where "videos"/"video_id" are the SERVER'S field and
 * path names (`GET …/videos`, `parseVideoRow(entry, \`videos[${i}]\`)`) —
 * never rendered, and a rename here is a contract change, not a vocabulary
 * one. Every other file's bare `"video"`/`"videos"` literal — a bulk-selection
 * noun, a ternary's singular/plural branch, a job's own name — IS prose, even
 * though it has no space of its own, so it gets the stricter bare-word check
 * below instead of the "must contain a space" one.
 */
const WIRE_LAYER_FILES = new Set<string>(["contract.ts", "api.ts", "types.ts"]);

describe("D6b — no file outside vocabulary.ts hardcodes the word video(s)", () => {
    const files = listSourceFiles(FEATURE_ROOT);
    expect(files.length).toBeGreaterThan(10); // the walk itself never runs empty

    it("has no prose string literal spelling video(s)", () => {
        const offenders: string[] = [];

        for (const file of files) {
            const relPath = path.relative(FEATURE_ROOT, file);
            const isWireLayer = WIRE_LAYER_FILES.has(path.basename(file));
            const lines = fs.readFileSync(file, "utf8").split("\n");

            lines.forEach((rawLine, index) => {
                const trimmed = rawLine.trim();
                // Skip comment lines outright — this file's own header, and every
                // `D6b` note left beside the fixes above, talks ABOUT the word.
                if (
                    trimmed.startsWith("//") ||
                    trimmed.startsWith("*") ||
                    trimmed.startsWith("/**") ||
                    trimmed.startsWith("/*")
                ) {
                    return;
                }

                for (const literal of extractStringLiterals(rawLine)) {
                    const trimmedLiteral = literal.trim();
                    const isBareVideoWord = BARE_VIDEO.test(trimmedLiteral);

                    if (isBareVideoWord) {
                        // A bare "video"/"videos" is a wire key ONLY in the
                        // wire layer; everywhere else (a bulk-selection noun, a
                        // singular/plural ternary branch, a job's own name) it
                        // is exactly D6b — a person reads it.
                        if (isWireLayer) continue;
                        if (BARE_VIDEO_ALLOWED_FILES.has(path.basename(file))) continue;
                    } else {
                        // Not bare and no space: a route segment or an
                        // underscored wire key (`video_id`, `/…/videos`) —
                        // never a sentence a person reads.
                        if (!literal.includes(" ")) continue;
                        if (!VIDEO_WORD.test(literal)) continue;
                    }

                    if (ALLOWED_PROSE.some((allowed) => literal.includes(allowed))) continue;

                    offenders.push(`${relPath}:${index + 1}: ${literal}`);
                }
            });
        }

        expect(offenders).toEqual([]);
    });
});

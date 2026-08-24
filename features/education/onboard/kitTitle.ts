// features/education/onboard/kitTitle.ts
//
// THE NAME OF THE KIT — resolved ONCE per run, before the fan-out, and used as
// `source.title` for every generator.
//
// Why this exists: a study kit produced eight artifacts all called
// "MatterandMeasurements" — the raw filename, verbatim. Two compounding causes:
//   1. the ingest title is `file.name` minus its extension, never cleaned; and
//   2. every generator resolves its final title as
//      `singlePass ? agentTitle || source.title : source.title || agentTitle`,
//      so on a MULTI-SECTION run (any long document) the raw filename WINS over
//      the agent's own good title, on all of them at once.
// Only the audio study escaped, because its podcast agent titles the episode
// itself.
//
// Fixing it per generator would mean eight fixes and eight naming agents. The
// kit has ONE subject, so it gets ONE name here, and every generator keeps its
// existing `source.title` behaviour untouched.
//
// Two layers, and the cheap one is never skipped:
//   • `humanizeSourceTitle` — deterministic, instant, no AI. Un-mangles a
//     filename (extensions, separators, camelCase, junk tokens, casing). This
//     is the floor: it runs even when the AI lane is unavailable or refuses.
//   • `resolveKitTitle` — the `education.kit_title` mandate reads the opening of
//     the material and names the SUBJECT, which is the only way to recover a
//     name a filename genuinely does not contain ("MatterandMeasurements" →
//     "Matter and Measurements"). Best-effort by construction: naming a kit must
//     never be able to fail a kit.

import type { AppDispatch, AppStore } from "@/lib/redux/store";
import { runAgentExtraction } from "@/features/education/convert/runAgentExtraction";

/** Mandate for the kit namer — swap the agent at /agents/mandates, no deploy. */
export const KIT_TITLE_MANDATE = "education.kit_title";

/** How much of the material the namer reads. A title needs the opening, not the book. */
const NAMER_SAMPLE_CHARS = 4_000;

/** Words a filename carries that are never part of a title. */
const JUNK_TOKENS = new Set([
  "final", "finalfinal", "draft", "copy", "new", "updated", "revised",
  "version", "ver", "v1", "v2", "v3", "fixed", "edited", "clean",
  "scan", "scanned", "doc", "document", "file", "untitled", "download",
  "compressed", "merged", "combined", "export", "exported", "print",
]);

/**
 * Deliberate lowercase-initial capitalizations the camelCase split would
 * destroy ("iPhone" → "I Phone"). Matched case-insensitively and restored
 * verbatim — the pattern is a real product name, not a run-together filename.
 */
const LOWERCASE_INITIAL_BRANDS = [
  "iPhone", "iPad", "iOS", "iMac", "iTunes", "iCloud", "iMovie",
  "eBay", "eBook", "eBooks", "eCommerce", "eSports", "iWork",
  "macOS", "tvOS", "watchOS", "pH", "mRNA", "tRNA", "rRNA", "dNTP",
];

/** Small words that stay lowercase inside a title. */
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "nor",
  "of", "on", "or", "the", "to", "vs", "via", "with",
]);

/** Restore a brand token the split broke apart ("I Phone" → "iPhone"). */
function restoreBrands(text: string): string {
  let out = text;
  for (const brand of LOWERCASE_INITIAL_BRANDS) {
    // The split inserts a space after the leading lowercase letter, so match
    // both the broken form and the intact one, and normalize to the real name.
    const broken = new RegExp(
      `\\b${brand[0]}\\s+${brand.slice(1)}\\b`,
      "gi",
    );
    out = out.replace(broken, brand);
    out = out.replace(new RegExp(`\\b${brand}\\b`, "gi"), brand);
  }
  return out;
}

function titleCase(words: string[]): string {
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      // An existing ALL-CAPS or MixedCaps token is an acronym or a real
      // capitalization the user chose — never flatten it (GRE, DNA, pH).
      if (w.length > 1 && w === w.toUpperCase()) return w;
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Un-mangle a raw filename into the most readable title obtainable WITHOUT AI.
 * Deterministic and cheap; the guaranteed floor under every kit name.
 *
 * `MATH_101-final_v2.pdf`      → `MATH 101`
 * `photosynthesis-notes.docx`  → `Photosynthesis Notes`
 * `MatterandMeasurements.pdf`  → `Matterand Measurements`  (only the namer
 *                                 recovers the missing space — no dictionary
 *                                 here, and inventing one would be worse)
 * `iPhone_notes.pdf`           → `iPhone Notes`  (deliberate lowercase-initial
 *                                 names are restored, not split)
 */
export function humanizeSourceTitle(raw: string): string {
  const noExt = raw.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const spaced = noExt
    // separators → spaces
    .replace(/[_\-.]+/g, " ")
    // "(1)", "[2]" duplicate markers
    .replace(/[([{]\s*\d+\s*[)\]}]/g, " ")
    // camelCase / PascalCase boundary
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // ACRONYMWord boundary → "ACRONYM Word"
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const kept = spaced
    .split(" ")
    .filter((w) => w.length > 0)
    .filter((w) => !JUNK_TOKENS.has(w.toLowerCase()))
    // bare date-ish or hash-ish tokens carry no meaning in a title
    .filter((w) => !/^\d{6,}$/.test(w))
    .filter((w) => !/^\d{4}[-/]?\d{2}[-/]?\d{2}$/.test(w));

  // Honour the contract in the name: NEVER empty. A filename that is nothing
  // but junk tokens (or nothing but an extension) still yields a usable title,
  // so no caller has to defend against "".
  if (kept.length === 0) {
    const fallback = titleCase(spaced.split(" ").filter(Boolean));
    return fallback ? restoreBrands(fallback) : "Study material";
  }
  return restoreBrands(titleCase(kept));
}

export interface KitTitle {
  /** The name every artifact in this kit carries. */
  title: string;
  /** Short field/course phrase for the kit header; "" when unknown. */
  subjectHint: string;
  /** True when the namer produced it; false when this is the humanized filename. */
  named: boolean;
}

function readString(data: unknown, key: string): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const v = (data as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Reject a "title" that is really a sentence, a restatement of the filename, or
 * boilerplate. The namer is good, but the floor is honest — and a wrong title on
 * eight artifacts is worse than a plain one.
 */
function usableTitle(candidate: string): boolean {
  if (candidate.length < 2 || candidate.length > 90) return false;
  if (candidate.split(/\s+/).length > 12) return false;
  if (/[.!?]$/.test(candidate)) return false;
  return true;
}

/**
 * Resolve the kit's name. NEVER throws and never returns an empty title — a
 * failed or slow namer degrades to the humanized filename, because the kit
 * itself is what the learner is waiting for.
 */
export async function resolveKitTitle(
  dispatch: AppDispatch,
  store: AppStore,
  input: { text: string; rawTitle: string; focus?: string; orgId?: string },
): Promise<KitTitle> {
  const floor = humanizeSourceTitle(input.rawTitle) || "Study material";

  const sample = input.text.slice(0, NAMER_SAMPLE_CHARS).trim();
  if (!sample) return { title: floor, subjectHint: "", named: false };

  try {
    const extracted = await runAgentExtraction(dispatch, store, {
      mandateKey: KIT_TITLE_MANDATE,
      surfaceKey: "education-ingest-kit-title",
      sourceFeature: "education-ingest",
      organizationId: input.orgId,
      variables: {
        source_content: sample,
        title: input.rawTitle,
        focus: input.focus ?? "",
      },
      // A title is a few tokens: keep the learner's wait honest and short.
      timeoutMs: 25_000,
      live: false,
    });
    const named = readString(extracted.value, "title");
    if (usableTitle(named)) {
      return {
        title: named,
        subjectHint: readString(extracted.value, "subject_hint"),
        named: true,
      };
    }
    console.warn(
      "[kitTitle] namer returned an unusable title — using the cleaned filename",
      { named, floor },
    );
  } catch (err) {
    // Loud, never fatal: the kit proceeds under its cleaned filename.
    console.error("[kitTitle] namer failed — using the cleaned filename:", err);
  }
  return { title: floor, subjectHint: "", named: false };
}

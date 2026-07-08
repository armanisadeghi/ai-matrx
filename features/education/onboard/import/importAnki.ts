// features/education/onboard/import/importAnki.ts
//
// Anki `.apkg` importer (P9 — "turn the incumbents' libraries into our funnel").
// An `.apkg` is a zip containing an SQLite collection (`collection.anki2`, and
// on newer exports `collection.anki21`) plus a `media` map. We decode it fully
// CLIENT-SIDE: jszip to open the archive, sql.js (WASM, dynamically imported so
// it never touches the main bundle) to read the notes, and land a native deck.
//
// Preserved: every note's fields → card front/back (HTML flattened to readable
// text). Surfaced honestly (not silently dropped): embedded media and Anki's
// scheduling/review history are NOT yet mapped into our FSRS spine — the import
// summary says so (per the P9 brief's "or the limitation is explicitly
// surfaced"). The newer zstd-compressed `collection.anki21b` needs a decompressor
// we don't ship; those files get a clear message to re-export as "legacy .apkg".
//
// `code-splitting`: both jszip and sql.js load via dynamic import on first use.

import type { NewCardInput } from "@/features/flashcards/data/types";
import { persistImportedDeck, type ImportOutcome } from "./importDeck";

/** Unit + record separators Anki uses to join note fields. */
const FIELD_SEP = "\x1f";

export function isAnkiFile(file: File): boolean {
  return /\.(apkg|colpkg)$/i.test(file.name);
}

/** Flatten Anki field HTML to readable plain text (drops tags, decodes entities). */
function htmlToText(html: string): string {
  let s = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const entities: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  s = s.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => entities[m] ?? m);
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

/** True if a note field references embedded media (img/audio/video). */
function hasMedia(fields: string[]): boolean {
  return fields.some((f) => /<(img|audio|video)[\s>]|\[sound:/i.test(f));
}

interface ParsedAnki {
  cards: NewCardInput[];
  skipped: number;
  mediaCount: number;
  hadScheduling: boolean;
}

async function parseApkg(bytes: Uint8Array): Promise<ParsedAnki> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);

  // Prefer the plain-SQLite collection; the newer zstd `anki21b` we can't read.
  const legacy = zip.file("collection.anki2") ?? zip.file("collection.anki21");
  if (!legacy) {
    if (zip.file("collection.anki21b")) {
      throw new Error(
        "This is a newer (compressed) Anki export we can't read yet. In Anki, re-export with “Support older Anki versions” checked, then import the .apkg again.",
      );
    }
    throw new Error("No Anki collection found in that .apkg.");
  }
  const dbBytes = await legacy.async("uint8array");

  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const db = new SQL.Database(dbBytes);

  const cards: NewCardInput[] = [];
  let skipped = 0;
  let mediaCount = 0;

  try {
    const res = db.exec("SELECT flds FROM notes");
    const rows = res[0]?.values ?? [];
    for (const row of rows) {
      const flds = typeof row[0] === "string" ? row[0] : "";
      const fields = flds.split(FIELD_SEP);
      if (hasMedia(fields)) mediaCount++;
      const front = htmlToText(fields[0] ?? "");
      // Back = the remaining fields joined (covers Basic + multi-field notes).
      const back = htmlToText(fields.slice(1).join("\n\n"));
      if (!front && !back) {
        skipped++;
        continue;
      }
      cards.push({ front: front || back, back: front ? back : "", card_kind: "basic" });
    }

    // Did the deck carry real scheduling/review history?
    let hadScheduling = false;
    try {
      const rev = db.exec("SELECT COUNT(*) FROM revlog");
      const n = Number(rev[0]?.values?.[0]?.[0] ?? 0);
      hadScheduling = n > 0;
    } catch {
      /* revlog absent — fine */
    }

    return { cards, skipped, mediaCount, hadScheduling };
  } finally {
    db.close();
  }
}

/** Import an Anki `.apkg` file as a native deck. */
export async function importAnkiFile(file: File): Promise<ImportOutcome> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const { cards, skipped, mediaCount, hadScheduling } = await parseApkg(buf);
  if (cards.length === 0) {
    throw new Error("That Anki deck had no readable cards.");
  }

  const name = file.name.replace(/\.(apkg|colpkg)$/i, "") || "Anki import";

  const notes: string[] = [];
  if (mediaCount > 0)
    notes.push(
      `${mediaCount} card${mediaCount === 1 ? "" : "s"} referenced media (images/audio) — text was preserved; embedded media import is coming soon.`,
    );
  if (hadScheduling)
    notes.push(
      "Your review history was detected but isn't mapped into spaced repetition yet — cards start fresh.",
    );
  const note = notes.length ? notes.join(" ") : undefined;

  return persistImportedDeck(name, cards, "anki", skipped, note);
}

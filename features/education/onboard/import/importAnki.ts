// features/education/onboard/import/importAnki.ts
//
// Anki `.apkg` importer (P9 — "turn the incumbents' libraries into our funnel").
// An `.apkg` is a zip containing an SQLite collection (`collection.anki2`, and
// on newer exports `collection.anki21`) plus a `media` map. We decode it fully
// CLIENT-SIDE: jszip to open the archive, sql.js (WASM, dynamically imported so
// it never touches the main bundle) to read the notes, and land a native deck.
//
// Preserved (the full switcher promise, IC-11):
//   • every note's fields → card front/back (HTML flattened to readable text)
//   • cloze notes → our native `cloze` card kind (same `{{c1::…}}` syntax)
//   • tags + deck path → card topic / metadata
//   • embedded media (images/audio) → uploaded via the ONE file entry point
//     (`fileHandler.upload`) and attached as fc_card → file edges
//   • scheduling — Anki's per-card interval/ease/due/lapses/reps mapped to
//     FSRS state and seeded through the ONE sanctioned RPC
//     `edu_import_review_history`, so a switching Anki user KEEPS their due
//     dates. Existing Matrx mastery rows are never overwritten.
//
// Still surfaced honestly: the newer zstd-compressed `collection.anki21b`
// needs a decompressor we don't ship; those files get a clear message to
// re-export as "legacy .apkg".
//
// `code-splitting`: jszip and sql.js load via dynamic import on first use.

import type { NewCardInput } from "@/features/flashcards/data/types";
import { hasClozeMarkup } from "@/features/flashcards/utils/cardVariants";
import { supabase } from "@/utils/supabase/client";
import { persistImportedDeck, type ImportOutcome } from "./importDeck";

/** Unit separator Anki uses to join note fields. */
const FIELD_SEP = "\x1f";

export function isAnkiFile(file: File): boolean {
  return /\.(apkg|colpkg)$/i.test(file.name);
}

/** Flatten Anki field HTML to readable plain text (drops tags, decodes entities). */
function htmlToText(html: string): string {
  let s = html
    .replace(/\[sound:[^\]]*\]/gi, " ")
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

/** Media filenames referenced by a note's fields (`<img src>`, `[sound:…]`). */
function mediaRefsOf(fields: string[]): { name: string; kind: "image" | "audio" | "video" }[] {
  const refs: { name: string; kind: "image" | "audio" | "video" }[] = [];
  const joined = fields.join("\n");
  for (const m of joined.matchAll(/<img[^>]+src=["']?([^"'\s>]+)["']?/gi)) {
    refs.push({ name: decodeURIComponent(m[1]), kind: "image" });
  }
  for (const m of joined.matchAll(/\[sound:([^\]]+)\]/gi)) {
    const name = m[1].trim();
    refs.push({ name, kind: /\.(mp4|mov|webm|mkv)$/i.test(name) ? "video" : "audio" });
  }
  return refs;
}

/** Anki scheduling state for one note's first card, mapped toward FSRS. */
interface AnkiScheduling {
  dueAt: Date;
  stability: number;
  difficulty: number;
  lapses: number;
  reps: number;
  lastReview: Date | null;
}

interface ParsedNote {
  card: NewCardInput;
  mediaNames: { name: string; kind: "image" | "audio" | "video" }[];
  scheduling: AnkiScheduling | null;
}

interface ParsedAnki {
  notes: ParsedNote[];
  skipped: number;
  /** zip-internal name → bytes getter, for referenced media only. */
  mediaByRealName: Map<string, () => Promise<Uint8Array>>;
  hadScheduling: boolean;
}

/** Map an Anki ease factor (permille, default 2500) to FSRS difficulty 1..10. */
function factorToDifficulty(factor: number): number {
  if (!factor || factor <= 0) return 5;
  return Math.min(10, Math.max(1, 5 + (2500 - factor) / 240));
}

/** Current FSRS retrievability given stability and days elapsed since review. */
function retrievabilityOf(stabilityDays: number, elapsedDays: number): number {
  if (stabilityDays <= 0) return 0.9;
  // FSRS forgetting curve: R = (1 + factor * t/S)^(-decay), classic parameters.
  const decay = 0.5;
  const factor = Math.pow(0.9, -1 / decay) - 1;
  return Math.pow(1 + (factor * Math.max(0, elapsedDays)) / stabilityDays, -decay);
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

  try {
    // Collection metadata: creation epoch (day origin for review due values)
    // and the deck-id → name map.
    let crtSec = 0;
    const deckNames = new Map<number, string>();
    try {
      const col = db.exec("SELECT crt, decks FROM col LIMIT 1");
      const row = col[0]?.values?.[0];
      crtSec = Number(row?.[0] ?? 0);
      const decksJson = typeof row?.[1] === "string" ? row[1] : "{}";
      const decks = JSON.parse(decksJson) as Record<string, { name?: string }>;
      for (const [id, d] of Object.entries(decks)) {
        if (d?.name) deckNames.set(Number(id), d.name.replace(/\x1f/g, " / "));
      }
    } catch {
      /* very old exports — deck names stay empty */
    }

    // Per-note scheduling: the note's FIRST card (ord 0) carries the state a
    // basic/cloze note's study history lives on. revlog gives last-review time.
    const schedByNote = new Map<number, AnkiScheduling>();
    let hadScheduling = false;
    try {
      const lastReviewByCard = new Map<number, number>();
      try {
        const rev = db.exec("SELECT cid, MAX(id) FROM revlog GROUP BY cid");
        for (const r of rev[0]?.values ?? []) {
          lastReviewByCard.set(Number(r[0]), Number(r[1]));
        }
      } catch {
        /* revlog absent — fine */
      }
      const cardsRes = db.exec(
        "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards ORDER BY ord",
      );
      for (const r of cardsRes[0]?.values ?? []) {
        const [cid, nid, did, , type, queue, due, ivl, factor, reps, lapses] = r.map(Number);
        if (schedByNote.has(nid)) continue; // first card only
        // Only review-state cards carry a meaningful interval; new/learning
        // cards start fresh here, which is correct.
        if (!(ivl > 0 && reps > 0 && (type === 2 || type === 3 || queue === 2))) continue;
        hadScheduling = true;
        // Review cards: `due` is days since collection creation. Guard against
        // learning-card epoch-second values that slipped through.
        const dueMs =
          due > 100000 ? due * 1000 : (crtSec + due * 86400) * 1000;
        const lastMs = lastReviewByCard.get(cid) ?? null;
        schedByNote.set(nid, {
          dueAt: new Date(dueMs),
          stability: Math.max(0.1, ivl),
          difficulty: factorToDifficulty(factor),
          lapses: Math.max(0, lapses),
          reps: Math.max(0, reps),
          lastReview: lastMs ? new Date(lastMs) : null,
        });
        // Deck name noted on the map key side; did unused otherwise.
        void did;
      }
    } catch {
      /* cards table unreadable — import content without scheduling */
    }

    // Media map: zip stores files under numeric names; the `media` JSON entry
    // maps zip name → real filename.
    const mediaByRealName = new Map<string, () => Promise<Uint8Array>>();
    try {
      const mediaEntry = zip.file("media");
      if (mediaEntry) {
        const map = JSON.parse(await mediaEntry.async("string")) as Record<string, string>;
        for (const [zipName, realName] of Object.entries(map)) {
          const f = zip.file(zipName);
          if (f) mediaByRealName.set(realName, () => f.async("uint8array"));
        }
      }
    } catch {
      /* media map unreadable — import proceeds without media */
    }

    // Deck name per note (via its first card's deck).
    const deckByNote = new Map<number, string>();
    try {
      const res = db.exec("SELECT nid, did FROM cards GROUP BY nid");
      for (const r of res[0]?.values ?? []) {
        const name = deckNames.get(Number(r[1]));
        if (name) deckByNote.set(Number(r[0]), name);
      }
    } catch {
      /* fine */
    }

    const notes: ParsedNote[] = [];
    let skipped = 0;
    const res = db.exec("SELECT id, flds, tags FROM notes");
    for (const row of res[0]?.values ?? []) {
      const nid = Number(row[0]);
      const flds = typeof row[1] === "string" ? row[1] : "";
      const tags = typeof row[2] === "string" ? row[2].trim() : "";
      const fields = flds.split(FIELD_SEP);
      const mediaNames = mediaRefsOf(fields);

      const isCloze = hasClozeMarkup(fields[0] ?? "");
      // Cloze source keeps its {{c1::…}} markup — our native cloze kind uses
      // the same Anki syntax (cardVariants.ts).
      const front = htmlToText(fields[0] ?? "");
      const back = htmlToText(fields.slice(1).join("\n\n"));
      if (!front && !back) {
        skipped++;
        continue;
      }
      const deckPath = deckByNote.get(nid);
      const tagList = tags ? tags.split(/\s+/).filter(Boolean) : [];
      notes.push({
        card: {
          front: front || back,
          back: front ? back : "",
          card_kind: isCloze ? "cloze" : "basic",
          topic: deckPath ?? undefined,
          ...(tagList.length ? { metadata: { tags: tagList } } : {}),
        },
        mediaNames,
        scheduling: schedByNote.get(nid) ?? null,
      });
    }

    return { notes, skipped, mediaByRealName, hadScheduling };
  } finally {
    db.close();
  }
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
  flac: "audio/flac", opus: "audio/opus",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

function mimeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Upload every referenced media file once; returns real name → file_id. */
async function uploadReferencedMedia(
  parsed: ParsedAnki,
  deckName: string,
): Promise<{ byName: Map<string, string>; failed: number }> {
  const wanted = new Set<string>();
  for (const n of parsed.notes) for (const m of n.mediaNames) wanted.add(m.name);
  const byName = new Map<string, string>();
  let failed = 0;
  if (wanted.size === 0) return { byName, failed };

  const { fileHandler } = await import("@/features/files/handler/handler");
  const folderPath = `Imports/Anki/${deckName.slice(0, 60)}`;
  for (const name of wanted) {
    const getBytes = parsed.mediaByRealName.get(name);
    if (!getBytes) continue; // referenced but not in the archive
    try {
      const bytes = await getBytes();
      const uploaded = await fileHandler.upload(
        { kind: "buffer", buffer: bytes, mime: mimeOf(name), fileName: name },
        { folderPath, metadata: { imported_from: "anki" } },
      );
      byName.set(name, uploaded.fileId);
    } catch (e) {
      failed++;
      console.error(`[importAnki] media upload failed for "${name}":`, e);
    }
  }
  return { byName, failed };
}

/** Import an Anki `.apkg` file as a native deck — content, media, scheduling. */
export async function importAnkiFile(file: File): Promise<ImportOutcome> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const parsed = await parseApkg(buf);
  if (parsed.notes.length === 0) {
    throw new Error("That Anki deck had no readable cards.");
  }

  const name = file.name.replace(/\.(apkg|colpkg)$/i, "") || "Anki import";

  // 1) Upload referenced media through the ONE file entry point.
  const media = await uploadReferencedMedia(parsed, name);

  // 2) Attach media refs to their cards.
  const cards: NewCardInput[] = parsed.notes.map((n) => {
    const refs = n.mediaNames
      .filter((m) => media.byName.has(m.name))
      .map((m) => ({
        file_id: media.byName.get(m.name)!,
        kind: m.kind,
        source_name: m.name,
      }));
    return refs.length ? { ...n.card, media: refs } : n.card;
  });

  // 3) Land the deck through the ONE import entry (IC-11).
  const outcome = await persistImportedDeck({
    name,
    cards,
    format: "anki",
    skipped: parsed.skipped,
  });

  // 4) Seed review history through the ONE sanctioned RPC, so due dates
  //    survive the move. Never overwrites existing Matrx mastery.
  let seeded = 0;
  const withSched = parsed.notes
    .map((n, i) => ({ sched: n.scheduling, cardId: outcome.cardIds[i] }))
    .filter((x): x is { sched: AnkiScheduling; cardId: string } => !!x.sched && !!x.cardId);
  if (withSched.length > 0) {
    const now = Date.now();
    const items = withSched.map(({ sched, cardId }) => {
      const elapsedDays = sched.lastReview
        ? (now - sched.lastReview.getTime()) / 86400000
        : 0;
      return {
        item_id: cardId,
        due_at: sched.dueAt.toISOString(),
        stability: sched.stability,
        difficulty: Number(sched.difficulty.toFixed(2)),
        retrievability: Number(
          retrievabilityOf(sched.stability, elapsedDays).toFixed(4),
        ),
        lapses: sched.lapses,
        reps: sched.reps,
        last_review: sched.lastReview ? sched.lastReview.toISOString() : null,
        source: "anki",
      };
    });
    const { data, error } = await supabase.rpc("edu_import_review_history", {
      p_items: items,
    });
    if (error) {
      console.error("[importAnki] review-history seed failed:", error);
    } else {
      seeded = (data as { seeded?: number } | null)?.seeded ?? 0;
    }
  }

  const notes: string[] = [];
  if (media.byName.size > 0)
    notes.push(
      `${media.byName.size} media file${media.byName.size === 1 ? "" : "s"} imported to your files and attached to their cards.`,
    );
  if (media.failed > 0)
    notes.push(`${media.failed} media file${media.failed === 1 ? "" : "s"} couldn't be uploaded.`);
  if (seeded > 0)
    notes.push(
      `Review history for ${seeded} card${seeded === 1 ? "" : "s"} was mapped into spaced repetition — your due dates survived the move.`,
    );
  else if (parsed.hadScheduling)
    notes.push(
      "Review history was detected but couldn't be mapped this time — cards start fresh.",
    );

  return { ...outcome, note: notes.length ? notes.join(" ") : undefined };
}

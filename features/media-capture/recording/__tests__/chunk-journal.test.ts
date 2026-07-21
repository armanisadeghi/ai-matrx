/**
 * Chunk-journal tests on fake-indexeddb: append/finalize idempotence,
 * recovery listing, expiry purge, quota preflight rejection, ordered reads
 * with loud gap reporting.
 */

import "fake-indexeddb/auto";
import {
  __resetJournalDb,
  appendChunk,
  createJournal,
  discardJournal,
  finalizeJournal,
  listRecoverable,
  purgeExpired,
  readChunks,
  StorageQuotaError,
  JOURNAL_MIN_FREE_BYTES,
} from "@/features/media-capture/recording/chunk-journal";

const blob = (size: number, type = "video/webm") =>
  new Blob([new Uint8Array(size)], { type });

const plenty = async () => ({ usage: 0, quota: Number.MAX_SAFE_INTEGER });

describe("chunk-journal", () => {
  beforeEach(async () => {
    await __resetJournalDb();
  });

  test("quota preflight rejects below the safety margin with StorageQuotaError", async () => {
    await expect(
      createJournal("cap-quota", {
        mime: null,
        sourceFeature: "camera",
        estimateStorage: async () => ({
          usage: 0,
          quota: JOURNAL_MIN_FREE_BYTES - 1,
        }),
      }),
    ).rejects.toBeInstanceOf(StorageQuotaError);
  });

  test("append + finalize is idempotent; manifest tracks bytes and sequence", async () => {
    await createJournal("cap-1", {
      mime: "video/webm",
      sourceFeature: "camera",
      hasAudio: true,
      estimateStorage: plenty,
    });
    await appendChunk("cap-1", 0, blob(100));
    await appendChunk("cap-1", 1, blob(50));

    const first = await finalizeJournal("cap-1", "video/webm");
    expect(first?.status).toBe("finalized");
    expect(first?.emitted_bytes).toBe(150);
    expect(first?.last_sequence).toBe(1);
    expect(first?.has_audio).toBe(true);

    // Idempotent re-finalize.
    const second = await finalizeJournal("cap-1");
    expect(second).toEqual(first);
  });

  test("readChunks returns ordered blobs and screams about gaps", async () => {
    await createJournal("cap-2", {
      mime: "video/webm",
      sourceFeature: "camera",
      estimateStorage: plenty,
    });
    // Out-of-order writes, one gap (sequence 1 never lands).
    await appendChunk("cap-2", 2, blob(30));
    await appendChunk("cap-2", 0, blob(10));

    const read = await readChunks("cap-2");
    expect(read.chunks.map((c) => c.size)).toEqual([10, 30]);
    expect(read.expectedChunks).toBe(3);
    expect(read.missingSequences).toEqual([1]);
  });

  test("listRecoverable: interrupted vs finalized, skips discarded/empty", async () => {
    // Interrupted (never finalized) with chunks → recoverable, interrupted.
    await createJournal("cap-int", {
      mime: "video/webm",
      sourceFeature: "camera",
      estimateStorage: plenty,
    });
    await appendChunk("cap-int", 0, blob(10));

    // Finalized with chunks → recoverable, not interrupted.
    await createJournal("cap-fin", {
      mime: "audio/webm",
      sourceFeature: "camera",
      estimateStorage: plenty,
    });
    await appendChunk("cap-fin", 0, blob(10));
    await finalizeJournal("cap-fin");

    // Zero chunks → nothing to recover.
    await createJournal("cap-empty", {
      mime: null,
      sourceFeature: "camera",
      estimateStorage: plenty,
    });

    // Discarded → gone.
    await createJournal("cap-disc", {
      mime: null,
      sourceFeature: "camera",
      estimateStorage: plenty,
    });
    await appendChunk("cap-disc", 0, blob(10));
    await discardJournal("cap-disc");

    const recoverable = await listRecoverable();
    const ids = recoverable.map((r) => r.manifest.capture_id).sort();
    expect(ids).toEqual(["cap-fin", "cap-int"]);
    const byId = new Map(recoverable.map((r) => [r.manifest.capture_id, r]));
    expect(byId.get("cap-int")?.interrupted).toBe(true);
    expect(byId.get("cap-fin")?.interrupted).toBe(false);
  });

  test("purgeExpired removes expired journals (chunks + manifest)", async () => {
    await createJournal("cap-old", {
      mime: "video/webm",
      sourceFeature: "camera",
      retentionMs: -1, // already expired
      estimateStorage: plenty,
    });
    await appendChunk("cap-old", 0, blob(10));
    await createJournal("cap-new", {
      mime: "video/webm",
      sourceFeature: "camera",
      estimateStorage: plenty,
    });
    await appendChunk("cap-new", 0, blob(10));

    const removed = await purgeExpired();
    expect(removed).toBe(1);

    const recoverable = await listRecoverable();
    expect(recoverable.map((r) => r.manifest.capture_id)).toEqual(["cap-new"]);
    await expect(readChunks("cap-old")).rejects.toThrow(/no manifest/);
  });
});

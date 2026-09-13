/**
 * THE ONE CLIENT STORE writes the SERVER's provenance shape (DD-131 slice 1).
 *
 * The defect this guards (V-42 §3.4): the chat Save button wrote
 * `metadata.home = { conversation_id, message_id }` while aidream's server
 * store wrote `metadata.home = { conversation_id }` plus
 * `metadata.source = { message_id, fingerprint, block_id }`. One fact, two
 * shapes. Run against the old `saveRecordFromBlock`, the first assertion below
 * fails on `metadata.source` being undefined and the second fails on
 * `home.message_id` being present.
 *
 * The literals here are the shape READ OFF A REAL SERVER-WRITTEN ROW
 * (`f415506e-…`, `platform.associations 74961d6d…`, 2026-09-12) — not a
 * restatement of the code under test.
 */

import { buildRecordMetadata } from "@/features/content-ir/studio/store-kind-record";

describe("buildRecordMetadata — the server's shape, exactly", () => {
  it("homes the record in the conversation and sources it from the message", () => {
    const metadata = buildRecordMetadata({
      conversationId: "507c22f0-00dc-4ccb-8928-00e3b56e3e2d",
      messageId: "c4ba37f7-5072-4e01-8be3-ab9e37d5d621",
      fingerprint: "7s-vzrvtcec09xu",
    });

    expect(metadata).toEqual({
      home: { conversation_id: "507c22f0-00dc-4ccb-8928-00e3b56e3e2d" },
      source: {
        message_id: "c4ba37f7-5072-4e01-8be3-ab9e37d5d621",
        fingerprint: "7s-vzrvtcec09xu",
      },
    });
  });

  it("never puts the message id in home — that was the divergence", () => {
    const metadata = buildRecordMetadata({
      conversationId: "507c22f0-00dc-4ccb-8928-00e3b56e3e2d",
      messageId: "c4ba37f7-5072-4e01-8be3-ab9e37d5d621",
    });
    const home = (metadata as { home: Record<string, unknown> }).home;
    expect(Object.keys(home)).toEqual(["conversation_id"]);
  });

  it("omits a key it cannot honestly fill rather than inventing one", () => {
    // No fingerprint observed (a parse-fallback block carries no envelope).
    const metadata = buildRecordMetadata({
      conversationId: "c1",
      messageId: "m1",
    });
    expect((metadata as { source: Record<string, unknown> }).source).toEqual({
      message_id: "m1",
    });
  });

  it("writes no provenance at all for a save that has none (the Test tab)", () => {
    expect(buildRecordMetadata(undefined)).toBeNull();
    expect(buildRecordMetadata({})).toBeNull();
  });
});

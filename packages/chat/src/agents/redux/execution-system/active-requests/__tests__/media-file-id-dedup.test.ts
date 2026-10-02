/**
 * REGRESSION GUARD: the same file never renders twice in one assistant turn.
 *
 * An image-producing agent used to hand the calling model a SIGNED URL as text.
 * The model pasted it into its answer, the accumulator turned that markdown
 * line into its own `image` block, and the user saw the picture twice — once as
 * the media block, once as prose. The server no longer hands out URLs, so the
 * model has nothing to paste; these tests make that a STRUCTURAL guarantee
 * rather than a bet on how the model behaves.
 *
 * Drives the REAL reducer and the REAL selector.
 */

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import {
  createRequest,
  upsertRenderBlock,
  appendTimeline,
} from "../active-requests.slice";
import { selectUnifiedSlots } from "../active-requests.selectors";

const REQ = "req_media_dedup";
const CONV = "conv_media_dedup";

const FILE_ID = "6feae31a-945b-4dcc-8fc0-2041bb76c6b1";
const OWNER_ID = "4cf62e4e-2679-484f-b652-034e697418df";
const SIGNED_URL =
  `https://matrx-user-files.s3.amazonaws.com/${OWNER_ID}/${FILE_ID}` +
  `?response-content-type=image%2Fpng&AWSAccessKeyId=AKIAEXAMPLE` +
  `&Signature=abc123&Expires=1786485620`;

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

/** Dispatch a render block exactly the way process-stream does. */
function pushBlock(
  store: ReturnType<typeof makeStore>,
  block: Omit<RenderBlockPayload, "status" | "metadata">,
  timestamp: number,
) {
  const full = { status: "complete" as const, metadata: undefined, ...block };
  store.dispatch(upsertRenderBlock({ requestId: REQ, block: full }));
  store.dispatch(
    appendTimeline({
      requestId: REQ,
      entry: { kind: "render_block", seq: 0, timestamp, data: full },
    }),
  );
}

function slotBlockIds(store: ReturnType<typeof makeStore>): string[] {
  return selectUnifiedSlots(REQ)(store.getState())
    .filter((s) => s.kind === "render_block")
    .map((s) => (s as { blockId: string }).blockId);
}

function freshStore() {
  const store = makeStore();
  store.dispatch(createRequest({ requestId: REQ, conversationId: CONV }));
  return store;
}

test("a markdown image of a file already shown as a media block is dropped", () => {
  const store = freshStore();

  // The real image, as the server emits it — identity is the file_id.
  pushBlock(
    store,
    {
      blockId: "blk_media",
      blockIndex: 0,
      type: "image_output",
      content: null,
      data: { type: "image_output", file_id: FILE_ID, mime_type: "image/png" },
    },
    1,
  );

  // The model parroting a signed URL for the SAME file into its prose.
  pushBlock(
    store,
    {
      blockId: "blk_markdown",
      blockIndex: 1,
      type: "image",
      content: `![TikTok Algorithm 2026 infographic](${SIGNED_URL})`,
      data: null,
    },
    2,
  );

  // The media block wins; the duplicate never becomes a slot.
  expect(slotBlockIds(store)).toEqual(["blk_media"]);
});

test("two DIFFERENT files both render", () => {
  const store = freshStore();
  const otherId = "8cf0a98a-c9cb-4180-a334-d622bcaf3a85";

  pushBlock(
    store,
    {
      blockId: "blk_a",
      blockIndex: 0,
      type: "image_output",
      content: null,
      data: { type: "image_output", file_id: FILE_ID },
    },
    1,
  );
  pushBlock(
    store,
    {
      blockId: "blk_b",
      blockIndex: 1,
      type: "image_output",
      content: null,
      data: { type: "image_output", file_id: otherId },
    },
    2,
  );

  expect(slotBlockIds(store)).toEqual(["blk_a", "blk_b"]);
});

test("a text block carrying the same URL is NOT deduped away", () => {
  const store = freshStore();

  pushBlock(
    store,
    {
      blockId: "blk_media",
      blockIndex: 0,
      type: "image_output",
      content: null,
      data: { type: "image_output", file_id: FILE_ID },
    },
    1,
  );
  // Prose that merely mentions the link must still render — text is not a
  // media surface, and silently eating a paragraph would be a worse bug.
  pushBlock(
    store,
    {
      blockId: "blk_text",
      blockIndex: 1,
      type: "text",
      content: `I saved it here: ${SIGNED_URL}`,
      data: null,
    },
    2,
  );

  expect(slotBlockIds(store)).toEqual(["blk_media", "blk_text"]);
});

test("external images are never deduped against each other", () => {
  const store = freshStore();

  // Two different external images: no file_id to compare, so both must render.
  pushBlock(
    store,
    {
      blockId: "blk_ext_1",
      blockIndex: 0,
      type: "image",
      content: "![one](https://example.com/a.png)",
      data: null,
    },
    1,
  );
  pushBlock(
    store,
    {
      blockId: "blk_ext_2",
      blockIndex: 1,
      type: "image",
      content: "![two](https://example.com/b.png)",
      data: null,
    },
    2,
  );

  expect(slotBlockIds(store)).toEqual(["blk_ext_1", "blk_ext_2"]);
});

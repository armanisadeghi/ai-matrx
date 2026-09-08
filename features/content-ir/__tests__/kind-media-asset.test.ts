/**
 * `media_asset` bridge — HALF ONE of the acceptance test for Arman's
 * 2026-09-08 media-kind ruling.
 *
 * The ruling: structured media instructions make the render RICHER; they must
 * never cost us the ability to handle a bare handle. So this suite pins both
 * ends of the same contract:
 *
 *   - a FULL typed instance resolves per `media_type`;
 *   - `media_type: "unknown"` with only a url is NORMAL — it yields a working
 *     address, never a guessed image;
 *   - a `file_id`-only instance is VALID and simply has no address yet;
 *   - a signed/expiring URL with no recoverable identity degrades to nothing
 *     renderable and never leaks the credential.
 *
 * HALF TWO — that the bare-string markdown paths still behave exactly as they
 * did before this kind existed — lives in
 * `components/mardown-display/markdown-classification/processors/utils/__tests__/media-degradation-floor.test.ts`.
 */

import {
  MEDIA_ASSET_KIND_DEFINITIONS,
  mediaAssetKindSchema,
  mediaAssetMarkdownFromValue,
  mediaAssetServerDataFromEnvelope,
  readMediaAsset,
} from "../kinds/media-asset";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";

const CDN = "https://cdn.matrxserver.com/public/clip.mp4";
const FILE_ID = "05b3d296-1a4c-4c31-8ad7-9d5a2b0f1e77";
const SIGNED =
  "https://matrx-user-files.s3.amazonaws.com/tenant/secret.bin?X-Amz-Signature=deadbeef&X-Amz-Expires=900";

describe("media_asset — registration", () => {
  it("is registered as a compiled system kind with a component bridge", () => {
    const def = SYSTEM_KIND_DEFINITIONS.find((d) => d.kind === "media_asset");
    expect(def).toBeDefined();
    expect(def).toBe(MEDIA_ASSET_KIND_DEFINITIONS[0]);
    // The compiled component floor (system-components.ts) is DERIVED from
    // `legacyBlockType`, so this string is what makes the kind resolvable.
    expect(def?.legacyBlockType).toBe("media_asset");
    expect(def?.toLegacyServerData).toBeDefined();
    expect(def?.toMarkdown).toBeDefined();
  });

  it("mirrors the live registry contract: only __kind is required, single level", () => {
    // Every declared field is optional — that is the load-bearing property
    // that lets the degraded producer path always validate.
    for (const [name, field] of Object.entries(mediaAssetKindSchema.fields)) {
      expect([name, field.required ?? false]).toEqual([name, false]);
      // Single level, no nesting: no object/array refs to other kinds.
      expect(["object", "array", "inline_object"]).not.toContain(field.type);
    }
    expect(Object.keys(mediaAssetKindSchema.fields).sort()).toEqual(
      [
        "cdn_url",
        "download_url",
        "duration_ms",
        "external_url",
        "file_id",
        "file_name",
        "height",
        "media_type",
        "metadata",
        "mime_type",
        "origin",
        "page_count",
        "poster_url",
        "size_bytes",
        "source_label",
        "transcript",
        "url",
        "width",
      ].sort(),
    );
  });
});

describe("(a) a full typed instance resolves per media_type", () => {
  it("image — durable CDN address, embeddable, with a working link", () => {
    const data = readMediaAsset({
      __kind: "media_asset",
      media_type: "image",
      origin: "matrx",
      cdn_url: "https://cdn.matrxserver.com/public/shot.png",
      mime_type: "image/png",
      file_name: "shot.png",
      width: 1200,
      height: 800,
      size_bytes: 51200,
      metadata: {},
    });
    expect(data.effectiveMediaType).toBe("image");
    expect(data.address).toBe("https://cdn.matrxserver.com/public/shot.png");
    expect(data.mediaRef).toEqual({
      url: "https://cdn.matrxserver.com/public/shot.png",
      mime_type: "image/png",
    });
    expect(data.linkHref).toBe("https://cdn.matrxserver.com/public/shot.png");
    expect(data.unresolvable).toBe(false);
  });

  it("video / audio / document each keep their declared type", () => {
    for (const media_type of ["video", "audio", "document"] as const) {
      const data = readMediaAsset({ __kind: "media_asset", media_type, url: CDN });
      expect(data.effectiveMediaType).toBe(media_type);
      expect(data.mediaRef).not.toBeNull();
    }
  });

  it("youtube — the external address yields the video id for the one embed", () => {
    const data = readMediaAsset({
      __kind: "media_asset",
      media_type: "youtube",
      origin: "external",
      external_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
    });
    expect(data.effectiveMediaType).toBe("youtube");
    expect(data.youtubeId).toBe("dQw4w9WgXcQ");
    expect(data.origin).toBe("external");
  });

  it("a declared mime promotes an untyped asset — reading a field, never guessing", () => {
    const data = readMediaAsset({
      __kind: "media_asset",
      media_type: "unknown",
      url: CDN,
      mime_type: "video/mp4",
    });
    expect(data.media_type).toBe("unknown");
    expect(data.effectiveMediaType).toBe("video");
  });
});

describe('(b) media_type "unknown" with only a url — the NORMAL case', () => {
  // The real producer instance, verbatim from the server lane.
  const REAL = {
    __kind: "media_asset",
    media_type: "unknown",
    origin: "matrx",
    url: `https://server.app.matrxserver.com/files/${FILE_ID}/download?inline=1`,
    metadata: {},
  };

  it("stays unknown and yields a WORKING address — never a guessed image", () => {
    const data = readMediaAsset(REAL);
    expect(data.media_type).toBe("unknown");
    expect(data.effectiveMediaType).toBe("unknown");
    expect(data.address).toBe(REAL.url);
    // Resolvable (the URL is durable), so there IS a door…
    expect(data.mediaRef).toEqual({ url: REAL.url });
    expect(data.linkHref).toBe(REAL.url);
    // …and nothing in the bridge claims it is an image.
    expect(data.mime_type).toBeNull();
    expect(data.unresolvable).toBe(false);
  });

  it("markdown export is a LINK, not an image embed", () => {
    const md = mediaAssetMarkdownFromValue(REAL);
    expect(md).toContain(`(${REAL.url})`);
    expect(md).not.toContain(`![`);
  });

  it("an unknown asset with no locator at all is still readable, not a throw", () => {
    const data = readMediaAsset({ __kind: "media_asset" });
    expect(data.effectiveMediaType).toBe("unknown");
    expect(data.address).toBeNull();
    expect(data.mediaRef).toBeNull();
    expect(data.unresolvable).toBe(false); // nothing was supplied — not a refusal
    expect(data.metadata).toEqual({});
    expect(data.origin).toBe("matrx");
  });
});

describe("(c) a file_id-only instance is valid and has no address yet", () => {
  const ONLY_ID = { __kind: "media_asset", file_id: FILE_ID };

  it("resolves to the durable identity with a null address", () => {
    const data = readMediaAsset(ONLY_ID);
    expect(data.address).toBeNull();
    expect(data.mediaRef).toEqual({ file_id: FILE_ID });
    // No href — the component opens the file preview rather than drawing a
    // dead anchor at a URL we do not have.
    expect(data.linkHref).toBeNull();
    expect(data.unresolvable).toBe(false);
  });

  it("markdown names the file instead of emitting an empty link", () => {
    const md = mediaAssetMarkdownFromValue(ONLY_ID);
    expect(md).toContain(FILE_ID);
    expect(md).not.toContain("]()");
  });
});

describe("(d) a signed/expiring URL with no recoverable identity degrades — and never leaks", () => {
  const LEAKY = { __kind: "media_asset", media_type: "image", url: SIGNED };

  it("refuses to render it and says so, rather than exposing the credential", () => {
    const data = readMediaAsset(LEAKY);
    expect(data.mediaRef).toBeNull();
    expect(data.linkHref).toBeNull();
    expect(data.unresolvable).toBe(true);
    // The address field still reports what arrived (diagnostics), but nothing
    // the component binds to carries the signature.
    expect(data.address).toBe(SIGNED);
  });

  it("markdown never emits the signed URL", () => {
    const md = mediaAssetMarkdownFromValue(LEAKY);
    expect(md).not.toContain("X-Amz-Signature");
    expect(md).toContain("expires");
  });

  it("a signed URL WITH a file_id still resolves — identity beats the handoff", () => {
    const data = readMediaAsset({
      __kind: "media_asset",
      media_type: "image",
      file_id: FILE_ID,
      url: SIGNED,
    });
    expect(data.mediaRef).toEqual({ file_id: FILE_ID });
    expect(data.unresolvable).toBe(false);
    expect(data.linkHref).toBeNull();
  });
});

describe("envelope bridge", () => {
  const envelope = (
    value: Record<string, unknown>,
    status: "partial" | "complete",
  ) =>
    ({
      root: { kind: "media_asset", value, status },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it("only claims its own kind", () => {
    expect(
      mediaAssetServerDataFromEnvelope(envelope({}, "complete")),
    ).toBeDefined();
    const foreign = { root: { kind: "generated_audio", value: {}, status: "complete" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(mediaAssetServerDataFromEnvelope(foreign as any)).toBeUndefined();
  });

  it("carries the completion flag through", () => {
    expect(
      mediaAssetServerDataFromEnvelope(envelope({ url: CDN }, "partial"))
        ?.isComplete,
    ).toBe(false);
    expect(
      mediaAssetServerDataFromEnvelope(envelope({ url: CDN }, "complete"))
        ?.isComplete,
    ).toBe(true);
  });

  it("is partial-tolerant — a half-parsed object renders its known fields", () => {
    const data = mediaAssetServerDataFromEnvelope(
      envelope({ file_name: "half" }, "partial"),
    );
    expect(data?.file_name).toBe("half");
    expect(data?.effectiveMediaType).toBe("unknown");
  });
});

describe("markdown export keeps unknown keys visible", () => {
  it("appends producer extras under Additional details", () => {
    const md = mediaAssetMarkdownFromValue({
      __kind: "media_asset",
      media_type: "image",
      cdn_url: "https://cdn.matrxserver.com/public/a.png",
      shot_by: "camera-1",
    });
    expect(md).toContain("shot_by");
    expect(md).toContain("camera-1");
  });
});

/**
 * The diagnostics binding: a media render that HEALS is captured as its own
 * family (`media-healed`), with the named root cause as the code and the
 * whole ladder on the row, pinned durable — never the quiet norm.
 */
const captureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));
jest.mock("@ai-matrx/media/next", () => ({ NextMediaImage: () => null }));
jest.mock("@/features/audio/useOutputSinkRef", () => ({ useOutputSinkRef: () => () => {} }));
jest.mock("@/features/audio/session/useMediaElementPlaybackSession", () => ({
  useMediaElementPlaybackSession: () => {},
}));
jest.mock("@/features/files/components/preview/openFilePreview", () => ({ openFilePreview: () => {} }));
jest.mock("./client", () => ({ mediaClient: {}, mediaFilesClient: {} }));
jest.mock("./share-slot", () => ({ MediaSharePopoverSlot: () => null }));
jest.mock("./download", () => ({ downloadMediaSource: async () => {}, mediaRefToDownloadSource: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: () => {}, success: () => {} } }));

import { mediaHostPorts } from "./ports";
import type { MediaFailureInfo } from "@ai-matrx/media";

const attempts: NonNullable<MediaFailureInfo["attempts"]> = [
  { lane: "session-refresh-retry", outcome: "http-error", ms: 0 },
  { lane: "bearer-blob", outcome: "ok", status: 200, ms: 42, host: "https://files.matrxserver.com" },
];

describe("media diagnostics port → error catcher", () => {
  beforeEach(() => captureError.mockClear());

  it("a HEALED render is its own family, code = healed:<diagnosis>, durable", () => {
    mediaHostPorts.diagnostics!.capture!({
      source: "media",
      phase: "heal",
      mediaRef: "file:a2458139",
      terminal: false,
      healed: true,
      healedBy: "bearer-blob",
      attempts,
      diagnosis: "cookie-not-sent-by-browser",
      retryOutcome: "retried",
      message: "HEALED (bearer-blob): third-party cookies blocked; served via bearer-blob in 42ms",
    });
    expect(captureError).toHaveBeenCalledTimes(1);
    const entry = captureError.mock.calls[0]![0];
    expect(entry).toMatchObject({
      source: "media-healed",
      code: "healed:cookie-not-sent-by-browser",
      durable: true,
      relation: "file:a2458139",
    });
    expect(entry.details).toMatch(/HEALED via bearer-blob/);
    expect(entry.details).toMatch(/bearer-blob:ok 200 42ms/);
    expect(entry.raw.attempts).toHaveLength(2);
  });

  it("a DEAD ladder stays in the media family with the diagnosis as code", () => {
    mediaHostPorts.diagnostics!.capture!({
      source: "media",
      phase: "heal",
      mediaRef: "file:dead",
      terminal: true,
      healed: false,
      attempts: [{ lane: "bearer-blob", outcome: "http-error", status: 401, ms: 30 }],
      diagnosis: "bearer-rejected",
      message: "DEAD after 2 lane(s): bearer refused",
    });
    expect(captureError.mock.calls[0]![0]).toMatchObject({
      source: "media",
      code: "bearer-rejected",
      durable: true,
      recoverable: false,
    });
  });

  it("pre-ladder reports (no diagnosis) are unchanged: no code, not force-pinned", () => {
    mediaHostPorts.diagnostics!.capture!({
      source: "media",
      phase: "element-load",
      mediaRef: "file:old",
      terminal: true,
      retryOutcome: "retried",
      message: "media element failed to load after the session-refresh retry",
    });
    const entry = captureError.mock.calls[0]![0];
    expect(entry.source).toBe("media");
    expect(entry).not.toHaveProperty("code");
    expect(entry).not.toHaveProperty("durable");
  });
});

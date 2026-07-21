import { extensionForMime, selectRecordingMime } from "../mime-selection";

describe("selectRecordingMime", () => {
  it("video: first supported candidate wins (mp4 + aac at the top)", () => {
    expect(selectRecordingMime("video", () => true)).toBe(
      "video/mp4;codecs=avc1.42000a,mp4a.40.2",
    );
  });

  it("video: falls through to mp4+opus, then bare mp4, then webm ladder", () => {
    expect(
      selectRecordingMime("video", (t) => t === "video/mp4;codecs=avc1.42000a,opus"),
    ).toBe("video/mp4;codecs=avc1.42000a,opus");
    expect(selectRecordingMime("video", (t) => t === "video/mp4")).toBe("video/mp4");
    expect(
      selectRecordingMime("video", (t) => t.startsWith("video/webm")),
    ).toBe("video/webm;codecs=vp9,opus");
    expect(
      selectRecordingMime("video", (t) => t === "video/webm;codecs=vp8,opus" || t === "video/webm"),
    ).toBe("video/webm;codecs=vp8,opus");
    expect(selectRecordingMime("video", (t) => t === "video/webm")).toBe("video/webm");
  });

  it("audio: walks audio/mp4;codecs → audio/mp4 → audio/webm;codecs=opus", () => {
    expect(selectRecordingMime("audio", () => true)).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(selectRecordingMime("audio", (t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(
      selectRecordingMime("audio", (t) => t === "audio/webm;codecs=opus"),
    ).toBe("audio/webm;codecs=opus");
  });

  it("returns null (browser default) when nothing is supported", () => {
    expect(selectRecordingMime("video", () => false)).toBeNull();
    expect(selectRecordingMime("audio", () => false)).toBeNull();
  });

  it("only probes concrete strings — no wildcards ever offered", () => {
    const probed: string[] = [];
    selectRecordingMime("video", (t) => {
      probed.push(t);
      return false;
    });
    selectRecordingMime("audio", (t) => {
      probed.push(t);
      return false;
    });
    for (const t of probed) {
      expect(t).not.toContain("*");
    }
    expect(probed.length).toBe(9);
  });
});

describe("extensionForMime", () => {
  it("maps containers with codecs params stripped", () => {
    expect(extensionForMime("video/mp4;codecs=avc1.42000a,mp4a.40.2")).toBe("mp4");
    expect(extensionForMime("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMime("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
  });

  it("maps bare containers", () => {
    expect(extensionForMime("video/mp4")).toBe("mp4");
    expect(extensionForMime("video/webm")).toBe("webm");
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("audio/webm")).toBe("webm");
    expect(extensionForMime("audio/ogg")).toBe("ogg");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("audio/wav")).toBe("wav");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("video/quicktime")).toBe("mov");
  });

  it("is case/whitespace tolerant on the container", () => {
    expect(extensionForMime(" Video/MP4 ; codecs=avc1")).toBe("mp4");
  });

  it("throws loudly on empty or unknown containers", () => {
    expect(() => extensionForMime("")).toThrow(/empty MIME/);
    expect(() => extensionForMime("application/x-mystery")).toThrow(/unrecognized container/);
  });
});

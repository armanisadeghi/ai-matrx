import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrl,
} from "@/lib/media/object-url-registry";

export interface InspectedVideoFile {
  mime: string;
  durationMs: number;
}

/**
 * Read the durable MIME/duration facts for a user-picked video. Recorded
 * videos already carry these facts from the capture engine and do not need a
 * second probe. A codec that never reports metadata resolves to 1 ms so the
 * upload remains finite and positive instead of hanging forever.
 */
export function inspectVideoFile(file: File): Promise<InspectedVideoFile> {
  if (!file.type.startsWith("video/")) {
    return Promise.reject(
      new Error(
        `inspectVideoFile requires a video MIME; received "${file.type}".`,
      ),
    );
  }
  return new Promise((resolve) => {
    const url = createTrackedObjectUrl(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (ms: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      revokeTrackedObjectUrl(url);
      video.removeAttribute("src");
      resolve({
        mime: file.type,
        durationMs: Math.max(1, Math.round(ms)),
      });
    };
    video.preload = "metadata";
    const deadline = setTimeout(() => done(1), 10_000);
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      done(Number.isFinite(seconds) ? seconds * 1000 : 1);
    };
    video.onerror = () => done(1);
    video.src = url;
  });
}

/**
 * Complete, typed jsdom stand-ins for the browser MediaStream API (jsdom ships
 * none). Both classes IMPLEMENT the real lib.dom interfaces, so the code under
 * test receives genuine `MediaStream` / `MediaStreamTrack` values with no
 * casts, and a member the production code starts relying on fails type-check
 * here instead of passing a partial double silently.
 *
 * Behavior follows the spec where media-capture depends on it:
 * - `stop()` ends a track WITHOUT firing "ended" (browsers fire "ended" only
 *   for external termination) — `fireEnded()` models that termination.
 * - `stopCount` records every stop so exactly-once teardown is assertable.
 * - `clone()` returns an independent track; every clone is kept in `clones`.
 */

let fakeSeq = 0;

export interface FakeTrackInit {
  settings?: MediaTrackSettings;
  capabilities?: MediaTrackCapabilities;
}

export class FakeMediaStreamTrack
  extends EventTarget
  implements MediaStreamTrack
{
  contentHint = "";
  enabled = true;
  readonly id = `fake-track-${++fakeSeq}`;
  readonly kind: "audio" | "video";
  readonly label: string;
  muted = false;
  readyState: MediaStreamTrackState = "live";
  onended: ((this: MediaStreamTrack, ev: Event) => unknown) | null = null;
  onmute: ((this: MediaStreamTrack, ev: Event) => unknown) | null = null;
  onunmute: ((this: MediaStreamTrack, ev: Event) => unknown) | null = null;

  /** Number of `stop()` calls this track received. */
  stopCount = 0;
  /** Every `clone()` result, in creation order. */
  readonly clones: FakeMediaStreamTrack[] = [];

  private constraints: MediaTrackConstraints = {};
  private readonly init: FakeTrackInit;

  constructor(kind: "audio" | "video", init: FakeTrackInit = {}) {
    super();
    this.kind = kind;
    this.label = `fake ${kind} input`;
    this.init = init;
  }

  applyConstraints(constraints: MediaTrackConstraints = {}): Promise<void> {
    this.constraints = constraints;
    return Promise.resolve();
  }

  clone(): FakeMediaStreamTrack {
    const copy = new FakeMediaStreamTrack(this.kind, this.init);
    this.clones.push(copy);
    return copy;
  }

  getCapabilities(): MediaTrackCapabilities {
    return { ...(this.init.capabilities ?? {}) };
  }

  getConstraints(): MediaTrackConstraints {
    return { ...this.constraints };
  }

  getSettings(): MediaTrackSettings {
    return { ...(this.init.settings ?? {}) };
  }

  stop(): void {
    this.stopCount += 1;
    this.readyState = "ended";
  }

  /** External termination (device unplugged, OS revoke). */
  fireEnded(): void {
    this.readyState = "ended";
    const event = new Event("ended");
    this.onended?.call(this, event);
    this.dispatchEvent(new Event("ended"));
  }

  /** Transient OS interruption. */
  fireMute(): void {
    this.muted = true;
    this.onmute?.call(this, new Event("mute"));
    this.dispatchEvent(new Event("mute"));
  }

  fireUnmute(): void {
    this.muted = false;
    this.onunmute?.call(this, new Event("unmute"));
    this.dispatchEvent(new Event("unmute"));
  }
}

function isMediaStream(
  source: readonly MediaStreamTrack[] | MediaStream,
): source is MediaStream {
  return !Array.isArray(source);
}

export class FakeMediaStream extends EventTarget implements MediaStream {
  readonly id = `fake-stream-${++fakeSeq}`;
  onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => unknown) | null =
    null;
  onremovetrack:
    | ((this: MediaStream, ev: MediaStreamTrackEvent) => unknown)
    | null = null;

  private held: FakeMediaStreamTrack[] = [];

  constructor(source: readonly MediaStreamTrack[] | MediaStream = []) {
    super();
    const tracks = isMediaStream(source) ? source.getTracks() : source;
    for (const track of tracks) this.addTrack(track);
  }

  get active(): boolean {
    return this.held.some((t) => t.readyState === "live");
  }

  addTrack(track: MediaStreamTrack): void {
    if (!(track instanceof FakeMediaStreamTrack)) {
      throw new Error(
        "FakeMediaStream holds only FakeMediaStreamTrack instances — a real " +
          "track here means the test harness is wired wrong.",
      );
    }
    if (!this.held.includes(track)) this.held.push(track);
  }

  removeTrack(track: MediaStreamTrack): void {
    this.held = this.held.filter((t) => t !== track);
  }

  clone(): FakeMediaStream {
    return new FakeMediaStream(this.held.map((t) => t.clone()));
  }

  getTrackById(trackId: string): FakeMediaStreamTrack | null {
    return this.held.find((t) => t.id === trackId) ?? null;
  }

  getTracks(): FakeMediaStreamTrack[] {
    return [...this.held];
  }

  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.held.filter((t) => t.kind === "audio");
  }

  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.held.filter((t) => t.kind === "video");
  }
}

/** Install `FakeMediaStream` as the global `MediaStream` constructor (jsdom has none). */
export function installFakeMediaStreamGlobal(): void {
  Object.defineProperty(globalThis, "MediaStream", {
    configurable: true,
    writable: true,
    value: FakeMediaStream,
  });
}

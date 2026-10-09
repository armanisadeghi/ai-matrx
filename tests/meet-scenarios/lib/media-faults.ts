/**
 * MEDIA FAULTS — an init script that wraps the browser's own media APIs so a
 * scenario can deny camera / microphone / screen, or make a device vanish
 * mid-call, the way a person's browser would. Without a fault it delegates to
 * the real implementation (Chromium's fake camera and microphone), so the
 * happy path is untouched.
 *
 * Faults survive a reload: the initial set is baked into the init script and
 * runtime changes are mirrored into sessionStorage.
 */

export interface MediaFaults {
  denyCamera?: boolean;
  denyMicrophone?: boolean;
  /** The share picker is cancelled (Chromium reports NotAllowedError for both). */
  denyScreen?: boolean;
  /** The browser cannot share a screen at all (getDisplayMedia missing). */
  noScreenShare?: boolean;
}

declare global {
  interface Window {
    __meetHarness?: {
      faults: MediaFaults & { goneKinds: string[] };
      setFaults(next: Partial<MediaFaults>): void;
      unplug(kind: "audioinput" | "videoinput"): number;
      liveTrackCount(): number;
    };
  }
}

/** Runs in the page before any app script. Keep it dependency-free. */
export function mediaFaultsInit(initial: MediaFaults): void {
  const KEY = "__meetHarnessFaults";
  let stored: Partial<MediaFaults & { goneKinds: string[] }> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    stored = {};
  }
  const faults: MediaFaults & { goneKinds: string[] } = { goneKinds: [], ...initial, ...stored };
  const persist = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(faults));
    } catch {
      /* storage may be blocked; faults still apply to this document */
    }
  };
  const md = navigator.mediaDevices;
  if (!md) return;
  const live = new Set<MediaStreamTrack>();
  const nativeGUM = md.getUserMedia.bind(md);
  const nativeEnum = md.enumerateDevices.bind(md);
  const nativeGDM = md.getDisplayMedia ? md.getDisplayMedia.bind(md) : null;
  const denied = (what: string) =>
    new DOMException(`Permission denied (${what})`, "NotAllowedError");

  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    const wantsVideo = !!c?.video;
    const wantsAudio = !!c?.audio;
    if (wantsVideo && faults.denyCamera) throw denied("camera");
    if (wantsAudio && faults.denyMicrophone) throw denied("microphone");
    if (wantsVideo && faults.goneKinds.includes("videoinput"))
      throw new DOMException("Requested device not found", "NotFoundError");
    if (wantsAudio && faults.goneKinds.includes("audioinput"))
      throw new DOMException("Requested device not found", "NotFoundError");
    const stream = await nativeGUM(c);
    for (const t of stream.getTracks()) {
      live.add(t);
      t.addEventListener("ended", () => live.delete(t));
    }
    return stream;
  };
  md.enumerateDevices = async () => {
    const all = await nativeEnum();
    return all.filter((d) => !faults.goneKinds.includes(d.kind));
  };
  if (faults.noScreenShare) {
    (md as unknown as { getDisplayMedia?: unknown }).getDisplayMedia = undefined;
  } else if (nativeGDM) {
    md.getDisplayMedia = async (c?: DisplayMediaStreamOptions) => {
      if (faults.denyScreen) throw denied("screen");
      return nativeGDM(c);
    };
  }
  const perms = navigator.permissions;
  if (perms?.query) {
    const nativeQuery = perms.query.bind(perms);
    perms.query = (async (d: PermissionDescriptor) => {
      const name = d.name as string;
      if ((name === "camera" && faults.denyCamera) || (name === "microphone" && faults.denyMicrophone)) {
        return { state: "denied", name, onchange: null, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as unknown as PermissionStatus;
      }
      return nativeQuery(d);
    }) as Permissions["query"];
  }

  window.__meetHarness = {
    faults,
    setFaults(next) {
      Object.assign(faults, next);
      persist();
    },
    /** A device disappears: its live tracks end (as on unplug) and it leaves the device list. */
    unplug(kind) {
      if (!faults.goneKinds.includes(kind)) faults.goneKinds.push(kind);
      persist();
      const trackKind = kind === "audioinput" ? "audio" : "video";
      let ended = 0;
      for (const t of Array.from(live)) {
        if (t.kind !== trackKind || t.readyState === "ended") continue;
        t.stop();
        t.dispatchEvent(new Event("ended"));
        live.delete(t);
        ended += 1;
      }
      md.dispatchEvent(new Event("devicechange"));
      return ended;
    },
    liveTrackCount: () => live.size,
  };
}

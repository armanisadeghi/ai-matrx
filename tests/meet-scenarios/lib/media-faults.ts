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
      faults: MediaFaults & { goneKinds: string[]; goneIds: string[] };
      setFaults(next: Partial<MediaFaults>): void;
      unplug(kind: "audioinput" | "videoinput"): Promise<number>;
      liveTrackCount(): number;
    };
  }
}

/** Runs in the page before any app script. Keep it dependency-free. */
export function mediaFaultsInit(initial: MediaFaults): void {
  const KEY = "__meetHarnessFaults";
  let stored: Partial<MediaFaults & { goneKinds: string[]; goneIds: string[] }> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    stored = {};
  }
  const faults: MediaFaults & { goneKinds: string[]; goneIds: string[] } = { goneKinds: [], goneIds: [], ...initial, ...stored };
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
    for (const part of [c?.audio, c?.video]) {
      const want = typeof part === "object" && part !== null ? (part as MediaTrackConstraints).deviceId : undefined;
      const ids = typeof want === "string" ? [want] : Array.isArray(want) ? want : want && typeof want === "object" ? [(want as ConstrainDOMStringParameters).exact, (want as ConstrainDOMStringParameters).ideal].flat() : [];
      if (ids.some((id) => typeof id === "string" && faults.goneIds.includes(id)))
        throw new DOMException("Requested device not found", "NotFoundError");
    }
    const stream = await nativeGUM(c);
    for (const t of stream.getTracks()) {
      live.add(t);
      t.addEventListener("ended", () => live.delete(t));
    }
    return stream;
  };
  md.enumerateDevices = async () => {
    const all = await nativeEnum();
    return all.filter((d) => !faults.goneKinds.includes(d.kind) && !faults.goneIds.includes(d.deviceId));
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
    /**
     * A device disappears (headset unplugged). Only the device IN USE goes while another of that kind
     * remains, so the product can switch to it; when it was the last one of its kind, the kind is gone.
     * Its live tracks end and it leaves the device list. Returns how many live tracks ended.
     */
    async unplug(kind) {
      const trackKind = kind === "audioinput" ? "audio" : "video";
      const remaining = (await nativeEnum()).filter((d) => d.kind === kind && !faults.goneKinds.includes(kind) && !faults.goneIds.includes(d.deviceId));
      const inUse = Array.from(live)
        .filter((t) => t.kind === trackKind && t.readyState !== "ended")
        .map((t) => t.getSettings().deviceId)
        .filter((id): id is string => typeof id === "string");
      const goneNow = new Set<string>();
      if (remaining.length > 1) {
        const picked = remaining.find((d) => inUse.includes(d.deviceId)) ?? remaining[0]!;
        goneNow.add(picked.deviceId);
        // "default" is an alias of a real entry: that real one goes too (when others remain), so the switch lands on a different device.
        if (picked.deviceId === "default") {
          const alias = remaining.find((d) => d.deviceId !== "default" && d.groupId === picked.groupId);
          if (alias && remaining.length > 2) goneNow.add(alias.deviceId);
        }
        for (const id of goneNow) if (!faults.goneIds.includes(id)) faults.goneIds.push(id);
      } else if (!faults.goneKinds.includes(kind)) {
        faults.goneKinds.push(kind);
      }
      persist();
      let ended = 0;
      for (const t of Array.from(live)) {
        if (t.kind !== trackKind || t.readyState === "ended") continue;
        const id = t.getSettings().deviceId;
        if (goneNow.size > 0 && !(typeof id === "string" && goneNow.has(id))) continue;
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
